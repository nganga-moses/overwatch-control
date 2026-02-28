export type PrincipalStatus = 'safe' | 'at_risk' | 'unknown' | 'offline';

export interface Principal {
  id: string;
  name: string;
  codename: string;
  status: PrincipalStatus;
  currentZoneId: string | null;
  lastKnownPosition: { lat: number; lng: number } | null;
  bleBeaconId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
