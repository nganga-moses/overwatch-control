export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial Overwatch schema',
    sql: `
      -- Kits (physical drone cases)
      CREATE TABLE IF NOT EXISTS kits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('alpha', 'bravo', 'charlie')),
        status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'deployed', 'maintenance', 'transit')),
        serial TEXT NOT NULL UNIQUE,
        customer_id TEXT,
        tier1_count INTEGER NOT NULL DEFAULT 0,
        tier2_count INTEGER NOT NULL DEFAULT 0,
        total_drones INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Drone profiles
      CREATE TABLE IF NOT EXISTS drone_profiles (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
        callsign TEXT NOT NULL,
        serial TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL CHECK (tier IN ('tier_1', 'tier_2')),
        status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'fault', 'charging', 'offline')),
        battery_percent REAL NOT NULL DEFAULT 100.0,
        perch_state TEXT NOT NULL DEFAULT 'sleeping' CHECK (perch_state IN ('sleeping', 'launching', 'transit', 'perching', 'perched', 'repositioning', 'returning')),
        current_zone_id TEXT,
        current_perch_point_id TEXT,
        position_lat REAL,
        position_lng REAL,
        position_alt REAL,
        perch_started_at INTEGER,
        last_heartbeat INTEGER,
        flight_hours REAL NOT NULL DEFAULT 0.0,
        total_perches INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_drone_profiles_kit ON drone_profiles(kit_id);
      CREATE INDEX IF NOT EXISTS idx_drone_profiles_tier ON drone_profiles(tier);

      -- Venues
      CREATE TABLE IF NOT EXISTS venues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('indoor', 'outdoor', 'mixed')),
        address TEXT,
        lat REAL,
        lng REAL,
        floor_plan_path TEXT,
        floor_count INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        operation_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Venue zones
      CREATE TABLE IF NOT EXISTS venue_zones (
        id TEXT PRIMARY KEY,
        venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('lobby', 'corridor', 'room', 'stairwell', 'elevator', 'parking', 'perimeter', 'rooftop', 'courtyard', 'entrance', 'custom')),
        environment TEXT NOT NULL CHECK (environment IN ('indoor', 'outdoor')),
        floor INTEGER NOT NULL DEFAULT 0,
        polygon TEXT, -- JSON array of [lng, lat] pairs
        tier_requirement TEXT NOT NULL DEFAULT 'any' CHECK (tier_requirement IN ('tier_1', 'tier_2', 'any')),
        priority INTEGER NOT NULL DEFAULT 5,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_venue_zones_venue ON venue_zones(venue_id);

      -- Zone connections (graph edges for navigation)
      CREATE TABLE IF NOT EXISTS zone_connections (
        id TEXT PRIMARY KEY,
        from_zone_id TEXT NOT NULL REFERENCES venue_zones(id) ON DELETE CASCADE,
        to_zone_id TEXT NOT NULL REFERENCES venue_zones(id) ON DELETE CASCADE,
        traversal_time_sec REAL NOT NULL DEFAULT 10.0,
        bidirectional INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_zone_connections_from ON zone_connections(from_zone_id);
      CREATE INDEX IF NOT EXISTS idx_zone_connections_to ON zone_connections(to_zone_id);

      -- Perch points
      CREATE TABLE IF NOT EXISTS perch_points (
        id TEXT PRIMARY KEY,
        zone_id TEXT NOT NULL REFERENCES venue_zones(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        surface_type TEXT NOT NULL CHECK (surface_type IN ('ceiling', 'wall', 'beam', 'pipe', 'ledge', 'railing', 'tree_branch', 'pole', 'overhang', 'custom')),
        position_lat REAL NOT NULL,
        position_lng REAL NOT NULL,
        position_alt REAL NOT NULL,
        heading_deg REAL,
        fov_coverage_deg REAL NOT NULL DEFAULT 120.0,
        suitability_score REAL NOT NULL DEFAULT 0.5,
        is_verified INTEGER NOT NULL DEFAULT 0,
        last_used TEXT,
        success_rate REAL NOT NULL DEFAULT 1.0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_perch_points_zone ON perch_points(zone_id);

      -- Surface assessments (historical perch attempt data)
      CREATE TABLE IF NOT EXISTS surface_assessments (
        id TEXT PRIMARY KEY,
        perch_point_id TEXT NOT NULL REFERENCES perch_points(id) ON DELETE CASCADE,
        drone_id TEXT NOT NULL,
        attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
        success INTEGER NOT NULL,
        duration_ms INTEGER,
        surface_quality REAL,
        notes TEXT
      );

      -- Operations
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        venue_id TEXT NOT NULL REFERENCES venues(id),
        kit_id TEXT NOT NULL REFERENCES kits(id),
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'briefing', 'deploying', 'active', 'paused', 'recovering', 'completed', 'aborted')),
        principal_id TEXT,
        started_at TEXT,
        ended_at TEXT,
        active_drones INTEGER NOT NULL DEFAULT 0,
        total_alerts INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_operations_venue ON operations(venue_id);
      CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);

      -- Principals (persons under protection)
      CREATE TABLE IF NOT EXISTS principals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        codename TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('safe', 'at_risk', 'unknown', 'offline')),
        current_zone_id TEXT,
        last_known_lat REAL,
        last_known_lng REAL,
        ble_beacon_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Protection agents (human security team members)
      CREATE TABLE IF NOT EXISTS protection_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        callsign TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent',
        current_zone_id TEXT,
        last_known_lat REAL,
        last_known_lng REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Alerts
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        operation_id TEXT REFERENCES operations(id),
        drone_id TEXT,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        zone_id TEXT,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_operation ON alerts(operation_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);

      -- Weather observations
      CREATE TABLE IF NOT EXISTS weather_observations (
        id TEXT PRIMARY KEY,
        venue_id TEXT REFERENCES venues(id),
        wind_speed_ms REAL,
        wind_direction_deg REAL,
        temperature_c REAL,
        humidity_percent REAL,
        precipitation TEXT,
        visibility_m REAL,
        outdoor_flight_ok INTEGER NOT NULL DEFAULT 1,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- World Model nodes (causal knowledge graph)
      CREATE TABLE IF NOT EXISTS wm_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('action', 'consequence', 'context', 'condition', 'pattern')),
        description TEXT NOT NULL,
        embedding BLOB,
        surprise_score REAL,
        outcome_contribution TEXT CHECK (outcome_contribution IN ('positive', 'neutral', 'negative', 'unknown')),
        confidence REAL NOT NULL DEFAULT 0.5,
        decay_weight REAL NOT NULL DEFAULT 1.0,
        context TEXT, -- JSON
        venue_id TEXT,
        operation_id TEXT,
        drone_id TEXT,
        abstraction_level TEXT NOT NULL DEFAULT 'specific' CHECK (abstraction_level IN ('specific', 'pattern', 'principle')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_wm_nodes_type ON wm_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_wm_nodes_venue ON wm_nodes(venue_id);

      -- World Model edges
      CREATE TABLE IF NOT EXISTS wm_edges (
        id TEXT PRIMARY KEY,
        from_node TEXT NOT NULL REFERENCES wm_nodes(id) ON DELETE CASCADE,
        to_node TEXT NOT NULL REFERENCES wm_nodes(id) ON DELETE CASCADE,
        relationship TEXT NOT NULL CHECK (relationship IN ('caused', 'prevented', 'enabled', 'degraded', 'required', 'generalizes_to')),
        mechanism TEXT,
        context_hash TEXT,
        confidence REAL NOT NULL DEFAULT 0.5,
        observations INTEGER NOT NULL DEFAULT 1,
        abstraction_level TEXT NOT NULL DEFAULT 'specific' CHECK (abstraction_level IN ('specific', 'pattern', 'principle')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_wm_edges_from ON wm_edges(from_node);
      CREATE INDEX IF NOT EXISTS idx_wm_edges_to ON wm_edges(to_node);

      -- Override episodes (human corrections to autonomous decisions)
      CREATE TABLE IF NOT EXISTS override_episodes (
        id TEXT PRIMARY KEY,
        operation_id TEXT REFERENCES operations(id),
        drone_id TEXT,
        override_type TEXT NOT NULL,
        original_action TEXT NOT NULL,
        corrected_action TEXT NOT NULL,
        reason TEXT,
        outcome TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Settings (key-value store)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    description: 'Add sync tracking columns',
    sql: `
      ALTER TABLE kits ADD COLUMN synced_at TEXT;
      ALTER TABLE kits ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE drone_profiles ADD COLUMN synced_at TEXT;
      ALTER TABLE drone_profiles ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE venues ADD COLUMN synced_at TEXT;
      ALTER TABLE venues ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE venue_zones ADD COLUMN synced_at TEXT;
      ALTER TABLE venue_zones ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE zone_connections ADD COLUMN synced_at TEXT;
      ALTER TABLE zone_connections ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE perch_points ADD COLUMN synced_at TEXT;
      ALTER TABLE perch_points ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE operations ADD COLUMN synced_at TEXT;
      ALTER TABLE operations ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE principals ADD COLUMN synced_at TEXT;
      ALTER TABLE principals ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE alerts ADD COLUMN synced_at TEXT;

      ALTER TABLE wm_nodes ADD COLUMN synced_at TEXT;
      ALTER TABLE wm_nodes ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE wm_edges ADD COLUMN synced_at TEXT;
      ALTER TABLE wm_edges ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE override_episodes ADD COLUMN synced_at TEXT;

      ALTER TABLE surface_assessments ADD COLUMN synced_at TEXT;
    `,
  },
  {
    version: 3,
    description: 'Floor plan cache tracking + surface assessment upgrade',
    sql: `
      ALTER TABLE venues ADD COLUMN floor_plan_blob_key TEXT;
      ALTER TABLE venues ADD COLUMN floor_plan_local_path TEXT;
      ALTER TABLE venues ADD COLUMN floor_plan_cached INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE venues ADD COLUMN floor_plan_cached_at TEXT;

      CREATE TABLE IF NOT EXISTS surface_assessments_v2 (
        id TEXT PRIMARY KEY,
        perch_point_id TEXT NOT NULL REFERENCES perch_points(id) ON DELETE CASCADE,
        operation_id TEXT REFERENCES operations(id),
        drone_id TEXT NOT NULL,
        drone_tier TEXT,
        surface_class_predicted TEXT,
        surface_class_actual TEXT,
        surface_orientation TEXT,
        tof_roughness REAL,
        weather_conditions TEXT,
        spine_engaged INTEGER,
        suction_engaged INTEGER,
        landing_gear_used INTEGER,
        hold_duration_s REAL,
        failure_mode TEXT,
        approach_image_path TEXT,
        assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sa_v2_perch ON surface_assessments_v2(perch_point_id);
      CREATE INDEX IF NOT EXISTS idx_sa_v2_operation ON surface_assessments_v2(operation_id);

      INSERT INTO surface_assessments_v2 (id, perch_point_id, drone_id, hold_duration_s, assessed_at, synced_at)
      SELECT id, perch_point_id, drone_id, CAST(duration_ms AS REAL) / 1000.0, attempted_at, synced_at
      FROM surface_assessments;

      DROP TABLE IF EXISTS surface_assessments;
      ALTER TABLE surface_assessments_v2 RENAME TO surface_assessments;
    `,
  },
  {
    version: 4,
    description: 'Workstation config, operators, audit log for auth & provisioning',
    sql: `
      CREATE TABLE IF NOT EXISTS workstation_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS operators (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        pin_digits_json TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        operator_id TEXT REFERENCES operators(id),
        action TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 5,
    description: 'Add missing timestamp columns to zone_connections',
    sql: `
      ALTER TABLE zone_connections ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
      ALTER TABLE zone_connections ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
    `,
  },
  {
    version: 6,
    description: 'Per-floor plan images for multi-page PDFs',
    sql: `
      CREATE TABLE IF NOT EXISTS floor_plan_images (
        id TEXT PRIMARY KEY,
        venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        floor_level INTEGER NOT NULL,
        blob_key TEXT NOT NULL,
        local_path TEXT,
        cached INTEGER NOT NULL DEFAULT 0,
        cached_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(venue_id, floor_level)
      );
    `,
  },
  {
    version: 7,
    description: 'Phase 4 – expanded operations, principal ReID, agent sync, weather ops',
    sql: `
      -- 1. Recreate operations table with expanded columns
      CREATE TABLE operations_v2 (
        id TEXT PRIMARY KEY,
        venue_id TEXT NOT NULL REFERENCES venues(id),
        name TEXT NOT NULL,
        type TEXT,
        status TEXT NOT NULL DEFAULT 'planning'
          CHECK (status IN ('planning', 'briefing', 'deploying', 'active', 'repositioning', 'paused', 'recovering', 'completed', 'aborted')),
        environment TEXT,
        principal_id TEXT,
        assigned_kit_ids TEXT,
        planned_start TEXT,
        planned_end TEXT,
        actual_start TEXT,
        actual_end TEXT,
        active_drones INTEGER NOT NULL DEFAULT 0,
        total_alerts INTEGER NOT NULL DEFAULT 0,
        drone_count_tier1 INTEGER,
        drone_count_tier2 INTEGER,
        deploy_time_s REAL,
        total_repositions INTEGER DEFAULT 0,
        coverage_score_avg REAL,
        alert_summary_json TEXT,
        briefing_json TEXT,
        post_op_json TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT,
        cloud_version INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO operations_v2 (
        id, venue_id, name, status, principal_id,
        assigned_kit_ids,
        actual_start, actual_end,
        active_drones, total_alerts, notes,
        created_at, updated_at, synced_at, cloud_version
      )
      SELECT
        id, venue_id, name, status, principal_id,
        CASE WHEN kit_id IS NOT NULL THEN json_array(kit_id) ELSE NULL END,
        started_at, ended_at,
        active_drones, total_alerts, notes,
        created_at, updated_at, synced_at, cloud_version
      FROM operations;

      DROP TABLE operations;
      ALTER TABLE operations_v2 RENAME TO operations;

      CREATE INDEX IF NOT EXISTS idx_operations_venue ON operations(venue_id);
      CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);

      -- 2. Add ReID columns to principals
      ALTER TABLE principals ADD COLUMN reid_embedding BLOB;
      ALTER TABLE principals ADD COLUMN reid_updated_at TEXT;
      ALTER TABLE principals ADD COLUMN operation_count INTEGER NOT NULL DEFAULT 0;

      -- 3. Add sync columns to protection_agents
      ALTER TABLE protection_agents ADD COLUMN notes TEXT;
      ALTER TABLE protection_agents ADD COLUMN synced_at TEXT;
      ALTER TABLE protection_agents ADD COLUMN cloud_version INTEGER NOT NULL DEFAULT 0;

      -- 4. Add weather_observations columns
      ALTER TABLE weather_observations ADD COLUMN operation_id TEXT REFERENCES operations(id);
      ALTER TABLE weather_observations ADD COLUMN wind_gust_ms REAL;
      ALTER TABLE weather_observations ADD COLUMN source TEXT;
    `,
  },
  {
    version: 8,
    description: 'Make operations.venue_id nullable for draft missions',
    sql: `
      CREATE TABLE operations_v3 (
        id TEXT PRIMARY KEY,
        venue_id TEXT REFERENCES venues(id),
        name TEXT NOT NULL,
        type TEXT,
        status TEXT NOT NULL DEFAULT 'planning'
          CHECK (status IN ('planning', 'briefing', 'deploying', 'active', 'repositioning', 'paused', 'recovering', 'completed', 'aborted')),
        environment TEXT,
        principal_id TEXT,
        assigned_kit_ids TEXT,
        planned_start TEXT,
        planned_end TEXT,
        actual_start TEXT,
        actual_end TEXT,
        active_drones INTEGER NOT NULL DEFAULT 0,
        total_alerts INTEGER NOT NULL DEFAULT 0,
        drone_count_tier1 INTEGER,
        drone_count_tier2 INTEGER,
        deploy_time_s REAL,
        total_repositions INTEGER DEFAULT 0,
        coverage_score_avg REAL,
        alert_summary_json TEXT,
        briefing_json TEXT,
        post_op_json TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT,
        cloud_version INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO operations_v3 SELECT * FROM operations;
      DROP TABLE operations;
      ALTER TABLE operations_v3 RENAME TO operations;

      CREATE INDEX IF NOT EXISTS idx_operations_venue ON operations(venue_id);
      CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
    `,
  },
  {
    version: 9,
    description: 'Add drone health and maintenance columns',
    sql: `
      ALTER TABLE drone_profiles ADD COLUMN hardware_class TEXT;
      ALTER TABLE drone_profiles ADD COLUMN spine_array_condition TEXT DEFAULT 'good';
      ALTER TABLE drone_profiles ADD COLUMN suction_pump_condition TEXT DEFAULT 'good';
      ALTER TABLE drone_profiles ADD COLUMN landing_gear_condition TEXT;
      ALTER TABLE drone_profiles ADD COLUMN total_flight_hours REAL DEFAULT 0.0;
      ALTER TABLE drone_profiles ADD COLUMN total_perch_hours REAL DEFAULT 0.0;
      ALTER TABLE drone_profiles ADD COLUMN total_attachments INTEGER DEFAULT 0;
      ALTER TABLE drone_profiles ADD COLUMN attachment_success_rate REAL;
      ALTER TABLE drone_profiles ADD COLUMN battery_cycles INTEGER DEFAULT 0;
      ALTER TABLE drone_profiles ADD COLUMN battery_health_pct REAL;
      ALTER TABLE drone_profiles ADD COLUMN surface_performance TEXT;
      ALTER TABLE drone_profiles ADD COLUMN reliability_score REAL;
      ALTER TABLE drone_profiles ADD COLUMN last_deployed_at TEXT;
      ALTER TABLE drone_profiles ADD COLUMN last_maintained_at TEXT;
    `,
  },
  {
    version: 10,
    description: 'Intelligence & orchestrator schema',
    sql: `
      ALTER TABLE alerts ADD COLUMN type TEXT;
      ALTER TABLE alerts ADD COLUMN confidence REAL;
      ALTER TABLE alerts ADD COLUMN drone_tier TEXT;
      ALTER TABLE alerts ADD COLUMN detection_data_json TEXT;
      ALTER TABLE alerts ADD COLUMN operator_validated INTEGER;
      ALTER TABLE alerts ADD COLUMN operator_notes TEXT;

      CREATE TABLE IF NOT EXISTS orchestrator_decisions (
        id TEXT PRIMARY KEY,
        operation_id TEXT,
        event_type TEXT NOT NULL,
        action TEXT NOT NULL,
        reasoning TEXT,
        confidence REAL DEFAULT 0.5,
        autonomy_tier TEXT NOT NULL DEFAULT 'confirm' CHECK (autonomy_tier IN ('auto', 'suggest', 'confirm')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired')),
        parameters_json TEXT,
        drone_id TEXT,
        zone_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        executed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_operation ON orchestrator_decisions(operation_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_status ON orchestrator_decisions(status);

      CREATE TABLE IF NOT EXISTS orchestrator_state (
        id TEXT PRIMARY KEY,
        model_json TEXT NOT NULL,
        session_id TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS orchestrator_transcript (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        intent_class TEXT,
        action_card_json TEXT,
        structured_data TEXT,
        significance TEXT,
        wm_node_ids TEXT,
        voice INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_transcript_session ON orchestrator_transcript(session_id);
    `,
  },
];
