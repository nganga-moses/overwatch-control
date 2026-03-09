/**
 * WebSocket server for swarm leaders connecting to Overwatch.
 *
 * Adapted from Mission Control's SwarmServer for indoor operations.
 * Translates between the GS wire protocol (fireflyos-squad) and
 * Overwatch's internal OWMessage types.
 */

import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';
import type {
  GSHeartbeat,
  ConnectionState,
  SwarmConnectionStatus,
  IndoorTelemetryPayload,
  SlamMapUpdatePayload,
  VenueModelPayload,
  PerchCommandPayload,
  RepositionCommandPayload,
} from '../../src/protocol/messages';

export interface SwarmSession {
  swarmId: string;
  leaderCallsign: string;
  leaderId: string;
  ws: WebSocket;
  state: ConnectionState;
  connectedAt: Date;
  lastHeartbeatAt: number;
  memberCount: number;
  sequence: number;
  meshQuality: number;
  reconnectCount: number;
  memberDroneIds: string[];
}

type SwarmConnectHandler = (swarmId: string, session: SwarmSession) => void;
type SwarmDisconnectHandler = (swarmId: string) => void;
type SwarmMessageHandler = (swarmId: string, message: OWInboundMessage) => void;

export interface StreamStartedPayload {
  drone_id: string;
  mode: string;
  resolution: string;
  bitrate_kbps: number;
  rtsp_url: string | null;
}

export interface StreamStoppedPayload {
  drone_id: string;
}

export interface StreamErrorPayload {
  drone_id: string;
  reason: string;
}

export type OWInboundMessage =
  | { type: 'indoorTelemetry'; payload: IndoorTelemetryPayload }
  | { type: 'slamMapUpdate'; payload: SlamMapUpdatePayload }
  | { type: 'perchResult'; payload: { droneId: string; perchPointId: string; success: boolean; surfaceType: string; attemptDurationMs: number } }
  | { type: 'safetyEvent'; payload: unknown }
  | { type: 'heartbeat'; payload: { leaderCallsign: string; memberCount: number; meshQuality: number } }
  | { type: 'streamStarted'; payload: StreamStartedPayload }
  | { type: 'streamStopped'; payload: StreamStoppedPayload }
  | { type: 'streamError'; payload: StreamErrorPayload };

interface GSInboundMessage {
  type: string;
  [key: string]: unknown;
}

const HEARTBEAT_TIMEOUT_MS = 30_000;

export class SwarmServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, SwarmSession>();
  private heartbeatCheckInterval: ReturnType<typeof setInterval> | null = null;

  private onSwarmConnect: SwarmConnectHandler | null = null;
  private onSwarmDisconnect: SwarmDisconnectHandler | null = null;
  private onSwarmMessage: SwarmMessageHandler | null = null;

  constructor(
    private port: number,
    private authToken: string,
  ) {
    super();
  }

  setHandlers(
    onConnect: SwarmConnectHandler,
    onDisconnect: SwarmDisconnectHandler,
    onMessage: SwarmMessageHandler,
  ): void {
    this.onSwarmConnect = onConnect;
    this.onSwarmDisconnect = onDisconnect;
    this.onSwarmMessage = onMessage;
  }

  start(): void {
    if (this.wss) {
      console.warn('[OW-SwarmServer] Already running, skipping start');
      return;
    }
    this.wss = new WebSocketServer({ port: this.port });
    console.log(`[OW-SwarmServer] Listening on port ${this.port}`);

    this.wss.on('connection', (ws, req) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (this.authToken && token !== this.authToken) {
        console.warn('[OW-SwarmServer] Rejected unauthenticated connection');
        ws.close(4001, 'unauthorized');
        return;
      }

      const sessionId = `pending-${Date.now()}`;
      const session: SwarmSession = {
        swarmId: sessionId,
        leaderCallsign: 'unknown',
        leaderId: '',
        ws,
        state: 'connected',
        connectedAt: new Date(),
        lastHeartbeatAt: Date.now(),
        memberCount: 0,
        sequence: 0,
        meshQuality: 1.0,
        reconnectCount: 0,
        memberDroneIds: [],
      };

      ws.on('message', (data) => this.handleInbound(session, data));
      ws.on('close', () => this.handleDisconnect(session));
      ws.on('error', (err) => {
        console.error(`[OW-SwarmServer] WebSocket error for ${session.swarmId}:`, err.message);
      });
    });

    this.heartbeatCheckInterval = setInterval(() => this.checkHeartbeats(), HEARTBEAT_TIMEOUT_MS / 2);
  }

  stop(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
    for (const [, session] of this.sessions) {
      session.ws.close(1000, 'server shutdown');
    }
    this.sessions.clear();
    this.wss?.close();
    this.wss = null;
  }

  sendToSwarm(swarmId: string, message: object): boolean {
    const session = this.sessions.get(swarmId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      session.ws.send(JSON.stringify(message));
      session.sequence++;
      return true;
    } catch (err) {
      console.error(`[OW-SwarmServer] Send to ${swarmId} failed:`, err);
      return false;
    }
  }

  sendVenueModel(swarmId: string, model: VenueModelPayload): boolean {
    return this.sendToSwarm(swarmId, { type: 'VenueModel', ...model });
  }

  sendPerchCommand(swarmId: string, cmd: PerchCommandPayload): boolean {
    return this.sendToSwarm(swarmId, { type: 'PerchCommand', ...cmd });
  }

  sendRepositionCommand(swarmId: string, cmd: RepositionCommandPayload): boolean {
    return this.sendToSwarm(swarmId, { type: 'RepositionCommand', ...cmd });
  }

  sendStartStream(swarmId: string, payload: {
    drone_id: string;
    mode: string;
    resolution: string;
    max_bitrate_kbps: number;
    overlay: boolean;
  }): boolean {
    return this.sendToSwarm(swarmId, { type: 'StartStream', ...payload });
  }

  sendStopStream(swarmId: string, payload: { drone_id: string }): boolean {
    return this.sendToSwarm(swarmId, { type: 'StopStream', ...payload });
  }

  sendSetBitrate(swarmId: string, payload: { drone_id: string; target_kbps: number }): boolean {
    return this.sendToSwarm(swarmId, { type: 'SetBitrate', ...payload });
  }

  sendSetResolution(swarmId: string, payload: { drone_id: string; resolution: string }): boolean {
    return this.sendToSwarm(swarmId, { type: 'SetResolution', ...payload });
  }

  getSession(swarmId: string): SwarmSession | undefined {
    return this.sessions.get(swarmId);
  }

  getAllSessions(): SwarmSession[] {
    return Array.from(this.sessions.values());
  }

  getMemberDroneIds(swarmId: string): string[] {
    const session = this.sessions.get(swarmId);
    if (!session) return [];
    if (session.memberDroneIds.length > 0) return session.memberDroneIds;
    return session.leaderId ? [session.leaderId] : [];
  }

  getStatus(swarmId: string): SwarmConnectionStatus | null {
    const session = this.sessions.get(swarmId);
    if (!session) return null;
    return {
      swarmId: session.swarmId,
      state: session.state,
      leaderCallsign: session.leaderCallsign,
      memberCount: session.memberCount,
      meshQuality: session.meshQuality,
      connectedAt: session.connectedAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private handleInbound(session: SwarmSession, data: WebSocket.RawData): void {
    let raw: GSInboundMessage;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      console.warn('[OW-SwarmServer] Failed to parse inbound message');
      return;
    }

    if (raw.type === 'Heartbeat') {
      const hb = raw as unknown as { type: string } & GSHeartbeat;
      session.lastHeartbeatAt = Date.now();
      session.leaderCallsign = hb.leader_callsign;
      session.memberCount = hb.member_count;
      session.meshQuality = hb.mesh_quality ?? session.meshQuality;
      if (Array.isArray((hb as Record<string, unknown>).member_ids)) {
        session.memberDroneIds = (hb as Record<string, unknown>).member_ids as string[];
      }

      const currentSwarmId = session.swarmId;
      const swarmId = currentSwarmId.startsWith('pending-')
        ? (hb.swarm_id ?? `swarm-${hb.leader_callsign}`)
        : currentSwarmId;

      if (swarmId !== currentSwarmId) {
        this.sessions.delete(currentSwarmId);
        session.swarmId = swarmId;
        session.leaderId = String(hb.leader_id);
        this.sessions.set(swarmId, session);
        this.onSwarmConnect?.(swarmId, session);
        console.log(`[OW-SwarmServer] Swarm connected: ${swarmId} (leader: ${hb.leader_callsign}, members: ${hb.member_count})`);
      }

      session.ws.send(JSON.stringify({
        type: 'HeartbeatAck',
        mc_id: 'overwatch',
        mc_uptime_s: Math.floor(process.uptime()),
      }));

      this.onSwarmMessage?.(swarmId, {
        type: 'heartbeat',
        payload: {
          leaderCallsign: hb.leader_callsign,
          memberCount: hb.member_count,
          meshQuality: hb.mesh_quality,
        },
      });
      return;
    }

    if (raw.type === 'IndoorTelemetry') {
      const payload = raw as unknown as { type: string } & IndoorTelemetryPayload;
      this.onSwarmMessage?.(session.swarmId, {
        type: 'indoorTelemetry',
        payload,
      });
      return;
    }

    if (raw.type === 'SlamMapUpdate') {
      const payload = raw as unknown as { type: string } & SlamMapUpdatePayload;
      this.onSwarmMessage?.(session.swarmId, {
        type: 'slamMapUpdate',
        payload,
      });
      return;
    }

    if (raw.type === 'SafetyEvent') {
      this.onSwarmMessage?.(session.swarmId, { type: 'safetyEvent', payload: raw });
      return;
    }

    if (raw.type === 'StreamStarted') {
      this.onSwarmMessage?.(session.swarmId, {
        type: 'streamStarted',
        payload: {
          drone_id: raw.drone_id as string,
          mode: raw.mode as string,
          resolution: raw.resolution as string,
          bitrate_kbps: raw.bitrate_kbps as number,
          rtsp_url: (raw.rtsp_url as string | null) ?? null,
        },
      });
      return;
    }

    if (raw.type === 'StreamStopped') {
      this.onSwarmMessage?.(session.swarmId, {
        type: 'streamStopped',
        payload: { drone_id: raw.drone_id as string },
      });
      return;
    }

    if (raw.type === 'StreamError') {
      this.onSwarmMessage?.(session.swarmId, {
        type: 'streamError',
        payload: {
          drone_id: raw.drone_id as string,
          reason: raw.reason as string,
        },
      });
      return;
    }

    console.debug(`[OW-SwarmServer] Unhandled GS message type: ${raw.type}`);
  }

  private handleDisconnect(session: SwarmSession): void {
    const swarmId = session.swarmId;
    session.state = 'disconnected';
    this.sessions.delete(swarmId);
    if (!swarmId.startsWith('pending-')) {
      this.onSwarmDisconnect?.(swarmId);
      console.log(`[OW-SwarmServer] Swarm disconnected: ${swarmId}`);
    }
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [swarmId, session] of this.sessions) {
      if (now - session.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
        console.warn(`[OW-SwarmServer] Heartbeat timeout for ${swarmId}, closing`);
        session.ws.close(4002, 'heartbeat timeout');
      }
    }
  }
}
