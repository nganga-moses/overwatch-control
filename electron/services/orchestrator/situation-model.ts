import type { Database as DatabaseType } from 'better-sqlite3';

export type ThreatLevel = 'green' | 'amber' | 'red' | 'critical';

export interface DroneSnapshot {
  id: string;
  callsign: string;
  kitId: string;
  tier: 'tier_1' | 'tier_2';
  position: { lat: number; lon: number; alt_m: number } | null;
  battery: number;
  batteryDrainRate: number;
  perchState: string;
  status: string;
  zoneId: string | null;
  perchPointId: string | null;
  lastUpdate: string;
}

export interface PrincipalSnapshot {
  id: string;
  currentZoneId: string | null;
  position: { lat: number; lon: number } | null;
  speed: number;
  heading: number;
  lastUpdate: string;
}

export interface ZoneSnapshot {
  id: string;
  name: string;
  coverage: number;
  activeDrones: string[];
  threatLevel: ThreatLevel;
}

export interface CognitiveEvent {
  id: string;
  timestamp: string;
  source: 'operator' | 'drone' | 'system' | 'principal';
  type: string;
  summary: string;
  significance: 'routine' | 'notable' | 'significant' | 'critical';
  zoneId?: string;
  droneId?: string;
  resolved: boolean;
}

export interface PendingDecision {
  id: string;
  createdAt: string;
  type: string;
  summary: string;
  autoExecuteAt?: string;
  resolved: boolean;
}

export interface BatteryProjection {
  droneId: string;
  currentLevel: number;
  drainRatePerMin: number;
  estimatedMinutesRemaining: number;
  warningEtaMinutes: number | null;
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  resolved: boolean;
  resolvedAt?: string;
  zoneId?: string;
  droneId?: string;
  confidence?: number;
}

export interface WeatherSnapshot {
  wind_speed_m_s: number;
  wind_heading_deg: number;
  gust_speed_m_s: number;
  temperature_c: number;
  visibility_m: number;
  precipitation: string;
  observed_at: string;
}

export interface SituationModelData {
  drones: Record<string, DroneSnapshot>;
  principal: PrincipalSnapshot | null;
  zones: Record<string, ZoneSnapshot>;
  weather: WeatherSnapshot;
  recentEvents: CognitiveEvent[];
  pendingDecisions: PendingDecision[];
  activeAlerts: Alert[];
  batteryProjections: Record<string, BatteryProjection>;
  threatLevel: ThreatLevel;
  missionId: string | null;
  missionActive: boolean;
  lastUpdated: string;
  sessionId: string;
  uptimeMs: number;
}

const MAX_RECENT_EVENTS = 200;
const MAX_ACTIVE_ALERTS = 100;

export class SituationModel {
  private data: SituationModelData;
  private db: DatabaseType;
  private startedAt: number;

  constructor(db: DatabaseType, sessionId: string) {
    this.db = db;
    this.startedAt = Date.now();
    this.data = this.createEmpty(sessionId);
  }

  private createEmpty(sessionId: string): SituationModelData {
    return {
      drones: {},
      principal: null,
      zones: {},
      weather: {
        wind_speed_m_s: 0,
        wind_heading_deg: 0,
        gust_speed_m_s: 0,
        temperature_c: 20,
        visibility_m: 10000,
        precipitation: 'none',
        observed_at: new Date().toISOString(),
      },
      recentEvents: [],
      pendingDecisions: [],
      activeAlerts: [],
      batteryProjections: {},
      threatLevel: 'green',
      missionId: null,
      missionActive: false,
      lastUpdated: new Date().toISOString(),
      sessionId,
      uptimeMs: 0,
    };
  }

  // ── Drone state ──

  updateDrone(drone: DroneSnapshot): void {
    const existing = this.data.drones[drone.id];
    if (existing && existing.battery > 0 && drone.battery > 0) {
      const dtMin = (Date.parse(drone.lastUpdate) - Date.parse(existing.lastUpdate)) / 60_000;
      if (dtMin > 0.1) {
        const drainRate = (existing.battery - drone.battery) / dtMin;
        drone.batteryDrainRate =
          drainRate > 0
            ? 0.7 * (existing.batteryDrainRate || drainRate) + 0.3 * drainRate
            : existing.batteryDrainRate;
      }
    }
    this.data.drones[drone.id] = drone;
    this.touch();
  }

  getDrone(droneId: string): DroneSnapshot | undefined {
    return this.data.drones[droneId];
  }

  getAllDrones(): DroneSnapshot[] {
    return Object.values(this.data.drones);
  }

  getDronesByTier(tier: 'tier_1' | 'tier_2'): DroneSnapshot[] {
    return this.getAllDrones().filter((d) => d.tier === tier);
  }

  getDronesInZone(zoneId: string): DroneSnapshot[] {
    return this.getAllDrones().filter((d) => d.zoneId === zoneId);
  }

  // ── Principal ──

  updatePrincipal(principal: PrincipalSnapshot): void {
    this.data.principal = principal;
    this.touch();
  }

  getPrincipal(): PrincipalSnapshot | null {
    return this.data.principal;
  }

  // ── Zones ──

  updateZone(zone: ZoneSnapshot): void {
    this.data.zones[zone.id] = zone;
    this.touch();
  }

  getZone(zoneId: string): ZoneSnapshot | undefined {
    return this.data.zones[zoneId];
  }

  getAllZones(): ZoneSnapshot[] {
    return Object.values(this.data.zones);
  }

  // ── Weather ──

  updateWeather(weather: WeatherSnapshot): void {
    this.data.weather = weather;
    this.touch();
  }

  getWeather(): WeatherSnapshot {
    return this.data.weather;
  }

  // ── Threat level ──

  setThreatLevel(level: ThreatLevel): void {
    this.data.threatLevel = level;
    this.touch();
  }

  getThreatLevel(): ThreatLevel {
    return this.data.threatLevel;
  }

  // ── Mission state ──

  setMission(missionId: string | null, active: boolean): void {
    this.data.missionId = missionId;
    this.data.missionActive = active;
    this.touch();
  }

  isMissionActive(): boolean {
    return this.data.missionActive;
  }

  // ── Events ──

  addEvent(event: CognitiveEvent): void {
    this.data.recentEvents.push(event);
    if (this.data.recentEvents.length > MAX_RECENT_EVENTS) {
      this.data.recentEvents = this.data.recentEvents.slice(-MAX_RECENT_EVENTS);
    }
    this.touch();
  }

  getRecentEvents(count?: number): CognitiveEvent[] {
    const events = this.data.recentEvents;
    return count ? events.slice(-count) : events;
  }

  resolveEvent(eventId: string): void {
    const event = this.data.recentEvents.find((e) => e.id === eventId);
    if (event) {
      event.resolved = true;
      this.touch();
    }
  }

  // ── Pending decisions ──

  addPendingDecision(decision: PendingDecision): void {
    this.data.pendingDecisions.push(decision);
    this.touch();
  }

  getPendingDecisions(): PendingDecision[] {
    return this.data.pendingDecisions.filter((d) => !d.resolved);
  }

  resolveDecision(decisionId: string): void {
    const d = this.data.pendingDecisions.find((x) => x.id === decisionId);
    if (d) {
      d.resolved = true;
      this.touch();
    }
  }

  getExpiredDecisions(now: string): PendingDecision[] {
    return this.data.pendingDecisions.filter(
      (d) => !d.resolved && d.autoExecuteAt && d.autoExecuteAt <= now,
    );
  }

  // ── Alerts ──

  addAlert(alert: Alert): void {
    this.data.activeAlerts.push(alert);
    if (this.data.activeAlerts.length > MAX_ACTIVE_ALERTS) {
      const resolved = this.data.activeAlerts.filter((a) => a.resolved);
      this.data.activeAlerts = resolved.length
        ? this.data.activeAlerts.filter((a) => !a.resolved)
        : this.data.activeAlerts.slice(-MAX_ACTIVE_ALERTS);
    }
    this.touch();
  }

  resolveAlert(alertId: string): void {
    const alert = this.data.activeAlerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      this.touch();
    }
  }

  getActiveAlerts(): Alert[] {
    return this.data.activeAlerts.filter((a) => !a.resolved);
  }

  // ── Battery projections ──

  updateBatteryProjection(p: BatteryProjection): void {
    this.data.batteryProjections[p.droneId] = p;
  }

  getAllBatteryProjections(): BatteryProjection[] {
    return Object.values(this.data.batteryProjections);
  }

  // ── Session ──

  get sessionId(): string {
    return this.data.sessionId;
  }

  get uptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  // ── Snapshot / Summary ──

  getSnapshot(): SituationModelData {
    return { ...this.data, uptimeMs: this.uptimeMs, lastUpdated: new Date().toISOString() };
  }

  getSummary(): {
    droneCount: number;
    t1Count: number;
    t2Count: number;
    activeAlerts: number;
    pendingDecisions: number;
    threatLevel: ThreatLevel;
    principalZone: string | null;
  } {
    const drones = this.getAllDrones();
    return {
      droneCount: drones.length,
      t1Count: drones.filter((d) => d.tier === 'tier_1').length,
      t2Count: drones.filter((d) => d.tier === 'tier_2').length,
      activeAlerts: this.getActiveAlerts().length,
      pendingDecisions: this.getPendingDecisions().length,
      threatLevel: this.data.threatLevel,
      principalZone: this.data.principal?.currentZoneId ?? null,
    };
  }

  // ── Persistence ──

  persist(): void {
    const json = JSON.stringify(this.getSnapshot());
    this.db
      .prepare(
        `INSERT INTO orchestrator_state (id, model_json, session_id, updated_at)
         VALUES ('singleton', ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           model_json = excluded.model_json,
           session_id = excluded.session_id,
           updated_at = datetime('now')`,
      )
      .run(json, this.data.sessionId);
  }

  restore(): boolean {
    const row = this.db
      .prepare('SELECT model_json, session_id FROM orchestrator_state WHERE id = ?')
      .get('singleton') as { model_json: string; session_id: string } | undefined;
    if (!row) return false;
    try {
      this.data = JSON.parse(row.model_json);
      return true;
    } catch {
      return false;
    }
  }

  shouldContinueSession(): boolean {
    const row = this.db
      .prepare('SELECT updated_at FROM orchestrator_state WHERE id = ?')
      .get('singleton') as { updated_at: string } | undefined;
    if (!row) return false;
    return Date.now() - new Date(row.updated_at).getTime() < 8 * 60 * 60 * 1000;
  }

  private touch(): void {
    this.data.lastUpdated = new Date().toISOString();
  }
}
