/**
 * StreamManager for Overwatch — coordinates video stream lifecycle.
 *
 * Adapted from Mission Control's StreamManager for indoor operations.
 * Indoor drones typically have lower-res cameras and shorter ranges,
 * so defaults are tuned for indoor conditions.
 *
 * Stream limits:
 *   - Max 4 concurrent preview streams (indoor swarms are smaller)
 *   - Max 1 HITL stream
 *   - Max 8 feed-grid tiles
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';

export type VideoStreamMode = 'preview' | 'hitl';
export type VideoResolution = '360p' | '480p' | '720p' | '1080p';
export type StreamModeInternal = 'preview' | 'hitl' | 'feedgrid';

export interface ActiveStream {
  droneId: string;
  mode: StreamModeInternal;
  resolution: VideoResolution;
  bitrate_kbps: number;
  startedAt: number;
  bytesReceived: number;
  whepUrl: string;
}

export type StreamEventType =
  | 'stream:started'
  | 'stream:stopped'
  | 'stream:error'
  | 'stream:quality-changed';

export interface StreamEvent {
  type: StreamEventType;
  droneId: string;
  data?: Record<string, unknown>;
}

export interface StartStreamPayload {
  drone_id: string;
  mode: VideoStreamMode;
  resolution: VideoResolution;
  max_bitrate_kbps: number;
  overlay: boolean;
}

export interface StopStreamPayload {
  drone_id: string;
}

export interface SetBitratePayload {
  drone_id: string;
  target_kbps: number;
}

export interface SetResolutionPayload {
  drone_id: string;
  resolution: VideoResolution;
}

export interface StreamStartedPayload {
  drone_id: string;
  mode: VideoStreamMode;
  resolution: VideoResolution;
  bitrate_kbps: number;
  rtsp_url: string | null;
}

const MAX_PREVIEW_STREAMS = 4;
const MAX_HITL_STREAMS = 1;
const MAX_FEEDGRID_TILES = 8;
const FEEDGRID_BANDWIDTH_CEILING_KBPS = 4000;
const FEEDGRID_MIN_BITRATE_KBPS = 250;
const FEEDGRID_STAGGER_MS = 50;
const WHEP_BASE_URL = 'http://localhost:9889';

export class StreamManager extends EventEmitter {
  private activeStreams = new Map<string, ActiveStream>();
  private mainWindow: BrowserWindow | null = null;

  private sendToSwarm: ((swarmId: string, msg: unknown) => void) | null = null;
  private sendHITLCommand: ((droneId: string, msg: unknown) => void) | null = null;
  private getSwarmMembers: ((swarmId: string) => string[]) | null = null;
  private getConnectedSwarmIds: (() => string[]) | null = null;

  constructor() {
    super();
  }

  init(opts: {
    mainWindow: BrowserWindow;
    sendToSwarm: (swarmId: string, msg: unknown) => void;
    sendHITLCommand: (droneId: string, msg: unknown) => void;
    getSwarmMembers: (swarmId: string) => string[];
    getConnectedSwarmIds: () => string[];
  }): void {
    this.mainWindow = opts.mainWindow;
    this.sendToSwarm = opts.sendToSwarm;
    this.sendHITLCommand = opts.sendHITLCommand;
    this.getSwarmMembers = opts.getSwarmMembers;
    this.getConnectedSwarmIds = opts.getConnectedSwarmIds;
  }

  private resolveSwarmForDrone(droneId: string): string | null {
    if (!this.getConnectedSwarmIds || !this.getSwarmMembers) return null;
    for (const swarmId of this.getConnectedSwarmIds()) {
      if (this.getSwarmMembers(swarmId).includes(droneId)) return swarmId;
    }
    return this.getConnectedSwarmIds()[0] ?? null;
  }

  async requestStream(droneId: string, mode: VideoStreamMode): Promise<void> {
    if (mode === 'hitl') {
      await this.requestHITLStream(droneId);
    } else {
      await this.requestPreviewStream(droneId);
    }
  }

  async releaseStream(droneId: string): Promise<void> {
    const stream = this.activeStreams.get(droneId);
    if (!stream) return;

    this.sendStopCommand(droneId);
    this.activeStreams.delete(droneId);
    this.emitToRenderer({ type: 'stream:stopped', droneId });
  }

  async requestFeedGrid(swarmId: string): Promise<void> {
    if (!this.getSwarmMembers) return;

    const previewDrones = [...this.activeStreams.entries()]
      .filter(([, s]) => s.mode === 'preview')
      .map(([id]) => id);

    for (const droneId of previewDrones) {
      await this.releaseStream(droneId);
    }

    const members = this.getSwarmMembers(swarmId);
    const count = Math.min(members.length, MAX_FEEDGRID_TILES);
    const perTileBitrate = Math.max(
      FEEDGRID_MIN_BITRATE_KBPS,
      Math.floor(FEEDGRID_BANDWIDTH_CEILING_KBPS / count),
    );
    const resolution: VideoResolution = count >= 4 ? '360p' : '480p';

    for (let i = 0; i < count; i++) {
      const droneId = members[i];

      this.activeStreams.set(droneId, {
        droneId,
        mode: 'feedgrid',
        resolution,
        bitrate_kbps: perTileBitrate,
        startedAt: Date.now(),
        bytesReceived: 0,
        whepUrl: `${WHEP_BASE_URL}/${droneId}/whep`,
      });

      this.sendStartCommand(droneId, 'preview', resolution, perTileBitrate);

      if (i < count - 1) {
        await sleep(FEEDGRID_STAGGER_MS);
      }
    }
  }

  async releaseFeedGrid(): Promise<void> {
    const feedgridDrones = [...this.activeStreams.entries()]
      .filter(([, s]) => s.mode === 'feedgrid')
      .map(([id]) => id);

    for (const droneId of feedgridDrones) {
      this.sendStopCommand(droneId);
      this.activeStreams.delete(droneId);
      this.emitToRenderer({ type: 'stream:stopped', droneId });
    }
  }

  getActiveStreams(): ActiveStream[] {
    return [...this.activeStreams.values()];
  }

  getWhepUrl(droneId: string): string {
    return `${WHEP_BASE_URL}/${droneId}/whep`;
  }

  async upgradeTile(droneId: string): Promise<void> {
    const stream = this.activeStreams.get(droneId);
    if (!stream || stream.mode !== 'feedgrid') return;

    this.sendBitrateCommand(droneId, 1500);
    this.sendResolutionCommand(droneId, '720p');
    stream.bitrate_kbps = 1500;
    stream.resolution = '720p';
  }

  async revertTile(droneId: string): Promise<void> {
    const stream = this.activeStreams.get(droneId);
    if (!stream || stream.mode !== 'feedgrid') return;

    const gridCount = [...this.activeStreams.values()].filter(
      (s) => s.mode === 'feedgrid',
    ).length;
    const perTileBitrate = Math.max(
      FEEDGRID_MIN_BITRATE_KBPS,
      Math.floor(FEEDGRID_BANDWIDTH_CEILING_KBPS / gridCount),
    );
    const resolution: VideoResolution = gridCount >= 4 ? '360p' : '480p';

    this.sendBitrateCommand(droneId, perTileBitrate);
    this.sendResolutionCommand(droneId, resolution);
    stream.bitrate_kbps = perTileBitrate;
    stream.resolution = resolution;
  }

  handleStreamStarted(payload: StreamStartedPayload): void {
    const stream = this.activeStreams.get(payload.drone_id);
    if (stream) {
      stream.resolution = payload.resolution;
      stream.bitrate_kbps = payload.bitrate_kbps;
    }

    this.emitToRenderer({
      type: 'stream:started',
      droneId: payload.drone_id,
      data: {
        mode: payload.mode,
        resolution: payload.resolution,
        bitrate_kbps: payload.bitrate_kbps,
        rtsp_url: payload.rtsp_url,
        whepUrl: this.getWhepUrl(payload.drone_id),
      },
    });
  }

  handleStreamStopped(droneId: string): void {
    this.activeStreams.delete(droneId);
    this.emitToRenderer({ type: 'stream:stopped', droneId });
  }

  handleStreamError(droneId: string, reason: string): void {
    this.activeStreams.delete(droneId);
    this.emitToRenderer({
      type: 'stream:error',
      droneId,
      data: { reason },
    });
  }

  handleBitrateChanged(droneId: string, newKbps: number): void {
    const stream = this.activeStreams.get(droneId);
    if (stream) {
      stream.bitrate_kbps = newKbps;
    }
    this.emitToRenderer({
      type: 'stream:quality-changed',
      droneId,
      data: { bitrate_kbps: newKbps },
    });
  }

  private async requestPreviewStream(droneId: string): Promise<void> {
    const previews = [...this.activeStreams.values()].filter(
      (s) => s.mode === 'preview',
    );

    if (previews.length >= MAX_PREVIEW_STREAMS) {
      const oldest = previews.sort((a, b) => a.startedAt - b.startedAt)[0];
      console.log(`[OW-StreamManager] Preview limit reached, auto-releasing ${oldest.droneId}`);
      await this.releaseStream(oldest.droneId);
    }

    this.activeStreams.set(droneId, {
      droneId,
      mode: 'preview',
      resolution: '480p',
      bitrate_kbps: 1500,
      startedAt: Date.now(),
      bytesReceived: 0,
      whepUrl: this.getWhepUrl(droneId),
    });

    this.sendStartCommand(droneId, 'preview', '480p', 1500);
  }

  private async requestHITLStream(droneId: string): Promise<void> {
    const hitlStreams = [...this.activeStreams.values()].filter(
      (s) => s.mode === 'hitl',
    );

    if (hitlStreams.length >= MAX_HITL_STREAMS) {
      const existing = hitlStreams[0];
      await this.releaseStream(existing.droneId);
    }

    this.activeStreams.set(droneId, {
      droneId,
      mode: 'hitl',
      resolution: '720p',
      bitrate_kbps: 3000,
      startedAt: Date.now(),
      bytesReceived: 0,
      whepUrl: '',
    });

    this.sendStartCommand(droneId, 'hitl', '720p', 3000);
  }

  private sendStartCommand(
    droneId: string,
    mode: VideoStreamMode,
    resolution: VideoResolution,
    bitrate: number,
  ): void {
    const payload: StartStreamPayload = {
      drone_id: droneId,
      mode,
      resolution,
      max_bitrate_kbps: bitrate,
      overlay: false,
    };

    if (mode === 'hitl' && this.sendHITLCommand) {
      this.sendHITLCommand(droneId, { type: 'start_stream', payload });
    } else if (this.sendToSwarm) {
      const swarmId = this.resolveSwarmForDrone(droneId);
      if (swarmId) this.sendToSwarm(swarmId, { type: 'start_stream', payload });
    }
  }

  private sendStopCommand(droneId: string): void {
    const payload: StopStreamPayload = { drone_id: droneId };

    const stream = this.activeStreams.get(droneId);
    if (stream?.mode === 'hitl' && this.sendHITLCommand) {
      this.sendHITLCommand(droneId, { type: 'stop_stream', payload });
    } else if (this.sendToSwarm) {
      const swarmId = this.resolveSwarmForDrone(droneId);
      if (swarmId) this.sendToSwarm(swarmId, { type: 'stop_stream', payload });
    }
  }

  private sendBitrateCommand(droneId: string, targetKbps: number): void {
    const payload: SetBitratePayload = {
      drone_id: droneId,
      target_kbps: targetKbps,
    };

    if (this.sendToSwarm) {
      const swarmId = this.resolveSwarmForDrone(droneId);
      if (swarmId) this.sendToSwarm(swarmId, { type: 'set_bitrate', payload });
    }
  }

  private sendResolutionCommand(droneId: string, resolution: VideoResolution): void {
    const payload: SetResolutionPayload = {
      drone_id: droneId,
      resolution,
    };

    if (this.sendToSwarm) {
      const swarmId = this.resolveSwarmForDrone(droneId);
      if (swarmId) this.sendToSwarm(swarmId, { type: 'set_resolution', payload });
    }
  }

  private emitToRenderer(event: StreamEvent): void {
    this.emit(event.type, event);

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('stream-event', event);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
