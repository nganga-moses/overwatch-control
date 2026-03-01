import path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { migrations } from './migrations';

function generateId(): string {
  return crypto.randomUUID();
}

export class OverwatchDB {
  private db: DatabaseType;
  private vecLoaded = false;

  constructor(userDataPath: string) {
    const dbPath = path.join(userDataPath, 'overwatch.sqlite');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  initialize(): void {
    this.runMigrations();
    this.loadVectorExtension();
  }

  close(): void {
    this.db.close();
  }

  getDatabase(): DatabaseType {
    return this.db;
  }

  // ---------------------------------------------------------------------------
  // Migrations
  // ---------------------------------------------------------------------------

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const applied = new Set(
      this.db
        .prepare('SELECT version FROM schema_version')
        .all()
        .map((row: any) => row.version),
    );

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db
          .prepare(
            'INSERT INTO schema_version (version, description) VALUES (?, ?)',
          )
          .run(migration.version, migration.description);
      })();
    }
  }

  private loadVectorExtension(): void {
    try {
      sqliteVec.load(this.db);
      this.vecLoaded = true;
    } catch {
      try {
        const extPath = sqliteVec.getLoadablePath();
        const stripped = extPath.replace(/\.(dylib|so|dll)$/, '');
        this.db.loadExtension(stripped);
        this.vecLoaded = true;
      } catch (err) {
        console.warn(
          '[OverwatchDB] sqlite-vec extension not available, vector search disabled',
        );
        console.warn(
          '[OverwatchDB] Reason:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Venues
  // ---------------------------------------------------------------------------

  writeVenue(venue: {
    id?: string;
    name: string;
    type: string;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    floorPlanPath?: string | null;
    floorCount?: number;
    notes?: string | null;
  }): string {
    const id = venue.id ?? generateId();
    this.db
      .prepare(
        `INSERT INTO venues (id, name, type, address, lat, lng, floor_plan_path, floor_count, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, type=excluded.type, address=excluded.address,
           lat=excluded.lat, lng=excluded.lng, floor_plan_path=excluded.floor_plan_path,
           floor_count=excluded.floor_count, notes=excluded.notes,
           updated_at=datetime('now')`,
      )
      .run(
        id,
        venue.name,
        venue.type,
        venue.address ?? null,
        venue.lat ?? null,
        venue.lng ?? null,
        venue.floorPlanPath ?? null,
        venue.floorCount ?? 1,
        venue.notes ?? null,
      );
    return id;
  }

  getVenue(id: string): any {
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  }

  queryVenues(filters?: { type?: string; search?: string }): any[] {
    let sql = 'SELECT * FROM venues WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }
    if (filters?.search) {
      sql += ' AND (name LIKE ? OR address LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    sql += ' ORDER BY updated_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  deleteVenue(id: string): void {
    this.db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }

  updateVenueFloorPlan(
    venueId: string,
    patch: {
      floorPlanBlobKey?: string | null;
      floorPlanLocalPath?: string | null;
      floorPlanCached?: number;
      floorPlanCachedAt?: string | null;
    },
  ): void {
    const sets: string[] = [];
    const params: any[] = [];

    if (patch.floorPlanBlobKey !== undefined) {
      sets.push('floor_plan_blob_key = ?');
      params.push(patch.floorPlanBlobKey);
    }
    if (patch.floorPlanLocalPath !== undefined) {
      sets.push('floor_plan_local_path = ?');
      params.push(patch.floorPlanLocalPath);
    }
    if (patch.floorPlanCached !== undefined) {
      sets.push('floor_plan_cached = ?');
      params.push(patch.floorPlanCached);
    }
    if (patch.floorPlanCachedAt !== undefined) {
      sets.push('floor_plan_cached_at = ?');
      params.push(patch.floorPlanCachedAt);
    }

    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    params.push(venueId);

    this.db.prepare(`UPDATE venues SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  // ---------------------------------------------------------------------------
  // Surface Assessments
  // ---------------------------------------------------------------------------

  writeSurfaceAssessment(data: Record<string, unknown>): string {
    const id = (data.id as string) ?? generateId();
    this.db
      .prepare(
        `INSERT INTO surface_assessments (
          id, perch_point_id, operation_id, drone_id, drone_tier,
          surface_class_predicted, surface_class_actual, surface_orientation,
          tof_roughness, weather_conditions, spine_engaged, suction_engaged,
          landing_gear_used, hold_duration_s, failure_mode, approach_image_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.perchPointId ?? data.perch_point_id ?? null,
        data.operationId ?? data.operation_id ?? null,
        data.droneId ?? data.drone_id ?? null,
        data.droneTier ?? data.drone_tier ?? null,
        data.surfaceClassPredicted ?? data.surface_class_predicted ?? null,
        data.surfaceClassActual ?? data.surface_class_actual ?? null,
        data.surfaceOrientation ?? data.surface_orientation ?? null,
        data.tofRoughness ?? data.tof_roughness ?? null,
        data.weatherConditions ?? data.weather_conditions ?? null,
        data.spineEngaged ?? data.spine_engaged ?? null,
        data.suctionEngaged ?? data.suction_engaged ?? null,
        data.landingGearUsed ?? data.landing_gear_used ?? null,
        data.holdDurationS ?? data.hold_duration_s ?? null,
        data.failureMode ?? data.failure_mode ?? null,
        data.approachImagePath ?? data.approach_image_path ?? null,
      );
    return id;
  }

  getSurfaceAssessments(perchPointId: string): any[] {
    return this.db
      .prepare('SELECT * FROM surface_assessments WHERE perch_point_id = ? ORDER BY assessed_at DESC')
      .all(perchPointId);
  }

  getPerchPointStats(perchPointId: string): {
    totalAttempts: number;
    successCount: number;
    successRate: number;
    avgHoldDurationS: number | null;
    failureModes: Record<string, number>;
  } {
    const rows = this.getSurfaceAssessments(perchPointId);
    const total = rows.length;
    const successes = rows.filter(
      (r: any) => r.failure_mode === null || r.failure_mode === 'none',
    ).length;

    const holdDurations = rows
      .map((r: any) => r.hold_duration_s)
      .filter((v: any) => v != null) as number[];

    const avgHold = holdDurations.length > 0
      ? holdDurations.reduce((a: number, b: number) => a + b, 0) / holdDurations.length
      : null;

    const modes: Record<string, number> = {};
    for (const r of rows) {
      const mode = (r as any).failure_mode;
      if (mode && mode !== 'none') {
        modes[mode] = (modes[mode] ?? 0) + 1;
      }
    }

    return {
      totalAttempts: total,
      successCount: successes,
      successRate: total > 0 ? successes / total : 0,
      avgHoldDurationS: avgHold,
      failureModes: modes,
    };
  }

  // ---------------------------------------------------------------------------
  // Venue Zones
  // ---------------------------------------------------------------------------

  writeZone(zone: {
    id?: string;
    venueId: string;
    name: string;
    type: string;
    environment: string;
    floor?: number;
    polygon?: [number, number][];
    tierRequirement?: string;
    priority?: number;
    notes?: string | null;
  }): string {
    const id = zone.id ?? generateId();
    this.db
      .prepare(
        `INSERT INTO venue_zones (id, venue_id, name, type, environment, floor, polygon, tier_requirement, priority, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, type=excluded.type, environment=excluded.environment,
           floor=excluded.floor, polygon=excluded.polygon, tier_requirement=excluded.tier_requirement,
           priority=excluded.priority, notes=excluded.notes, updated_at=datetime('now')`,
      )
      .run(
        id,
        zone.venueId,
        zone.name,
        zone.type,
        zone.environment,
        zone.floor ?? 0,
        zone.polygon ? JSON.stringify(zone.polygon) : null,
        zone.tierRequirement ?? 'any',
        zone.priority ?? 5,
        zone.notes ?? null,
      );
    return id;
  }

  getZones(venueId: string): any[] {
    return this.db
      .prepare('SELECT * FROM venue_zones WHERE venue_id = ? ORDER BY floor, name')
      .all(venueId);
  }

  updateZone(id: string, patch: Record<string, unknown>): void {
    const zone = this.db.prepare('SELECT * FROM venue_zones WHERE id = ?').get(id) as any;
    if (!zone) return;

    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, val] of Object.entries(patch)) {
      const col = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      if (key === 'polygon') {
        updates.push(`${col} = ?`);
        values.push(JSON.stringify(val));
      } else {
        updates.push(`${col} = ?`);
        values.push(val);
      }
    }

    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE venue_zones SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteZone(id: string): void {
    this.db.prepare('DELETE FROM venue_zones WHERE id = ?').run(id);
  }

  // ---------------------------------------------------------------------------
  // Zone Connections
  // ---------------------------------------------------------------------------

  writeZoneConnection(conn: {
    id?: string;
    fromZoneId: string;
    toZoneId: string;
    traversalTimeSec?: number;
    bidirectional?: boolean;
  }): string {
    const id = conn.id ?? generateId();
    this.db
      .prepare(
        `INSERT INTO zone_connections (id, from_zone_id, to_zone_id, traversal_time_sec, bidirectional)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        conn.fromZoneId,
        conn.toZoneId,
        conn.traversalTimeSec ?? 10,
        conn.bidirectional !== false ? 1 : 0,
      );
    return id;
  }

  // ---------------------------------------------------------------------------
  // Perch Points
  // ---------------------------------------------------------------------------

  writePerchPoint(point: {
    id?: string;
    zoneId: string;
    name: string;
    surfaceType: string;
    position: { lat: number; lng: number; alt: number };
    headingDeg?: number | null;
    fovCoverageDeg?: number;
    suitabilityScore?: number;
  }): string {
    const id = point.id ?? generateId();
    this.db
      .prepare(
        `INSERT INTO perch_points (id, zone_id, name, surface_type, position_lat, position_lng, position_alt, heading_deg, fov_coverage_deg, suitability_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, surface_type=excluded.surface_type,
           position_lat=excluded.position_lat, position_lng=excluded.position_lng,
           position_alt=excluded.position_alt, heading_deg=excluded.heading_deg,
           fov_coverage_deg=excluded.fov_coverage_deg, suitability_score=excluded.suitability_score,
           updated_at=datetime('now')`,
      )
      .run(
        id,
        point.zoneId,
        point.name,
        point.surfaceType,
        point.position.lat,
        point.position.lng,
        point.position.alt,
        point.headingDeg ?? null,
        point.fovCoverageDeg ?? 120,
        point.suitabilityScore ?? 0.5,
      );
    return id;
  }

  getPerchPoints(zoneId: string): any[] {
    return this.db
      .prepare('SELECT * FROM perch_points WHERE zone_id = ? ORDER BY suitability_score DESC')
      .all(zoneId);
  }

  deletePerchPoint(id: string): void {
    this.db.prepare('DELETE FROM perch_points WHERE id = ?').run(id);
  }

  // ---------------------------------------------------------------------------
  // Kits
  // ---------------------------------------------------------------------------

  writeKit(kit: {
    id?: string;
    name: string;
    type: string;
    serial: string;
    status?: string;
    customerId?: string | null;
    tier1Count?: number;
    tier2Count?: number;
    notes?: string | null;
  }): string {
    const id = kit.id ?? generateId();
    const total = (kit.tier1Count ?? 0) + (kit.tier2Count ?? 0);
    this.db
      .prepare(
        `INSERT INTO kits (id, name, type, serial, status, customer_id, tier1_count, tier2_count, total_drones, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, type=excluded.type, serial=excluded.serial,
           status=excluded.status, customer_id=excluded.customer_id,
           tier1_count=excluded.tier1_count, tier2_count=excluded.tier2_count,
           total_drones=excluded.total_drones, notes=excluded.notes,
           updated_at=datetime('now')`,
      )
      .run(
        id,
        kit.name,
        kit.type,
        kit.serial,
        kit.status ?? 'ready',
        kit.customerId ?? null,
        kit.tier1Count ?? 0,
        kit.tier2Count ?? 0,
        total,
        kit.notes ?? null,
      );
    return id;
  }

  getKit(id: string): any {
    return this.db.prepare('SELECT * FROM kits WHERE id = ?').get(id);
  }

  queryKits(): any[] {
    return this.db
      .prepare('SELECT * FROM kits ORDER BY updated_at DESC')
      .all();
  }

  updateKit(id: string, patch: Record<string, unknown>): void {
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, val] of Object.entries(patch)) {
      const col = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      updates.push(`${col} = ?`);
      values.push(val);
    }

    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE kits SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteKit(id: string): void {
    this.db.prepare('DELETE FROM kits WHERE id = ?').run(id);
  }

  // ---------------------------------------------------------------------------
  // Drone Profiles
  // ---------------------------------------------------------------------------

  writeDroneProfile(drone: {
    id?: string;
    kitId: string;
    callsign: string;
    serial: string;
    tier: string;
    status?: string;
  }): string {
    const id = drone.id ?? generateId();
    this.db
      .prepare(
        `INSERT INTO drone_profiles (id, kit_id, callsign, serial, tier, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           callsign=excluded.callsign, serial=excluded.serial,
           tier=excluded.tier, status=excluded.status,
           updated_at=datetime('now')`,
      )
      .run(id, drone.kitId, drone.callsign, drone.serial, drone.tier, drone.status ?? 'idle');
    return id;
  }

  getDroneProfile(id: string): any {
    return this.db.prepare('SELECT * FROM drone_profiles WHERE id = ?').get(id);
  }

  queryDroneProfiles(kitId?: string): any[] {
    if (kitId) {
      return this.db
        .prepare('SELECT * FROM drone_profiles WHERE kit_id = ? ORDER BY tier, callsign')
        .all(kitId);
    }
    return this.db
      .prepare('SELECT * FROM drone_profiles ORDER BY tier, callsign')
      .all();
  }

  updateDroneProfile(id: string, patch: Record<string, unknown>): void {
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, val] of Object.entries(patch)) {
      const col = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      updates.push(`${col} = ?`);
      values.push(val);
    }

    if (updates.length === 0) return;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db
      .prepare(`UPDATE drone_profiles SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  deleteDroneProfile(id: string): void {
    this.db.prepare('DELETE FROM drone_profiles WHERE id = ?').run(id);
  }

  // ---------------------------------------------------------------------------
  // World Model Nodes
  // ---------------------------------------------------------------------------

  writeNode(node: {
    id?: string;
    type: string;
    description: string;
    embedding?: number[];
    surpriseScore?: number | null;
    outcomeContribution?: string | null;
    confidence?: number;
    decayWeight?: number;
    context?: Record<string, unknown> | null;
    venueId?: string | null;
    operationId?: string | null;
    droneId?: string | null;
    abstractionLevel?: string;
  }): string {
    const id = node.id ?? generateId();
    this.db
      .prepare(
        `INSERT INTO wm_nodes (id, type, description, embedding, surprise_score,
          outcome_contribution, confidence, decay_weight, context,
          venue_id, operation_id, drone_id, abstraction_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        node.type,
        node.description,
        node.embedding
          ? Buffer.from(new Float32Array(node.embedding).buffer)
          : null,
        node.surpriseScore ?? null,
        node.outcomeContribution ?? null,
        node.confidence ?? 0.5,
        node.decayWeight ?? 1.0,
        node.context ? JSON.stringify(node.context) : null,
        node.venueId ?? null,
        node.operationId ?? null,
        node.droneId ?? null,
        node.abstractionLevel ?? 'specific',
      );
    return id;
  }

  getNode(id: string): any {
    return this.db.prepare('SELECT * FROM wm_nodes WHERE id = ?').get(id);
  }

  queryNodes(filters?: {
    type?: string;
    venueId?: string;
    abstractionLevel?: string;
  }): any[] {
    let sql = 'SELECT * FROM wm_nodes WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }
    if (filters?.venueId) {
      sql += ' AND venue_id = ?';
      params.push(filters.venueId);
    }
    if (filters?.abstractionLevel) {
      sql += ' AND abstraction_level = ?';
      params.push(filters.abstractionLevel);
    }

    sql += ' ORDER BY updated_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  queryNodesBySimilarity(
    embedding: number[],
    limit = 10,
    filters?: { type?: string; venueId?: string },
  ): any[] {
    if (!this.vecLoaded) {
      console.warn('[OverwatchDB] Vector search unavailable, returning empty');
      return [];
    }

    const blob = Buffer.from(new Float32Array(embedding).buffer);

    let sql = `
      SELECT n.*, vec_distance_cosine(n.embedding, ?) AS distance
      FROM wm_nodes n
      WHERE n.embedding IS NOT NULL
    `;
    const params: any[] = [blob];

    if (filters?.type) {
      sql += ' AND n.type = ?';
      params.push(filters.type);
    }
    if (filters?.venueId) {
      sql += ' AND n.venue_id = ?';
      params.push(filters.venueId);
    }

    sql += ' ORDER BY distance ASC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params);
  }

  // ---------------------------------------------------------------------------
  // World Model Edges
  // ---------------------------------------------------------------------------

  writeEdge(edge: {
    id?: string;
    fromNode: string;
    toNode: string;
    relationship: string;
    mechanism?: string | null;
    confidence?: number;
    abstractionLevel?: string;
  }): string {
    const id = edge.id ?? generateId();
    this.db
      .prepare(
        `INSERT INTO wm_edges (id, from_node, to_node, relationship, mechanism, confidence, abstraction_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        edge.fromNode,
        edge.toNode,
        edge.relationship,
        edge.mechanism ?? null,
        edge.confidence ?? 0.5,
        edge.abstractionLevel ?? 'specific',
      );
    return id;
  }

  queryEdges(filters?: {
    fromNode?: string;
    toNode?: string;
    relationship?: string;
  }): any[] {
    let sql = 'SELECT * FROM wm_edges WHERE 1=1';
    const params: any[] = [];

    if (filters?.fromNode) {
      sql += ' AND from_node = ?';
      params.push(filters.fromNode);
    }
    if (filters?.toNode) {
      sql += ' AND to_node = ?';
      params.push(filters.toNode);
    }
    if (filters?.relationship) {
      sql += ' AND relationship = ?';
      params.push(filters.relationship);
    }

    return this.db.prepare(sql).all(...params);
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  getSetting(key: string): unknown {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as any;
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`,
      )
      .run(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  // ---------------------------------------------------------------------------
  // Sync helpers
  // ---------------------------------------------------------------------------

  private static readonly SYNCABLE_TABLES = [
    'venues', 'venue_zones', 'zone_connections', 'perch_points',
    'kits', 'drone_profiles', 'operations', 'principals',
    'wm_nodes', 'wm_edges',
  ];

  getUnsyncedEntities(table: string): any[] {
    return this.db
      .prepare(`SELECT * FROM ${table} WHERE synced_at IS NULL OR updated_at > synced_at`)
      .all();
  }

  getAllUnsyncedEntities(): { table: string; rows: any[] }[] {
    const result: { table: string; rows: any[] }[] = [];
    for (const table of OverwatchDB.SYNCABLE_TABLES) {
      const rows = this.getUnsyncedEntities(table);
      if (rows.length > 0) {
        result.push({ table, rows });
      }
    }
    return result;
  }

  markSynced(table: string, ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE ${table} SET synced_at = datetime('now') WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  getUnsyncedAlerts(): any[] {
    return this.db
      .prepare('SELECT * FROM alerts WHERE synced_at IS NULL')
      .all();
  }

  markAlertsSynced(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE alerts SET synced_at = datetime('now') WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  getUnsyncedSurfaceAssessments(): any[] {
    return this.db
      .prepare('SELECT * FROM surface_assessments WHERE synced_at IS NULL')
      .all();
  }

  markSurfaceAssessmentsSynced(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE surface_assessments SET synced_at = datetime('now') WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  getUnsyncedOverrideEpisodes(): any[] {
    return this.db
      .prepare('SELECT * FROM override_episodes WHERE synced_at IS NULL')
      .all();
  }

  markOverrideEpisodesSynced(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE override_episodes SET synced_at = datetime('now') WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  applyBootstrapData(data: Record<string, any[]>): void {
    const tableMap: Record<string, string> = {
      venues: 'venues',
      venue_zones: 'venue_zones',
      zone_connections: 'zone_connections',
      perch_points: 'perch_points',
      kits: 'kits',
      drones: 'drone_profiles',
      principals: 'principals',
      wm_nodes: 'wm_nodes',
      wm_edges: 'wm_edges',
    };

    this.db.transaction(() => {
      for (const [key, tableName] of Object.entries(tableMap)) {
        const rows = data[key];
        if (!rows || rows.length === 0) continue;

        for (const row of rows) {
          const cols = Object.keys(row);
          const placeholders = cols.map(() => '?').join(',');
          const onConflict = cols
            .filter((c) => c !== 'id')
            .map((c) => `${c}=excluded.${c}`)
            .join(',');

          this.db
            .prepare(
              `INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})
               ON CONFLICT(id) DO UPDATE SET ${onConflict}`,
            )
            .run(...cols.map((c) => row[c] ?? null));
        }
      }
    })();
  }

  applyPullEntities(entities: { table: string; id: string; data: Record<string, any> }[]): void {
    const tableMap: Record<string, string> = {
      venues: 'venues',
      venue_zones: 'venue_zones',
      zone_connections: 'zone_connections',
      perch_points: 'perch_points',
      kits: 'kits',
      drones: 'drone_profiles',
      operations: 'operations',
      principals: 'principals',
      wm_nodes: 'wm_nodes',
      wm_edges: 'wm_edges',
    };

    this.db.transaction(() => {
      for (const entity of entities) {
        const tableName = tableMap[entity.table] ?? entity.table;
        const row: Record<string, any> = { id: entity.id, ...entity.data };
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(',');
        const onConflict = cols
          .filter((c) => c !== 'id')
          .map((c) => `${c}=excluded.${c}`)
          .join(',');

        this.db
          .prepare(
            `INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})
             ON CONFLICT(id) DO UPDATE SET ${onConflict}`,
          )
          .run(...cols.map((c) => row[c] ?? null));
      }
    })();
  }

  getNodeCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM wm_nodes').get() as any;
    return row?.cnt ?? 0;
  }

  getEdgeCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM wm_edges').get() as any;
    return row?.cnt ?? 0;
  }
}
