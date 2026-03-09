import type { Database as DatabaseType } from 'better-sqlite3';
import type { SituationModel, CognitiveEvent, Alert } from './situation-model';

/**
 * World Model Learning Engine — extracts and stores operational knowledge
 * at three abstraction levels:
 *
 * 1. Specific: per-operation observations (drone X had trouble perching in zone Y)
 * 2. Pattern: per-venue-type patterns (lobbies typically need 3+ T1 drones for coverage)
 * 3. Principle: universal knowledge (battery drain increases 20% in wind > 10 m/s)
 *
 * Learning triggers:
 * - During operation: real-time observations stored as 'specific'
 * - Post-operation: batch pattern extraction from operation data
 * - Cloud-side: cross-operation generalisation (future, via overwatch-cloud)
 */

export type AbstractionLevel = 'specific' | 'pattern' | 'principle';

export interface Observation {
  id: string;
  timestamp: string;
  operationId: string | null;
  venueId: string | null;
  level: AbstractionLevel;
  category: string;
  description: string;
  confidence: number;
  context: Record<string, unknown>;
  source: string;
}

export class LearningEngine {
  private db: DatabaseType;
  private situationModel: SituationModel;
  private observations: Observation[] = [];

  constructor(db: DatabaseType, situationModel: SituationModel) {
    this.db = db;
    this.situationModel = situationModel;
    this.ensureTable();
  }

  setSituationModel(model: SituationModel): void {
    this.situationModel = model;
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_model_observations (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        operation_id TEXT,
        venue_id TEXT,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        context_json TEXT,
        source TEXT NOT NULL
      )
    `);
  }

  /**
   * Record a real-time observation during an active operation.
   */
  recordObservation(obs: Omit<Observation, 'id' | 'timestamp'>): string {
    const id = `obs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();

    const observation: Observation = { id, timestamp, ...obs };
    this.observations.push(observation);

    this.db.prepare(`
      INSERT INTO world_model_observations (id, timestamp, operation_id, venue_id, level, category, description, confidence, context_json, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, timestamp, obs.operationId, obs.venueId, obs.level,
      obs.category, obs.description, obs.confidence,
      JSON.stringify(obs.context), obs.source,
    );

    return id;
  }

  /**
   * Extract patterns from a completed operation's data.
   */
  extractPostOperationPatterns(operationId: string): Observation[] {
    const events = this.situationModel.getRecentEvents();
    const alerts = this.situationModel.getActiveAlerts();
    const drones = this.situationModel.getAllDrones();
    const zones = this.situationModel.getAllZones();

    const patterns: Observation[] = [];

    const zoneAlerts = new Map<string, number>();
    for (const alert of alerts) {
      if (alert.zoneId) {
        zoneAlerts.set(alert.zoneId, (zoneAlerts.get(alert.zoneId) ?? 0) + 1);
      }
    }

    for (const [zoneId, count] of zoneAlerts) {
      if (count >= 3) {
        const zone = zones.find((z) => z.id === zoneId);
        const obs: Omit<Observation, 'id' | 'timestamp'> = {
          operationId,
          venueId: null,
          level: 'pattern',
          category: 'hotspot',
          description: `Zone ${zone?.name ?? zoneId} had ${count} alerts during operation — potential hotspot requiring increased coverage.`,
          confidence: Math.min(0.9, 0.5 + count * 0.1),
          context: { zoneId, alertCount: count },
          source: 'post_op_analysis',
        };
        this.recordObservation(obs);
        patterns.push({ id: '', timestamp: '', ...obs });
      }
    }

    const lowBatteryDrones = drones.filter((d) => d.battery < 0.15);
    if (lowBatteryDrones.length > drones.length * 0.3) {
      const obs: Omit<Observation, 'id' | 'timestamp'> = {
        operationId,
        venueId: null,
        level: 'pattern',
        category: 'battery',
        description: `${lowBatteryDrones.length}/${drones.length} drones below 15% battery at end of operation. Consider shorter rotation cycles.`,
        confidence: 0.7,
        context: { lowCount: lowBatteryDrones.length, total: drones.length },
        source: 'post_op_analysis',
      };
      this.recordObservation(obs);
      patterns.push({ id: '', timestamp: '', ...obs });
    }

    const coverageGapEvents = events.filter((e) => e.type === 'coverage_gap' || e.type === 'principal_zone_change');
    if (coverageGapEvents.length > 5) {
      const obs: Omit<Observation, 'id' | 'timestamp'> = {
        operationId,
        venueId: null,
        level: 'pattern',
        category: 'coverage',
        description: `${coverageGapEvents.length} coverage-related events — consider pre-deploying more drones or adjusting leapfrog timing.`,
        confidence: 0.6,
        context: { eventCount: coverageGapEvents.length },
        source: 'post_op_analysis',
      };
      this.recordObservation(obs);
      patterns.push({ id: '', timestamp: '', ...obs });
    }

    return patterns;
  }

  /**
   * Query stored observations for a given context.
   */
  queryObservations(filters: {
    venueId?: string;
    category?: string;
    level?: AbstractionLevel;
    limit?: number;
  }): Observation[] {
    let sql = 'SELECT * FROM world_model_observations WHERE 1=1';
    const params: unknown[] = [];

    if (filters.venueId) {
      sql += ' AND venue_id = ?';
      params.push(filters.venueId);
    }
    if (filters.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters.level) {
      sql += ' AND level = ?';
      params.push(filters.level);
    }

    sql += ' ORDER BY timestamp DESC';
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      timestamp: r.timestamp as string,
      operationId: r.operation_id as string | null,
      venueId: r.venue_id as string | null,
      level: r.level as AbstractionLevel,
      category: r.category as string,
      description: r.description as string,
      confidence: r.confidence as number,
      context: r.context_json ? JSON.parse(r.context_json as string) : {},
      source: r.source as string,
    }));
  }

  getRecentObservations(count = 20): Observation[] {
    return this.observations.slice(-count);
  }
}
