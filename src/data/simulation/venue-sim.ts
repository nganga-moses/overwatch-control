import type { VenueZone, PerchPoint, ZoneConnection, SurfaceType, ZoneType, ZoneEnvironment } from '@/shared/types';

export interface SimVenue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zones: VenueZone[];
  perchPoints: PerchPoint[];
  connections: ZoneConnection[];
}

interface ZoneDef {
  name: string;
  type: ZoneType;
  environment: ZoneEnvironment;
  floor: number;
  offsetLat: number;
  offsetLng: number;
  tierRequirement: 'tier_1' | 'tier_2' | 'any';
  priority: number;
  perchCount: number;
}

const SURFACE_TYPES: SurfaceType[] = ['ceiling', 'wall', 'beam', 'pipe', 'ledge', 'railing'];
const OUTDOOR_SURFACES: SurfaceType[] = ['ledge', 'pole', 'overhang', 'tree_branch'];

function uid(): string {
  return crypto.randomUUID();
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makePolygon(
  centerLat: number,
  centerLng: number,
  sizeLat: number,
  sizeLng: number,
): [number, number][] {
  return [
    [centerLng - sizeLng, centerLat - sizeLat],
    [centerLng + sizeLng, centerLat - sizeLat],
    [centerLng + sizeLng, centerLat + sizeLat],
    [centerLng - sizeLng, centerLat + sizeLat],
  ];
}

export function createDefaultVenue(baseLat = 38.8977, baseLng = -77.0365): SimVenue {
  const venueId = uid();

  const zoneDefs: ZoneDef[] = [
    { name: 'Main Lobby', type: 'lobby', environment: 'indoor', floor: 0, offsetLat: 0, offsetLng: 0, tierRequirement: 'tier_1', priority: 8, perchCount: 3 },
    { name: 'East Corridor', type: 'corridor', environment: 'indoor', floor: 0, offsetLat: 0.0002, offsetLng: 0.0003, tierRequirement: 'tier_1', priority: 6, perchCount: 2 },
    { name: 'West Corridor', type: 'corridor', environment: 'indoor', floor: 0, offsetLat: -0.0002, offsetLng: -0.0003, tierRequirement: 'tier_1', priority: 6, perchCount: 2 },
    { name: 'Conference Room A', type: 'room', environment: 'indoor', floor: 0, offsetLat: 0.0003, offsetLng: 0.0005, tierRequirement: 'tier_1', priority: 9, perchCount: 2 },
    { name: 'VIP Suite', type: 'room', environment: 'indoor', floor: 1, offsetLat: 0.0001, offsetLng: 0.0001, tierRequirement: 'tier_1', priority: 10, perchCount: 3 },
    { name: 'Stairwell North', type: 'stairwell', environment: 'indoor', floor: 0, offsetLat: 0.0004, offsetLng: 0, tierRequirement: 'tier_1', priority: 7, perchCount: 1 },
    { name: 'Main Entrance', type: 'entrance', environment: 'outdoor', floor: 0, offsetLat: -0.0004, offsetLng: 0, tierRequirement: 'tier_2', priority: 9, perchCount: 2 },
    { name: 'Parking Area', type: 'parking', environment: 'outdoor', floor: 0, offsetLat: -0.0008, offsetLng: 0.0003, tierRequirement: 'tier_2', priority: 5, perchCount: 2 },
    { name: 'Perimeter East', type: 'perimeter', environment: 'outdoor', floor: 0, offsetLat: 0, offsetLng: 0.001, tierRequirement: 'tier_2', priority: 4, perchCount: 2 },
    { name: 'Rooftop Observation', type: 'rooftop', environment: 'outdoor', floor: 2, offsetLat: 0.0001, offsetLng: -0.0001, tierRequirement: 'tier_2', priority: 7, perchCount: 2 },
  ];

  const zones: VenueZone[] = [];
  const perchPoints: PerchPoint[] = [];

  for (const def of zoneDefs) {
    const zoneId = uid();
    const zoneLat = baseLat + def.offsetLat;
    const zoneLng = baseLng + def.offsetLng;

    zones.push({
      id: zoneId,
      venueId,
      name: def.name,
      type: def.type,
      environment: def.environment,
      floor: def.floor,
      polygon: makePolygon(zoneLat, zoneLng, 0.00015, 0.0002),
      tierRequirement: def.tierRequirement,
      priority: def.priority,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const surfaces = def.environment === 'indoor' ? SURFACE_TYPES : OUTDOOR_SURFACES;
    for (let p = 0; p < def.perchCount; p++) {
      const pLat = zoneLat + (Math.random() - 0.5) * 0.0002;
      const pLng = zoneLng + (Math.random() - 0.5) * 0.0003;
      const alt = def.environment === 'indoor' ? 2.5 + Math.random() * 1.5 : 3 + Math.random() * 5;

      perchPoints.push({
        id: uid(),
        zoneId,
        name: `${def.name} PP-${p + 1}`,
        surfaceType: randomItem(surfaces),
        position: { lat: pLat, lng: pLng, alt },
        headingDeg: Math.random() * 360,
        fovCoverageDeg: 90 + Math.random() * 60,
        suitabilityScore: 0.5 + Math.random() * 0.5,
        isVerified: Math.random() > 0.5,
        lastUsed: null,
        successRate: 0.7 + Math.random() * 0.3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Build connectivity (adjacent zones are connected)
  const connections: ZoneConnection[] = [];
  const indoorZones = zones.filter((z) => z.environment === 'indoor');
  const outdoorZones = zones.filter((z) => z.environment === 'outdoor');

  for (let i = 0; i < indoorZones.length - 1; i++) {
    connections.push({
      id: uid(),
      fromZoneId: indoorZones[i].id,
      toZoneId: indoorZones[i + 1].id,
      traversalTimeSec: 5 + Math.random() * 10,
      bidirectional: true,
    });
  }
  for (let i = 0; i < outdoorZones.length - 1; i++) {
    connections.push({
      id: uid(),
      fromZoneId: outdoorZones[i].id,
      toZoneId: outdoorZones[i + 1].id,
      traversalTimeSec: 8 + Math.random() * 15,
      bidirectional: true,
    });
  }

  // Connect entrance to lobby (indoor-outdoor transition)
  const lobby = zones.find((z) => z.type === 'lobby');
  const entrance = zones.find((z) => z.type === 'entrance');
  if (lobby && entrance) {
    connections.push({
      id: uid(),
      fromZoneId: entrance.id,
      toZoneId: lobby.id,
      traversalTimeSec: 3,
      bidirectional: true,
    });
  }

  return {
    id: venueId,
    name: 'Embassy Compound Alpha',
    lat: baseLat,
    lng: baseLng,
    zones,
    perchPoints,
    connections,
  };
}

export function getZoneForPoint(
  venue: SimVenue,
  point: { lat: number; lng: number },
): VenueZone | null {
  for (const zone of venue.zones) {
    if (!zone.polygon || zone.polygon.length < 3) continue;
    const lngs = zone.polygon.map((p) => p[0]);
    const lats = zone.polygon.map((p) => p[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    if (
      point.lng >= minLng &&
      point.lng <= maxLng &&
      point.lat >= minLat &&
      point.lat <= maxLat
    ) {
      return zone;
    }
  }
  return null;
}

export function getAdjacentZones(
  venue: SimVenue,
  zoneId: string,
): VenueZone[] {
  const neighborIds = new Set<string>();
  for (const conn of venue.connections) {
    if (conn.fromZoneId === zoneId) neighborIds.add(conn.toZoneId);
    if (conn.toZoneId === zoneId && conn.bidirectional)
      neighborIds.add(conn.fromZoneId);
  }
  return venue.zones.filter((z) => neighborIds.has(z.id));
}
