import type { PerchState, DroneTelemetry, Tier } from '@/shared/types';

export type OWMessageType =
  | 'drone:telemetry'
  | 'drone:stateChange'
  | 'drone:alert'
  | 'drone:perchResult'
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

export function createMessage<T>(
  type: OWMessageType,
  sourceId: string,
  payload: T,
): OWMessage<T> {
  return { type, timestamp: Date.now(), sourceId, payload };
}
