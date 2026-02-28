export type VenueType = 'indoor' | 'outdoor' | 'mixed';

export type ZoneType =
  | 'lobby'
  | 'corridor'
  | 'room'
  | 'stairwell'
  | 'elevator'
  | 'parking'
  | 'perimeter'
  | 'rooftop'
  | 'courtyard'
  | 'entrance'
  | 'custom';

export type ZoneEnvironment = 'indoor' | 'outdoor';

export type SurfaceType =
  | 'ceiling'
  | 'wall'
  | 'beam'
  | 'pipe'
  | 'ledge'
  | 'railing'
  | 'tree_branch'
  | 'pole'
  | 'overhang'
  | 'custom';

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  address: string | null;
  lat: number | null;
  lng: number | null;
  floorPlanPath: string | null;
  floorCount: number;
  notes: string | null;
  operationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VenueZone {
  id: string;
  venueId: string;
  name: string;
  type: ZoneType;
  environment: ZoneEnvironment;
  floor: number;
  polygon: [number, number][];
  tierRequirement: 'tier_1' | 'tier_2' | 'any';
  priority: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneConnection {
  id: string;
  fromZoneId: string;
  toZoneId: string;
  traversalTimeSec: number;
  bidirectional: boolean;
}

export interface PerchPoint {
  id: string;
  zoneId: string;
  name: string;
  surfaceType: SurfaceType;
  position: { lat: number; lng: number; alt: number };
  headingDeg: number | null;
  fovCoverageDeg: number;
  suitabilityScore: number;
  isVerified: boolean;
  lastUsed: string | null;
  successRate: number;
  createdAt: string;
  updatedAt: string;
}
