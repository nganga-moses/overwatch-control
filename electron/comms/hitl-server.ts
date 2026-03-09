/**
 * Human-in-the-Loop (HITL) Server for Overwatch indoor operations.
 *
 * Adapted from Mission Control's HITLServer for indoor use cases:
 * - Manual drone repositioning within venue zones
 * - Emergency recall to nearest perch point
 * - Emergency detach (release grip and hover)
 * - Single-drone manual navigation through zones
 *
 * Maintains per-drone WebSocket sessions for direct control.
 */

import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';

export type HITLSessionStatus = 'connecting' | 'active' | 'handback_pending';

export type HITLConnectReason =
  | 'operator_takeover'
  | 'perch_failure'
  | 'signal_loss'
  | 'emergency_recall'
  | 'manual_reposition';

export interface HITLSession {
  droneId: string;
  callsign: string;
  status: HITLSessionStatus;
  reason: HITLConnectReason;
  startedAt: Date;
  ws: WebSocket;
  lastTelemetryAt: number;
  zoneId: string | null;
  perchPointId: string | null;
}

export interface HITLSessionInfo {
  droneId: string;
  callsign: string;
  status: HITLSessionStatus;
  reason: HITLConnectReason;
  startedAt: string;
  zoneId: string | null;
  perchPointId: string | null;
  latencyMs: number | null;
}

export interface HITLTelemetry {
  droneId: string;
  position: [number, number, number];
  batteryPercent: number;
  positionSource: string;
  slamQuality: number;
  zoneId: string | null;
  perchState: string | null;
}

export type HITLIndoorCommand =
  | { type: 'reposition'; targetZoneId: string; targetPerchId?: string }
  | { type: 'emergency_recall'; nearestPerchId: string }
  | { type: 'emergency_detach' }
  | { type: 'manual_nav'; waypoint: [number, number, number] }
  | { type: 'hold' }
  | { type: 'resume' }
  | { type: 'land' }
  | { type: 'handback' };

type AlertHandler = (session: HITLSessionInfo) => void;
type TelemetryHandler = (droneId: string, telemetry: HITLTelemetry) => void;
type SessionHandler = (info: HITLSessionInfo | null, event: 'started' | 'ended') => void;
type VideoOfferHandler = (droneId: string, sdp: string) => void;
type IceCandidateHandler = (droneId: string, candidate: string, sdpMid: string, sdpMlineIndex: number) => void;

interface HITLInboundMessage {
  type: string;
  payload: unknown;
}

const TELEMETRY_TIMEOUT_MS = 15_000;

export class HITLServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, HITLSession>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  private onAlert: AlertHandler | null = null;
  private onTelemetry: TelemetryHandler | null = null;
  private onSession: SessionHandler | null = null;
  private onVideoOffer: VideoOfferHandler | null = null;
  private onIceCandidate: IceCandidateHandler | null = null;

  constructor(
    private port: number,
    private authToken: string,
  ) {
    super();
  }

  setHandlers(
    onAlert: AlertHandler,
    onTelemetry: TelemetryHandler,
    onSession: SessionHandler,
  ): void {
    this.onAlert = onAlert;
    this.onTelemetry = onTelemetry;
    this.onSession = onSession;
  }

  setVideoHandlers(handlers: {
    onVideoOffer: VideoOfferHandler;
    onIceCandidate: IceCandidateHandler;
  }): void {
    this.onVideoOffer = handlers.onVideoOffer;
    this.onIceCandidate = handlers.onIceCandidate;
  }

  sendVideoAnswer(droneId: string, sdp: string): boolean {
    const session = this.sessions.get(droneId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) return false;

    try {
      session.ws.send(JSON.stringify({
        type: 'video_answer',
        payload: { drone_id: droneId, sdp },
      }));
      return true;
    } catch (err) {
      console.error(`[OW-HITL] Failed to send video answer to ${droneId}:`, err);
      return false;
    }
  }

  sendIceCandidate(droneId: string, candidate: string, sdpMid: string, sdpMlineIndex: number): boolean {
    const session = this.sessions.get(droneId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) return false;

    try {
      session.ws.send(JSON.stringify({
        type: 'ice_candidate',
        payload: { drone_id: droneId, candidate, sdp_mid: sdpMid, sdp_mline_index: sdpMlineIndex },
      }));
      return true;
    } catch (err) {
      console.error(`[OW-HITL] Failed to send ICE candidate to ${droneId}:`, err);
      return false;
    }
  }

  start(): void {
    if (this.wss) {
      console.warn('[OW-HITL] Already running, skipping start');
      return;
    }
    this.wss = new WebSocketServer({ port: this.port });
    console.log(`[OW-HITL] Server listening on port ${this.port}`);

    this.wss.on('connection', (ws, req) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (this.authToken && token !== this.authToken) {
        ws.close(4001, 'unauthorized');
        return;
      }

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('error', (err) => {
        console.error('[OW-HITL] WebSocket error:', err.message);
      });
    });

    this.healthCheckInterval = setInterval(() => this.checkSessionHealth(), TELEMETRY_TIMEOUT_MS / 2);
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    for (const [, session] of this.sessions) {
      session.ws.close(1000, 'server shutdown');
    }
    this.sessions.clear();
    this.wss?.close();
    this.wss = null;
  }

  sendCommand(droneId: string, command: HITLIndoorCommand): boolean {
    const session = this.sessions.get(droneId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      session.ws.send(JSON.stringify({ type: 'hitl_command', payload: command }));
      return true;
    } catch (err) {
      console.error(`[OW-HITL] Send to ${droneId} failed:`, err);
      return false;
    }
  }

  initiateHandback(droneId: string): boolean {
    const session = this.sessions.get(droneId);
    if (!session) return false;
    session.status = 'handback_pending';
    return this.sendCommand(droneId, { type: 'handback' });
  }

  getActiveSessions(): HITLSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this.toInfo(s));
  }

  getSession(droneId: string): HITLSessionInfo | null {
    const s = this.sessions.get(droneId);
    return s ? this.toInfo(s) : null;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private handleMessage(ws: WebSocket, data: WebSocket.RawData): void {
    let msg: HITLInboundMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'hitl_connect') {
      const payload = msg.payload as {
        drone_id: string;
        callsign: string;
        reason: HITLConnectReason;
        zone_id?: string;
        perch_point_id?: string;
      };

      const session: HITLSession = {
        droneId: payload.drone_id,
        callsign: payload.callsign,
        status: 'active',
        reason: payload.reason,
        startedAt: new Date(),
        ws,
        lastTelemetryAt: Date.now(),
        zoneId: payload.zone_id ?? null,
        perchPointId: payload.perch_point_id ?? null,
      };

      this.sessions.set(payload.drone_id, session);
      const info = this.toInfo(session);
      this.onAlert?.(info);
      this.onSession?.(info, 'started');
      console.log(`[OW-HITL] Session started: ${payload.drone_id} (${payload.reason})`);
      return;
    }

    if (msg.type === 'hitl_telemetry') {
      const payload = msg.payload as HITLTelemetry;
      const session = this.findSessionByWs(ws);
      if (session) {
        session.lastTelemetryAt = Date.now();
        session.zoneId = payload.zoneId;
      }
      this.onTelemetry?.(payload.droneId, payload);
      return;
    }

    if (msg.type === 'hitl_handback_ack') {
      const session = this.findSessionByWs(ws);
      if (session) {
        this.endSession(session.droneId);
      }
      return;
    }

    if (msg.type === 'video_offer') {
      const payload = msg.payload as { drone_id: string; sdp: string };
      this.onVideoOffer?.(payload.drone_id, payload.sdp);
      return;
    }

    if (msg.type === 'ice_candidate') {
      const payload = msg.payload as { drone_id: string; candidate: string; sdp_mid: string; sdp_mline_index: number };
      this.onIceCandidate?.(payload.drone_id, payload.candidate, payload.sdp_mid, payload.sdp_mline_index);
      return;
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    const session = this.findSessionByWs(ws);
    if (session) {
      this.endSession(session.droneId);
    }
  }

  private endSession(droneId: string): void {
    const session = this.sessions.get(droneId);
    if (!session) return;
    this.sessions.delete(droneId);
    this.onSession?.(this.toInfo(session), 'ended');
    console.log(`[OW-HITL] Session ended: ${droneId}`);
  }

  private findSessionByWs(ws: WebSocket): HITLSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.ws === ws) return session;
    }
    return undefined;
  }

  private checkSessionHealth(): void {
    const now = Date.now();
    for (const [droneId, session] of this.sessions) {
      if (now - session.lastTelemetryAt > TELEMETRY_TIMEOUT_MS) {
        console.warn(`[OW-HITL] Telemetry timeout for ${droneId}`);
        this.emit('telemetry-timeout', droneId);
      }
    }
  }

  private toInfo(s: HITLSession): HITLSessionInfo {
    return {
      droneId: s.droneId,
      callsign: s.callsign,
      status: s.status,
      reason: s.reason,
      startedAt: s.startedAt.toISOString(),
      zoneId: s.zoneId,
      perchPointId: s.perchPointId,
      latencyMs: s.lastTelemetryAt > 0 ? Date.now() - s.lastTelemetryAt : null,
    };
  }
}
