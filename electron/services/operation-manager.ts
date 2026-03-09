import type { OverwatchDB } from '../storage/overwatch-db';
import type { SyncManager } from './sync-manager';

export class OperationManager {
  private syncManager: SyncManager | null = null;

  constructor(private db: OverwatchDB) {}

  setSyncManager(syncManager: SyncManager): void {
    this.syncManager = syncManager;
  }

  private get api() {
    if (!this.syncManager) {
      throw new Error('Cloud sync is not configured. Operation management requires cloud connectivity.');
    }
    return this.syncManager;
  }

  // ---------------------------------------------------------------------------
  // Operations CRUD — cloud-first
  // ---------------------------------------------------------------------------

  async createOperation(data: {
    venueId?: string;
    name: string;
    type?: string;
    environment?: string;
  }): Promise<any> {
    const cloudPayload: Record<string, unknown> = {
      name: data.name,
    };
    if (data.venueId) cloudPayload.venue_id = data.venueId;
    if (data.type) cloudPayload.type = data.type;
    if (data.environment) cloudPayload.environment = data.environment;

    let cloudOp: any = null;
    try {
      const resp = await this.api.apiFetchPublic('/api/v1/operations', {
        method: 'POST',
        body: JSON.stringify(cloudPayload),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Failed to create operation: ${resp.status} ${detail}`);
      }
      cloudOp = await resp.json();
    } catch (err) {
      console.error('[OperationManager] Cloud create failed, storing locally:', err);
    }

    const id = this.db.writeOperation({
      id: cloudOp?.id,
      venueId: data.venueId || null,
      name: data.name,
      type: data.type,
      environment: data.environment,
      status: cloudOp?.status ?? 'planning',
    });

    return cloudOp ?? { id, ...data, status: 'planning' };
  }

  getOperation(id: string) {
    return this.db.getOperation(id);
  }

  listOperations(filters?: { status?: string; venueId?: string; active?: boolean }) {
    return this.db.queryOperations(filters);
  }

  async updateOperation(id: string, patch: Record<string, unknown>): Promise<any> {
    let cloudOp: any = null;
    try {
      const resp = await this.api.apiFetchPublic(`/api/v1/operations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Failed to update operation: ${resp.status} ${detail}`);
      }
      cloudOp = await resp.json();
    } catch (err) {
      console.error('[OperationManager] Cloud update failed, updating locally:', err);
    }

    this.db.updateOperation(id, patch);
    return cloudOp ?? { id, ...patch };
  }

  async deleteOperation(id: string): Promise<void> {
    const op = this.db.getOperation(id);
    if (op && op.status !== 'planning') {
      throw new Error('Can only delete operations in planning status');
    }

    try {
      const resp = await this.api.apiFetchPublic(`/api/v1/operations/${id}`, {
        method: 'DELETE',
      });
      if (!resp.ok && resp.status !== 404) {
        throw new Error(`Failed to delete operation: ${resp.status}`);
      }
    } catch (err) {
      console.error('[OperationManager] Cloud delete failed, deleting locally:', err);
    }

    this.db.deleteOperation(id);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle transitions
  // ---------------------------------------------------------------------------

  async startBriefing(id: string): Promise<any> {
    this.db.updateOperation(id, { status: 'briefing' });

    try {
      await this.api.apiFetchPublic(`/api/v1/operations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'briefing' }),
      });
    } catch (err) {
      console.error('[OperationManager] Cloud startBriefing sync failed:', err);
    }

    return this.db.getOperation(id);
  }

  async deploy(id: string, briefingJson: Record<string, unknown>): Promise<any> {
    const resp = await this.api.apiFetchPublic(`/api/v1/operations/${id}/deploy`, {
      method: 'POST',
      body: JSON.stringify(briefingJson),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to deploy operation: ${resp.status} ${detail}`);
    }
    const result = await resp.json();

    this.db.updateOperation(id, {
      status: result.status ?? 'deploying',
      briefingJson,
    });

    return result;
  }

  async completeOperation(id: string): Promise<any> {
    const resp = await this.api.apiFetchPublic(`/api/v1/operations/${id}/complete`, {
      method: 'POST',
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to complete operation: ${resp.status} ${detail}`);
    }
    const result = await resp.json();

    this.db.updateOperation(id, { status: result.status ?? 'completed' });
    return result;
  }

  async abortOperation(id: string): Promise<any> {
    const resp = await this.api.apiFetchPublic(`/api/v1/operations/${id}/abort`, {
      method: 'POST',
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to abort operation: ${resp.status} ${detail}`);
    }
    const result = await resp.json();

    this.db.updateOperation(id, { status: result.status ?? 'aborted' });
    return result;
  }

  async pauseOperation(id: string): Promise<any> {
    this.db.updateOperation(id, { status: 'paused' });

    try {
      await this.api.apiFetchPublic(`/api/v1/operations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paused' }),
      });
    } catch (err) {
      console.error('[OperationManager] Cloud pause sync failed:', err);
    }

    return this.db.getOperation(id);
  }

  async resumeOperation(id: string): Promise<any> {
    this.db.updateOperation(id, { status: 'active' });

    try {
      await this.api.apiFetchPublic(`/api/v1/operations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
    } catch (err) {
      console.error('[OperationManager] Cloud resume sync failed:', err);
    }

    return this.db.getOperation(id);
  }

  // ---------------------------------------------------------------------------
  // Metrics & Debrief
  // ---------------------------------------------------------------------------

  async getMetrics(id: string): Promise<any> {
    const resp = await this.api.apiFetchPublic(`/api/v1/operations/${id}/metrics`);
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to get metrics: ${resp.status} ${detail}`);
    }
    return resp.json();
  }

  async getDebrief(id: string): Promise<any> {
    const resp = await this.api.apiFetchPublic(`/api/v1/operations/${id}/debrief`, {
      method: 'POST',
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to get debrief: ${resp.status} ${detail}`);
    }
    return resp.json();
  }

  // ---------------------------------------------------------------------------
  // Principals — cloud-first
  // ---------------------------------------------------------------------------

  async createPrincipal(data: {
    codename: string;
    bleBeaconId?: string;
    notes?: string;
  }): Promise<any> {
    let cloudPrincipal: any = null;
    try {
      const resp = await this.api.apiFetchPublic('/api/v1/principals', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Failed to create principal: ${resp.status} ${detail}`);
      }
      cloudPrincipal = await resp.json();
    } catch (err) {
      console.error('[OperationManager] Cloud principal create failed, storing locally:', err);
    }

    const id = this.db.writePrincipal({
      id: cloudPrincipal?.id,
      name: cloudPrincipal?.name ?? data.codename,
      codename: data.codename,
      bleBeaconId: data.bleBeaconId,
      notes: data.notes,
    });

    return cloudPrincipal ?? { id, ...data };
  }

  listPrincipals() {
    return this.db.queryPrincipals();
  }

  async updatePrincipal(id: string, patch: Record<string, unknown>): Promise<any> {
    let cloudResult: any = null;
    try {
      const resp = await this.api.apiFetchPublic(`/api/v1/principals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Failed to update principal: ${resp.status} ${detail}`);
      }
      cloudResult = await resp.json();
    } catch (err) {
      console.error('[OperationManager] Cloud principal update failed, updating locally:', err);
    }

    this.db.updatePrincipal(id, patch);
    return cloudResult ?? { id, ...patch };
  }

  async deletePrincipal(id: string): Promise<void> {
    try {
      const resp = await this.api.apiFetchPublic(`/api/v1/principals/${id}`, {
        method: 'DELETE',
      });
      if (!resp.ok && resp.status !== 404) {
        throw new Error(`Failed to delete principal: ${resp.status}`);
      }
    } catch (err) {
      console.error('[OperationManager] Cloud principal delete failed, deleting locally:', err);
    }

    this.db.deletePrincipal(id);
  }

  // ---------------------------------------------------------------------------
  // Protection Agents — cloud-first
  // ---------------------------------------------------------------------------

  async createAgent(data: {
    name: string;
    callsign: string;
    role?: string;
    notes?: string;
  }): Promise<any> {
    let cloudAgent: any = null;
    try {
      const resp = await this.api.apiFetchPublic('/api/v1/agents', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Failed to create agent: ${resp.status} ${detail}`);
      }
      cloudAgent = await resp.json();
    } catch (err) {
      console.error('[OperationManager] Cloud agent create failed, storing locally:', err);
    }

    const id = this.db.writeProtectionAgent({
      id: cloudAgent?.id,
      name: data.name,
      callsign: data.callsign,
      role: data.role,
      notes: data.notes,
    });

    return cloudAgent ?? { id, ...data };
  }

  listAgents() {
    return this.db.queryProtectionAgents();
  }

  async updateAgent(id: string, patch: Record<string, unknown>): Promise<any> {
    let cloudResult: any = null;
    try {
      const resp = await this.api.apiFetchPublic(`/api/v1/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Failed to update agent: ${resp.status} ${detail}`);
      }
      cloudResult = await resp.json();
    } catch (err) {
      console.error('[OperationManager] Cloud agent update failed, updating locally:', err);
    }

    this.db.updateProtectionAgent(id, patch);
    return cloudResult ?? { id, ...patch };
  }

  async deleteAgent(id: string): Promise<void> {
    try {
      const resp = await this.api.apiFetchPublic(`/api/v1/agents/${id}`, {
        method: 'DELETE',
      });
      if (!resp.ok && resp.status !== 404) {
        throw new Error(`Failed to delete agent: ${resp.status}`);
      }
    } catch (err) {
      console.error('[OperationManager] Cloud agent delete failed, deleting locally:', err);
    }

    this.db.deleteProtectionAgent(id);
  }

  // ---------------------------------------------------------------------------
  // Weather — proxy to cloud
  // ---------------------------------------------------------------------------

  async getWeather(lat: number, lng: number): Promise<any> {
    const resp = await this.api.apiFetchPublic(
      `/api/v1/weather/current?lat=${lat}&lng=${lng}`,
    );
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to get weather: ${resp.status} ${detail}`);
    }
    return resp.json();
  }

  async getWeatherForecast(lat: number, lng: number, hours?: number): Promise<any> {
    let url = `/api/v1/weather/forecast?lat=${lat}&lng=${lng}`;
    if (hours != null) {
      url += `&hours=${hours}`;
    }
    const resp = await this.api.apiFetchPublic(url);
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to get weather forecast: ${resp.status} ${detail}`);
    }
    return resp.json();
  }
}
