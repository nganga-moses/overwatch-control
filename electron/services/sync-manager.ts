import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import type { OverwatchDB } from '../storage/overwatch-db';

export interface SyncConfig {
  cloudApiUrl: string;
  apiKey: string;
  workstationId: string;
  dataDir: string;
  syncIntervalMs?: number;
  heartbeatIntervalMs?: number;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error' | 'bootstrapping';
  lastSync: string | null;
  pendingQueueSize: number;
  lastError: string | null;
  isBootstrapped: boolean;
  cloudVersion: number;
}

interface QueuedPayload {
  id: string;
  type: 'delta_push';
  payload: unknown;
  createdAt: string;
  retries: number;
}

const DEFAULT_SYNC_INTERVAL_MS = 300_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
const MAX_RETRIES = 5;

export class SyncManager extends EventEmitter {
  private config: SyncConfig;
  private db: OverwatchDB;
  private queue: QueuedPayload[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private status: SyncStatus;
  private queueFilePath: string;
  private statusFilePath: string;

  constructor(config: SyncConfig, db: OverwatchDB) {
    super();
    this.config = config;
    this.db = db;
    this.queueFilePath = path.join(config.dataDir, 'sync-queue.json');
    this.statusFilePath = path.join(config.dataDir, 'sync-status.json');

    this.status = {
      state: 'idle',
      lastSync: null,
      pendingQueueSize: 0,
      lastError: null,
      isBootstrapped: false,
      cloudVersion: 0,
    };

    this.loadPersistedState();
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (!this.status.isBootstrapped) {
      await this.bootstrap();
    }

    this.syncTimer = setInterval(
      () => this.syncCycle(),
      this.config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
    );

    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    );

    console.info(
      '[SyncManager] Started (interval=%dms, heartbeat=%dms)',
      this.config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
      this.config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    );
  }

  async stop(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.persistQueue();
    this.persistStatus();
    console.info('[SyncManager] Stopped');
  }

  async triggerSync(): Promise<void> {
    await this.syncCycle();
  }

  async bootstrap(): Promise<boolean> {
    this.updateStatus({ state: 'bootstrapping' });

    try {
      const resp = await this.apiFetch(
        `/api/v1/sync/bootstrap?workstation_id=${encodeURIComponent(this.config.workstationId)}`,
      );

      if (!resp.ok) {
        throw new Error(`Bootstrap failed: ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();

      this.db.applyBootstrapData(data);

      this.updateStatus({
        state: 'idle',
        isBootstrapped: true,
        lastSync: new Date().toISOString(),
        cloudVersion: data.cloud_version ?? 0,
        lastError: null,
      });

      this.persistStatus();
      this.emit('bootstrapped', data);
      console.info(
        '[SyncManager] Bootstrap complete: %d venues, %d kits, %d drones',
        data.venues?.length ?? 0,
        data.kits?.length ?? 0,
        data.drones?.length ?? 0,
      );

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateStatus({ state: 'error', lastError: msg });
      console.error('[SyncManager] Bootstrap failed:', msg);
      return false;
    }
  }

  async fetchKit(serial: string): Promise<any> {
    const resp = await this.apiFetch(
      `/api/v1/kits/${encodeURIComponent(serial)}`,
    );

    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw new Error(`Kit fetch failed: ${resp.status} ${resp.statusText}`);
    }

    return resp.json();
  }

  async fetchAllKits(): Promise<{ kits: number; drones: number }> {
    const resp = await this.apiFetch('/api/v1/kits?limit=500');
    if (!resp.ok) {
      throw new Error(`Kit list fetch failed: ${resp.status} ${resp.statusText}`);
    }

    const rawKits = await resp.json();
    const DRONE_DEFAULTS: Record<string, unknown> = {
      status: 'idle',
      battery_percent: 100.0,
      perch_state: 'sleeping',
      flight_hours: 0.0,
      total_perches: 0,
    };
    const drones = rawKits.flatMap((k: any) =>
      (k.drones ?? []).map((d: any) => {
        const merged = { ...d, kit_id: k.id };
        for (const [key, def] of Object.entries(DRONE_DEFAULTS)) {
          if (merged[key] == null) merged[key] = def;
        }
        if (!merged.callsign) merged.callsign = merged.serial;
        return merged;
      }),
    );
    const kits = rawKits.map(({ drones: _d, ...rest }: any) => rest);
    this.db.applyBootstrapData({ kits, drones });
    console.info('[SyncManager] Fetched %d kits, %d drones from cloud', kits.length, drones.length);
    return { kits: kits.length, drones: drones.length };
  }

  // ---------------------------------------------------------------------------
  // Sync cycle
  // ---------------------------------------------------------------------------

  private async syncCycle(): Promise<void> {
    if (this.status.state === 'syncing' || this.status.state === 'bootstrapping') {
      return;
    }

    this.updateStatus({ state: 'syncing' });

    try {
      await this.pushDeltas();
      await this.processQueue();
      await this.pullUpdates();

      this.updateStatus({
        state: 'idle',
        lastSync: new Date().toISOString(),
        lastError: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (this.isNetworkError(err)) {
        this.updateStatus({ state: 'offline', lastError: msg });
      } else {
        this.updateStatus({ state: 'error', lastError: msg });
      }

      console.error('[SyncManager] Sync cycle failed:', msg);
    }

    this.persistStatus();
  }

  private static readonly LOCAL_TO_CLOUD_TABLE: Record<string, string> = {
    drone_profiles: 'drones',
  };

  private async pushDeltas(): Promise<void> {
    const unsyncedBatches = this.db.getAllUnsyncedEntities();
    const unsyncedAlerts = this.db.getUnsyncedAlerts();
    const unsyncedAssessments = this.db.getUnsyncedSurfaceAssessments();
    const unsyncedEpisodes = this.db.getUnsyncedOverrideEpisodes();

    const entities: { table: string; id: string; data: Record<string, any>; cloud_version: number | null }[] = [];

    for (const batch of unsyncedBatches) {
      const cloudTable = SyncManager.LOCAL_TO_CLOUD_TABLE[batch.table] ?? batch.table;
      for (const row of batch.rows) {
        entities.push({
          table: cloudTable,
          id: row.id,
          data: row,
          cloud_version: row.cloud_version ?? null,
        });
      }
    }

    for (const alert of unsyncedAlerts) {
      entities.push({ table: 'alerts', id: alert.id, data: alert, cloud_version: null });
    }
    for (const sa of unsyncedAssessments) {
      entities.push({ table: 'surface_assessments', id: sa.id, data: sa, cloud_version: null });
    }
    for (const ep of unsyncedEpisodes) {
      entities.push({ table: 'override_episodes', id: ep.id, data: ep, cloud_version: null });
    }

    if (entities.length === 0) return;

    const resp = await this.apiFetch('/api/v1/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        workstation_id: this.config.workstationId,
        entities,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Push failed: ${resp.status} ${resp.statusText}`);
    }

    const result = await resp.json();

    // Mark pushed entities as synced
    for (const batch of unsyncedBatches) {
      this.db.markSynced(batch.table, batch.rows.map((r: any) => r.id));
    }
    if (unsyncedAlerts.length > 0) {
      this.db.markAlertsSynced(unsyncedAlerts.map((a: any) => a.id));
    }
    if (unsyncedAssessments.length > 0) {
      this.db.markSurfaceAssessmentsSynced(unsyncedAssessments.map((s: any) => s.id));
    }
    if (unsyncedEpisodes.length > 0) {
      this.db.markOverrideEpisodesSynced(unsyncedEpisodes.map((e: any) => e.id));
    }

    if (result.new_cloud_version) {
      this.updateStatus({ cloudVersion: result.new_cloud_version });
    }

    console.info(
      '[SyncManager] Pushed %d entities (%d accepted, %d rejected)',
      entities.length,
      result.accepted,
      result.rejected,
    );

    this.emit('pushed', result);
  }

  private async pullUpdates(): Promise<void> {
    const resp = await this.apiFetch(
      `/api/v1/sync/pull?workstation_id=${encodeURIComponent(this.config.workstationId)}&since=${this.status.cloudVersion}`,
    );

    if (!resp.ok) {
      throw new Error(`Pull failed: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();

    if (data.entities && data.entities.length > 0) {
      this.db.applyPullEntities(data.entities);
      console.info('[SyncManager] Pulled %d entities', data.entities.length);
    }

    if (data.cloud_version) {
      this.updateStatus({ cloudVersion: data.cloud_version });
    }

    await this.pullOperators();

    this.emit('pulled', data);
  }

  private async pullOperators(): Promise<void> {
    try {
      const resp = await this.apiFetch('/api/v1/auth/operators');
      if (!resp.ok) return;
      const operators = await resp.json();
      for (const op of operators) {
        this.db.upsertOperator({
          id: op.id,
          name: op.name,
          role: op.role,
          pinDigitsJson: op.pin_digits_json,
          isActive: op.is_active,
        });
      }
      console.info('[SyncManager] Synced %d operators', operators.length);
    } catch (err) {
      console.warn('[SyncManager] Operator sync failed:', err);
    }
  }

  private async processQueue(): Promise<void> {
    const toRetry: QueuedPayload[] = [];

    for (const item of this.queue) {
      try {
        await this.apiFetch('/api/v1/sync/push', {
          method: 'POST',
          body: JSON.stringify(item.payload),
        });
      } catch {
        item.retries++;
        if (item.retries < MAX_RETRIES) {
          toRetry.push(item);
        } else {
          console.warn(
            '[SyncManager] Dropping queued item after %d retries: %s',
            MAX_RETRIES,
            item.id,
          );
        }
      }
    }

    this.queue = toRetry;
    this.updateStatus({ pendingQueueSize: this.queue.length });
    this.persistQueue();
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const nodeCount = this.db.getNodeCount();
      const edgeCount = this.db.getEdgeCount();

      await this.apiFetch(
        `/api/v1/workstations/${encodeURIComponent(this.config.workstationId)}/heartbeat`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'online',
            software_version: process.env.OW_VERSION ?? '0.1.0',
            world_model_nodes: nodeCount,
            world_model_edges: edgeCount,
          }),
        },
      );
    } catch {
      this.updateStatus({ state: 'offline' });
    }
  }

  // ---------------------------------------------------------------------------
  // API helper
  // ---------------------------------------------------------------------------

  async apiFetchPublic(endpoint: string, init?: RequestInit): Promise<Response> {
    return this.apiFetch(endpoint, init);
  }

  private async apiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.cloudApiUrl}${endpoint}`;
    return fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        ...(init?.headers ?? {}),
      },
    });
  }

  private isNetworkError(err: unknown): boolean {
    if (err instanceof TypeError && (err as any).cause?.code) {
      const code = (err as any).cause.code;
      return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ENETUNREACH'].includes(code);
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  enqueue(payload: unknown): void {
    const item: QueuedPayload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'delta_push',
      payload,
      createdAt: new Date().toISOString(),
      retries: 0,
    };
    this.queue.push(item);
    this.updateStatus({ pendingQueueSize: this.queue.length });
    this.persistQueue();
  }

  private updateStatus(patch: Partial<SyncStatus>): void {
    Object.assign(this.status, patch);
    this.emit('status', this.getStatus());
  }

  private persistQueue(): void {
    try {
      fs.writeFileSync(this.queueFilePath, JSON.stringify(this.queue, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SyncManager] Failed to persist queue:', err);
    }
  }

  private persistStatus(): void {
    try {
      const data = {
        lastSync: this.status.lastSync,
        isBootstrapped: this.status.isBootstrapped,
        cloudVersion: this.status.cloudVersion,
      };
      fs.writeFileSync(this.statusFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SyncManager] Failed to persist status:', err);
    }
  }

  private loadPersistedState(): void {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const raw = fs.readFileSync(this.queueFilePath, 'utf-8');
        this.queue = JSON.parse(raw);
        this.status.pendingQueueSize = this.queue.length;
      }
    } catch {
      this.queue = [];
    }

    try {
      if (fs.existsSync(this.statusFilePath)) {
        const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
        const data = JSON.parse(raw);
        this.status.lastSync = data.lastSync ?? null;
        this.status.isBootstrapped = data.isBootstrapped ?? false;
        this.status.cloudVersion = data.cloudVersion ?? 0;
      }
    } catch {
      // Start fresh
    }
  }
}
