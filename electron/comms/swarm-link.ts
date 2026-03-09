/**
 * WebSocket client for a single swarm leader connection (Overwatch variant).
 *
 * Adapted from Mission Control's SwarmLink for indoor operations.
 * Manages lifecycle: connect, authenticate, heartbeat, reconnect with
 * exponential backoff, and disconnect.
 */

import WebSocket from 'ws';
import type {
  ConnectionState,
  SwarmConnectionStatus,
  GSHeartbeat,
  VenueModelPayload,
  PerchCommandPayload,
  RepositionCommandPayload,
  IndoorTelemetryPayload,
  SlamMapUpdatePayload,
} from '../../src/protocol/messages';

export interface SwarmLinkConfig {
  swarmId: string;
  url: string;
  authToken: string;
  heartbeatIntervalMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  maxReconnectAttempts?: number;
}

export type InboundGSMessage =
  | { type: 'Heartbeat'; payload: GSHeartbeat }
  | { type: 'IndoorTelemetry'; payload: IndoorTelemetryPayload }
  | { type: 'SlamMapUpdate'; payload: SlamMapUpdatePayload }
  | { type: 'PerchResult'; payload: { droneId: string; perchPointId: string; success: boolean; surfaceType: string; attemptDurationMs: number } }
  | { type: 'SafetyEvent'; payload: unknown };

export type OutboundGSMessage =
  | { type: 'HeartbeatAck'; mc_id: string; mc_uptime_s: number }
  | { type: 'VenueModel'; payload: VenueModelPayload }
  | { type: 'PerchCommand'; payload: PerchCommandPayload }
  | { type: 'RepositionCommand'; payload: RepositionCommandPayload }
  | { type: 'SwarmCommand'; command: string; target_drone_id?: string; parameters?: unknown };

type MessageHandler = (message: InboundGSMessage) => void;
type StatusHandler = (status: SwarmConnectionStatus) => void;

const DEFAULT_HEARTBEAT_MS = 5000;
const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 30000;
const DEFAULT_MAX_RECONNECT = 50;

export class SwarmLink {
  private ws: WebSocket | null = null;
  private config: Required<SwarmLinkConfig>;
  private state: ConnectionState = 'disconnected';
  private leaderCallsign: string | null = null;
  private memberCount = 0;
  private meshQuality = 0;
  private reconnectCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectedAt: string | null = null;
  private intentionalClose = false;

  private onMessage: MessageHandler | null = null;
  private onStatusChange: StatusHandler | null = null;

  constructor(config: SwarmLinkConfig) {
    this.config = {
      heartbeatIntervalMs: DEFAULT_HEARTBEAT_MS,
      reconnectBaseMs: DEFAULT_RECONNECT_BASE_MS,
      reconnectMaxMs: DEFAULT_RECONNECT_MAX_MS,
      maxReconnectAttempts: DEFAULT_MAX_RECONNECT,
      ...config,
    };
  }

  setHandlers(onMessage: MessageHandler, onStatusChange: StatusHandler): void {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  connect(): void {
    this.intentionalClose = false;
    this.setState('connecting');
    this.createSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.setState('disconnected');
  }

  send(message: OutboundGSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[OW-SwarmLink:${this.config.swarmId}] Cannot send — not connected`);
      return;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      console.error(`[OW-SwarmLink:${this.config.swarmId}] Send error:`, err);
    }
  }

  sendVenueModel(model: VenueModelPayload): void {
    this.send({ type: 'VenueModel', payload: model });
  }

  sendPerchCommand(cmd: PerchCommandPayload): void {
    this.send({ type: 'PerchCommand', payload: cmd });
  }

  sendRepositionCommand(cmd: RepositionCommandPayload): void {
    this.send({ type: 'RepositionCommand', payload: cmd });
  }

  getStatus(): SwarmConnectionStatus {
    return {
      swarmId: this.config.swarmId,
      state: this.state,
      leaderCallsign: this.leaderCallsign,
      memberCount: this.memberCount,
      meshQuality: this.meshQuality,
      connectedAt: this.connectedAt,
    };
  }

  get swarmId(): string {
    return this.config.swarmId;
  }

  get isConnected(): boolean {
    return this.state === 'connected';
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private createSocket(): void {
    try {
      this.ws = new WebSocket(this.config.url, {
        headers: { Authorization: `Bearer ${this.config.authToken}` },
      });

      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
      this.ws.on('error', (err) => this.handleError(err));
    } catch (err) {
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    this.reconnectCount = 0;
    this.connectedAt = new Date().toISOString();
    this.setState('connected');
    this.startHeartbeat();
  }

  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as InboundGSMessage;

      if (message.type === 'Heartbeat') {
        const hb = message.payload;
        this.leaderCallsign = hb.leader_callsign;
        this.memberCount = hb.member_count;
        this.meshQuality = hb.mesh_quality;
      }

      this.onMessage?.(message);
    } catch (err) {
      console.error(`[OW-SwarmLink:${this.config.swarmId}] Failed to parse message:`, err);
    }
  }

  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    if (this.intentionalClose) {
      this.setState('disconnected');
      return;
    }
    console.warn(`[OW-SwarmLink:${this.config.swarmId}] Connection closed: ${code} ${reason}`);
    this.scheduleReconnect();
  }

  private handleError(err: Error): void {
    console.error(`[OW-SwarmLink:${this.config.swarmId}] WebSocket error:`, err.message);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectCount >= this.config.maxReconnectAttempts) {
      this.setState('error');
      return;
    }

    this.setState('connecting');
    const delay = Math.min(
      this.config.reconnectBaseMs * Math.pow(2, this.reconnectCount),
      this.config.reconnectMaxMs,
    );
    this.reconnectCount++;

    console.log(`[OW-SwarmLink:${this.config.swarmId}] Reconnecting in ${delay}ms (attempt ${this.reconnectCount})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createSocket();
    }, delay);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.onStatusChange?.(this.getStatus());
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'intentional disconnect');
      }
      this.ws = null;
    }
  }
}
