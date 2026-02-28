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
}
