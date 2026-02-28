export type Tier = 'tier_1' | 'tier_2';

export type PerchState =
  | 'sleeping'
  | 'launching'
  | 'transit'
  | 'perching'
  | 'perched'
  | 'repositioning'
  | 'returning';

export type DroneStatus = 'idle' | 'active' | 'fault' | 'charging' | 'offline';

export interface DroneProfile {
  id: string;
  kitId: string;
  callsign: string;
  serial: string;
  tier: Tier;
  status: DroneStatus;
  batteryPercent: number;
  perchState: PerchState;
  currentZoneId: string | null;
  currentPerchPointId: string | null;
  position: { lat: number; lng: number; alt: number } | null;
  perchStartedAt: number | null;
  lastHeartbeat: number | null;
  flightHours: number;
  totalPerches: number;
  createdAt: string;
  updatedAt: string;
}

export interface DroneTelemetry {
  droneId: string;
  timestamp: number;
  batteryPercent: number;
  position: { lat: number; lng: number; alt: number };
  perchState: PerchState;
  currentZoneId: string | null;
  signalStrength: number;
  cpuTemp: number;
}
