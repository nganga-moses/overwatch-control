/**
 * Communications Manager for Overwatch.
 *
 * Manages all live drone connections for indoor operations:
 * - SwarmServer for incoming swarm leader connections
 * - Mesh repeater health monitoring
 * - Tier-aware command routing (T1 indoor / T2 outdoor)
 * - Venue model push on drone connection
 * - Indoor telemetry forwarding to the Overwatch orchestrator
 *
 * Adapted from Mission Control's ConnectionManager with indoor-specific
 * features (no ADS-B, no DAA, adds mesh repeater + venue model push).
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { SwarmServer, type SwarmSession, type OWInboundMessage } from './swarm-server';
import type {
  VenueModelPayload,
  PerchCommandPayload,
  RepositionCommandPayload,
  IndoorTelemetryPayload,
  SwarmConnectionStatus,
} from '../../src/protocol/messages';

export interface CommsManagerConfig {
  swarmServerPort?: number;
  swarmAuthToken?: string;
  meshRepeaterCheckIntervalMs?: number;
  owId?: string;
}

interface MeshRepeater {
  id: string;
  address: string;
  signalStrength: number;
  lastSeenAt: number;
  bridgeHealth: 'healthy' | 'degraded' | 'offline';
}

export class CommsManager extends EventEmitter {
  private swarmServer: SwarmServer;
  private config: Required<CommsManagerConfig>;
  private mainWindow: BrowserWindow | null = null;
  private meshRepeaters = new Map<string, MeshRepeater>();
  private meshCheckInterval: ReturnType<typeof setInterval> | null = null;
  private pendingVenueModel: VenueModelPayload | null = null;

  constructor(config: CommsManagerConfig = {}) {
    super();
    this.config = {
      swarmServerPort: config.swarmServerPort ?? 9200,
      swarmAuthToken: config.swarmAuthToken ?? '',
      meshRepeaterCheckIntervalMs: config.meshRepeaterCheckIntervalMs ?? 10_000,
      owId: config.owId ?? 'overwatch-default',
    };

    this.swarmServer = new SwarmServer(
      this.config.swarmServerPort,
      this.config.swarmAuthToken,
    );

    this.swarmServer.setHandlers(
      (swarmId, session) => this.handleSwarmConnect(swarmId, session),
      (swarmId) => this.handleSwarmDisconnect(swarmId),
      (swarmId, message) => this.handleSwarmMessage(swarmId, message),
    );
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /** Set the venue model to push to drones on connection. */
  setVenueModel(model: VenueModelPayload): void {
    this.pendingVenueModel = model;
    for (const session of this.swarmServer.getAllSessions()) {
      this.swarmServer.sendVenueModel(session.swarmId, model);
    }
    console.log(`[OW-CommsManager] Venue model set: ${model.venueName} (${model.zones.length} zones)`);
  }

  start(): void {
    this.swarmServer.start();
    this.startMeshRepeaterCheck();
    console.log(`[OW-CommsManager] Started (server port: ${this.config.swarmServerPort})`);
  }

  stop(): void {
    if (this.meshCheckInterval) {
      clearInterval(this.meshCheckInterval);
      this.meshCheckInterval = null;
    }
    this.swarmServer.stop();
    console.log('[OW-CommsManager] Stopped');
  }

  // -----------------------------------------------------------------------
  // Outbound commands
  // -----------------------------------------------------------------------

  sendPerchCommand(swarmId: string, cmd: PerchCommandPayload): boolean {
    return this.swarmServer.sendPerchCommand(swarmId, cmd);
  }

  sendRepositionCommand(swarmId: string, cmd: RepositionCommandPayload): boolean {
    return this.swarmServer.sendRepositionCommand(swarmId, cmd);
  }

  sendSwarmCommand(swarmId: string, command: string, targetDroneId?: string, parameters?: unknown): boolean {
    return this.swarmServer.sendToSwarm(swarmId, {
      type: 'SwarmCommand',
      command,
      target_drone_id: targetDroneId,
      parameters,
    });
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  getSwarmStatus(swarmId: string): SwarmConnectionStatus | null {
    return this.swarmServer.getStatus(swarmId);
  }

  getAllSwarmStatuses(): SwarmConnectionStatus[] {
    return this.swarmServer.getAllSessions()
      .map((s) => this.swarmServer.getStatus(s.swarmId))
      .filter((s): s is SwarmConnectionStatus => s !== null);
  }

  getMemberDroneIds(swarmId: string): string[] {
    return this.swarmServer.getMemberDroneIds(swarmId);
  }

  getMeshRepeaters(): MeshRepeater[] {
    return Array.from(this.meshRepeaters.values());
  }

  // -----------------------------------------------------------------------
  // Internal: swarm event handlers
  // -----------------------------------------------------------------------

  private handleSwarmConnect(swarmId: string, session: SwarmSession): void {
    console.log(`[OW-CommsManager] Swarm connected: ${swarmId} (leader: ${session.leaderCallsign})`);

    if (this.pendingVenueModel) {
      this.swarmServer.sendVenueModel(swarmId, this.pendingVenueModel);
      console.log(`[OW-CommsManager] Pushed venue model to ${swarmId}`);
    }

    this.emit('swarm-connect', swarmId, session);

    this.mainWindow?.webContents.send('ow-swarm-connection', {
      event: 'connected',
      swarmId,
      leaderCallsign: session.leaderCallsign,
      memberCount: session.memberCount,
    });
  }

  private handleSwarmDisconnect(swarmId: string): void {
    console.log(`[OW-CommsManager] Swarm disconnected: ${swarmId}`);
    this.emit('swarm-disconnect', swarmId);

    this.mainWindow?.webContents.send('ow-swarm-connection', {
      event: 'disconnected',
      swarmId,
    });
  }

  private handleSwarmMessage(swarmId: string, message: OWInboundMessage): void {
    switch (message.type) {
      case 'indoorTelemetry':
        this.emit('indoor-telemetry', swarmId, message.payload);
        this.mainWindow?.webContents.send('ow-indoor-telemetry', {
          swarmId,
          ...message.payload,
        });
        break;

      case 'slamMapUpdate':
        this.emit('slam-map-update', swarmId, message.payload);
        break;

      case 'perchResult':
        this.emit('perch-result', swarmId, message.payload);
        this.mainWindow?.webContents.send('ow-perch-result', {
          swarmId,
          ...message.payload,
        });
        break;

      case 'safetyEvent':
        this.emit('safety-event', swarmId, message.payload);
        this.mainWindow?.webContents.send('ow-safety-event', {
          swarmId,
          ...message.payload as object,
        });
        break;

      case 'heartbeat':
        this.emit('heartbeat', swarmId, message.payload);
        break;

      case 'streamStarted':
        this.emit('stream-started', swarmId, message.payload);
        this.mainWindow?.webContents.send('ow-stream-started', {
          swarmId,
          ...message.payload,
        });
        break;

      case 'streamStopped':
        this.emit('stream-stopped', swarmId, message.payload);
        this.mainWindow?.webContents.send('ow-stream-stopped', {
          swarmId,
          ...message.payload,
        });
        break;

      case 'streamError':
        this.emit('stream-error', swarmId, message.payload);
        this.mainWindow?.webContents.send('ow-stream-error', {
          swarmId,
          ...message.payload,
        });
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: mesh repeater management
  // -----------------------------------------------------------------------

  private startMeshRepeaterCheck(): void {
    this.meshCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, repeater] of this.meshRepeaters) {
        const age = now - repeater.lastSeenAt;
        if (age > 30_000 && repeater.bridgeHealth !== 'offline') {
          repeater.bridgeHealth = 'offline';
          console.warn(`[OW-CommsManager] Mesh repeater ${id} went offline`);
          this.emit('mesh-repeater-offline', id);
        } else if (age > 15_000 && repeater.bridgeHealth === 'healthy') {
          repeater.bridgeHealth = 'degraded';
          console.warn(`[OW-CommsManager] Mesh repeater ${id} degraded`);
        }
      }
    }, this.config.meshRepeaterCheckIntervalMs);
  }

  /** Register a mesh repeater discovered on the network. */
  registerMeshRepeater(id: string, address: string): void {
    this.meshRepeaters.set(id, {
      id,
      address,
      signalStrength: 100,
      lastSeenAt: Date.now(),
      bridgeHealth: 'healthy',
    });
    console.log(`[OW-CommsManager] Mesh repeater registered: ${id} (${address})`);
  }

  /** Update repeater signal (called from heartbeat). */
  updateMeshRepeater(id: string, signalStrength: number): void {
    const repeater = this.meshRepeaters.get(id);
    if (repeater) {
      repeater.signalStrength = signalStrength;
      repeater.lastSeenAt = Date.now();
      repeater.bridgeHealth = signalStrength > 50 ? 'healthy' : 'degraded';
    }
  }
}
