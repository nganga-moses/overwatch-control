/**
 * WHEP client hook — connects to a drone's video stream via the media relay.
 *
 * Adapted from Mission Control for Overwatch indoor operations.
 * Uses the Overwatch MediaRelay (port 9889) for WHEP endpoints.
 *
 * Lifecycle:
 *   1. On mount with droneId: requests stream via preload API, connects to WHEP
 *   2. On droneId change: tears down old stream, starts new one
 *   3. On unmount: releases stream and closes RTCPeerConnection
 *
 * Falls back to a synthetic canvas feed in simulation mode (no preload API).
 */

import { useRef, useState, useEffect, useCallback } from 'react';

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'degraded' | 'error';

export interface StreamQuality {
  resolution: string;
  bitrate_kbps: number;
  latency_ms: number;
}

interface UseWhepStreamReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  status: StreamStatus;
  quality: StreamQuality;
  error: string | null;
  isSimulation: boolean;
}

const INITIAL_QUALITY: StreamQuality = { resolution: '', bitrate_kbps: 0, latency_ms: 0 };
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
const QUALITY_POLL_INTERVAL_MS = 2000;
const SIM_FEED_INTERVAL_MS = 100;

export function useWhepStream(droneId: string | null): UseWhepStreamReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const qualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [quality, setQuality] = useState<StreamQuality>(INITIAL_QUALITY);
  const [error, setError] = useState<string | null>(null);

  const isSimulation = typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).electronAPI;

  const cleanup = useCallback(() => {
    if (qualityTimerRef.current) {
      clearInterval(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
    if (animFrameRef.current) {
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  const startSimulationFeed = useCallback(
    (id: string) => {
      setStatus('streaming');
      setQuality({ resolution: '480p', bitrate_kbps: 0, latency_ms: 0 });

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 640;
      canvas.height = 360;

      const draw = () => {
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#3b82f644';
        ctx.lineWidth = 1;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 40, cy);
        ctx.lineTo(cx + 40, cy);
        ctx.moveTo(cx, cy - 40);
        ctx.lineTo(cx, cy + 40);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#3b82f6';
        ctx.font = '14px monospace';
        ctx.fillText(id, 10, 24);

        const now = new Date();
        ctx.fillText(now.toISOString().slice(11, 23), 10, canvas.height - 10);

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('SIM', canvas.width - 40, 20);

        animFrameRef.current = window.setTimeout(draw, SIM_FEED_INTERVAL_MS) as unknown as number;
      };

      draw();
    },
    [],
  );

  const connectWhep = useCallback(
    async (id: string) => {
      const api = (window as unknown as Record<string, unknown>).electronAPI as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> | undefined;
      if (!api?.streaming) return;

      setStatus('connecting');
      setError(null);

      try {
        await api.streaming.requestStream(id, 'preview');
        const whepUrl = (await api.streaming.getWhepUrl(id)) as string;

        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
        if (qualityTimerRef.current) {
          clearInterval(qualityTimerRef.current);
          qualityTimerRef.current = null;
        }

        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        let prevBytesReceived = 0;
        let prevTimestamp = Date.now();

        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            setStatus('streaming');
            reconnectAttemptsRef.current = 0;
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') {
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttemptsRef.current++;
              setTimeout(() => connectWhep(id), RECONNECT_DELAY_MS);
            } else {
              setStatus('error');
              setError('Connection failed after retries');
            }
          } else if (pc.connectionState === 'disconnected') {
            setStatus('degraded');
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const response = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        });

        if (!response.ok) {
          throw new Error(`WHEP endpoint returned ${response.status}`);
        }

        const answerSdp = await response.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        qualityTimerRef.current = setInterval(async () => {
          if (pc.connectionState !== 'connected') return;
          try {
            const stats = await pc.getStats();
            stats.forEach((report) => {
              if (report.type === 'inbound-rtp' && report.kind === 'video') {
                const now = Date.now();
                const elapsed = Math.max(1, (now - prevTimestamp) / 1000);
                const bytesReceived = report.bytesReceived ?? 0;
                const deltaBytes = bytesReceived - prevBytesReceived;
                prevBytesReceived = bytesReceived;
                prevTimestamp = now;
                setQuality({
                  resolution: `${report.frameWidth ?? 0}x${report.frameHeight ?? 0}`,
                  bitrate_kbps: Math.round((deltaBytes * 8) / 1000 / elapsed),
                  latency_ms: Math.round((report.jitterBufferDelay ?? report.jitter ?? 0) * 1000),
                });
              }
            });
          } catch {
            // Stats collection failure is non-fatal
          }
        }, QUALITY_POLL_INTERVAL_MS);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  useEffect(() => {
    if (!droneId) {
      cleanup();
      setStatus('idle');
      setQuality(INITIAL_QUALITY);
      setError(null);
      return;
    }

    if (isSimulation) {
      startSimulationFeed(droneId);
    } else {
      connectWhep(droneId);
    }

    return () => {
      cleanup();

      if (!isSimulation && droneId) {
        const api = (window as unknown as Record<string, unknown>).electronAPI as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> | undefined;
        api?.streaming?.releaseStream(droneId).catch(() => {});
      }
    };
  }, [droneId, isSimulation, cleanup, connectWhep, startSimulationFeed]);

  return { videoRef, canvasRef, status, quality, error, isSimulation };
}
