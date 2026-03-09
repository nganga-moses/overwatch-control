/**
 * WebRTC playback hook — direct P2P video stream for HITL mode.
 *
 * Adapted from Mission Control for Overwatch indoor operations.
 * Receives SDP offer and ICE candidates from the drone via the HITL
 * WebSocket (relayed through IPC), generates an SDP answer, and
 * establishes the peer connection.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import type { StreamStatus } from './useWhepStream';

interface UseWebRTCStreamReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: StreamStatus;
  latency_ms: number;
}

export function useWebRTCStream(
  droneId: string | null,
  enabled: boolean,
): UseWebRTCStreamReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [latencyMs, setLatencyMs] = useState(0);

  const cleanup = useCallback(() => {
    for (const fn of cleanupFnsRef.current) {
      try { fn(); } catch { /* ignore */ }
    }
    cleanupFnsRef.current = [];

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!droneId || !enabled) {
      cleanup();
      return;
    }

    const api = (window as unknown as Record<string, unknown>).electronAPI as Record<string, Record<string, (...args: unknown[]) => unknown>> | undefined;
    if (!api?.hitl) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');

    const unsubOffer = api.hitl.onVideoOffer((data: unknown) => {
      const { droneId: offerId, sdp } = data as { droneId: string; sdp: string };
      if (offerId !== droneId) return;
      handleOffer(sdp);
    }) as () => void;
    cleanupFnsRef.current.push(unsubOffer);

    const unsubIce = api.hitl.onIceCandidate((data: unknown) => {
      const { droneId: candidateId, candidate, sdpMid, sdpMlineIndex } = data as {
        droneId: string;
        candidate: string;
        sdpMid: string;
        sdpMlineIndex: number;
      };
      if (candidateId !== droneId) return;

      if (pcRef.current) {
        pcRef.current.addIceCandidate(
          new RTCIceCandidate({
            candidate,
            sdpMid,
            sdpMLineIndex: sdpMlineIndex,
          }),
        ).catch(console.error);
      }
    }) as () => void;
    cleanupFnsRef.current.push(unsubIce);

    async function handleOffer(sdp: string) {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      const iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
      ];
      const turnUrl = (window as unknown as Record<string, string | undefined>).__TURN_URL__;
      const turnUser = (window as unknown as Record<string, string | undefined>).__TURN_USER__;
      const turnCred = (window as unknown as Record<string, string | undefined>).__TURN_CREDENTIAL__;
      if (turnUrl) {
        iceServers.push({ urls: turnUrl, username: turnUser ?? '', credential: turnCred ?? '' });
      }

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus('streaming');
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && api?.hitl) {
          (api.hitl.sendIceCandidate as (...args: unknown[]) => void)(
            droneId,
            event.candidate.candidate,
            event.candidate.sdpMid ?? '',
            event.candidate.sdpMLineIndex ?? 0,
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          setStatus('error');
        } else if (pc.connectionState === 'disconnected') {
          setStatus('degraded');
        } else if (pc.connectionState === 'connected') {
          setStatus('streaming');
        }
      };

      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (api?.hitl) {
        (api.hitl.sendVideoAnswer as (...args: unknown[]) => void)(droneId, answer.sdp ?? '');
      }

      const latencyTimer = setInterval(async () => {
        if (pc.connectionState !== 'connected') return;
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              setLatencyMs(Math.round((report.jitter ?? 0) * 1000));
            }
          });
        } catch {
          // Non-fatal
        }
      }, 2000);
      cleanupFnsRef.current.push(() => clearInterval(latencyTimer));
    }

    return () => {
      cleanup();
    };
  }, [droneId, enabled, cleanup]);

  return { videoRef, status, latency_ms: latencyMs };
}
