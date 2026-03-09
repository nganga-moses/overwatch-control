import type { PerchState, DroneTelemetry, Tier } from '@/shared/types';

export type OWMessageType =
  | 'drone:telemetry'
  | 'drone:stateChange'
  | 'drone:alert'
  | 'drone:perchResult'
  | 'drone:indoorTelemetry'
  | 'drone:slamMapUpdate'
  | 'principal:positionUpdate'
  | 'principal:zoneTransition'
  | 'coverage:update'
  | 'coverage:gap'
  | 'operation:statusChange'
  | 'system:heartbeat'
  | 'system:error';

export interface OWMessage<T = unknown> {
  type: OWMessageType;
  timestamp: number;
  sourceId: string;
  payload: T;
}

export interface DroneStateChangePayload {
  droneId: string;
  previousState: PerchState;
  newState: PerchState;
  zoneId: string | null;
  perchPointId: string | null;
}

export interface DroneAlertPayload {
  droneId: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'battery' | 'perch_failure' | 'signal_loss' | 'obstacle' | 'intruder' | 'system';
  message: string;
  zoneId: string | null;
}

export interface PerchResultPayload {
  droneId: string;
  perchPointId: string;
  success: boolean;
  surfaceType: string;
  attemptDurationMs: number;
}

export interface PrincipalPositionPayload {
  principalId: string;
  position: { lat: number; lng: number };
  zoneId: string | null;
  confidence: number;
}

export interface CoverageUpdatePayload {
  zoneId: string;
  coveredByDrones: string[];
  coveragePercent: number;
}

export interface CoverageGapPayload {
  zoneId: string;
  gapDurationSec: number;
  nearestDroneId: string | null;
  estimatedFillTimeSec: number;
}

export interface DroneCommand {
  type: 'launch' | 'perch' | 'reposition' | 'return' | 'sleep' | 'abort';
  droneId: string;
  targetPerchPointId?: string;
  targetZoneId?: string;
}

// ---------------------------------------------------------------------------
// Indoor wire protocol types — matches fireflyos-squad ground_station_link.rs
// ---------------------------------------------------------------------------

/** Inbound from drone: indoor positioning and SLAM telemetry. */
export interface IndoorTelemetryPayload {
  droneId: string;
  positionSource: 'gps' | 'slam' | 'dead_reckoning';
  slamQuality: number;
  slamDriftM: number;
  zoneId: string | null;
  perchState: string | null;
  trackedFeatures: number;
  position: [number, number, number];
  confidence: number;
}

/** Inbound from drone: SLAM map point cloud delta for venue model merge. */
export interface SlamMapUpdatePayload {
  droneId: string;
  mapPointCount: number;
  newPoints: Array<{ x: number; y: number; z: number; observations: number }>;
  deletedPointIds: string[];
}

/** Outbound to drone: compact venue model pushed on connection. */
export interface VenueModelPayload {
  venueId: string;
  venueName: string;
  zones: VenueZoneCompact[];
  connections: ZoneConnectionCompact[];
  perchPoints: PerchPointCompact[];
}

export interface VenueZoneCompact {
  id: string;
  name: string;
  polygon: [number, number][];
  environment: string;
  floor: number;
  tierRequirement: string;
}

export interface ZoneConnectionCompact {
  zoneA: string;
  zoneB: string;
  connectionType: string;
  widthM: number;
  heightM: number;
  isAccessible: boolean;
}

export interface PerchPointCompact {
  id: string;
  zoneId: string;
  position: [number, number, number];
  surfaceClass: string;
  attachmentMethod: string;
  headingDeg: number | null;
  fovCoverageDeg: number;
}

/** Outbound to drone: perch at a specific point. */
export interface PerchCommandPayload {
  targetPerchId: string;
  zoneId: string;
  position: [number, number, number];
  surfaceClass: string;
  headingDeg: number | null;
}

/** Outbound to drone: reposition to a new zone/perch. */
export interface RepositionCommandPayload {
  targetZoneId: string;
  targetPerchId: string | null;
  reason: string;
  urgency: 'routine' | 'urgent' | 'emergency';
}

// ---------------------------------------------------------------------------
// GS wire protocol types — translation layer for SwarmServer
// ---------------------------------------------------------------------------

/** GS inbound message types (from fireflyos-squad) */
export type GSInboundType =
  | 'Heartbeat'
  | 'AggregatedSurprise'
  | 'SafetyEvent'
  | 'LeaderChange'
  | 'IndoorTelemetry'
  | 'SlamMapUpdate'
  | 'StreamStarted'
  | 'StreamStopped'
  | 'StreamError';

export interface GSHeartbeat {
  leader_id: number;
  leader_callsign: string;
  member_count: number;
  uptime_s: number;
  mesh_quality: number;
  swarm_id?: string;
}

/** GS outbound message types (to fireflyos-squad) */
export type GSOutboundType =
  | 'HeartbeatAck'
  | 'SwarmCommand'
  | 'MissionArtifact'
  | 'VenueModel'
  | 'PerchCommand'
  | 'RepositionCommand'
  | 'StartStream'
  | 'StopStream'
  | 'SetBitrate'
  | 'SetResolution';

/** Connection state for swarm sessions. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SwarmConnectionStatus {
  swarmId: string;
  state: ConnectionState;
  leaderCallsign: string | null;
  memberCount: number;
  meshQuality: number;
  connectedAt: string | null;
}

export function createMessage<T>(
  type: OWMessageType,
  sourceId: string,
  payload: T,
): OWMessage<T> {
  return { type, timestamp: Date.now(), sourceId, payload };
}
