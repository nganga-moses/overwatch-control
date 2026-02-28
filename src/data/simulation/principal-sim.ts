import type { Principal } from '@/shared/types';
import type { SimVenue } from './venue-sim';
import { getAdjacentZones } from './venue-sim';

export interface SimPrincipal extends Principal {
  movementPattern: 'stationary' | 'walking' | 'indoor_outdoor';
  currentPathIndex: number;
  pathZoneIds: string[];
  dwellTimeRemaining: number;
  speed: number;
}

function uid(): string {
  return crypto.randomUUID();
}

export function createSimPrincipal(venue: SimVenue): SimPrincipal {
  const indoorZones = venue.zones.filter((z) => z.environment === 'indoor');
  const startZone = indoorZones.length > 0 ? indoorZones[0] : venue.zones[0];

  const polygon = startZone.polygon;
  const centerLat = polygon
    ? polygon.reduce((s, p) => s + p[1], 0) / polygon.length
    : venue.lat;
  const centerLng = polygon
    ? polygon.reduce((s, p) => s + p[0], 0) / polygon.length
    : venue.lng;

  return {
    id: uid(),
    name: 'Principal',
    codename: 'EAGLE',
    status: 'safe',
    currentZoneId: startZone.id,
    lastKnownPosition: { lat: centerLat, lng: centerLng },
    bleBeaconId: `BLE-${uid().slice(0, 8)}`,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    movementPattern: 'walking',
    currentPathIndex: 0,
    pathZoneIds: [startZone.id],
    dwellTimeRemaining: 10 + Math.random() * 20,
    speed: 0.8 + Math.random() * 0.4,
  };
}

export function tickPrincipal(
  principal: SimPrincipal,
  venue: SimVenue,
  dtMs: number,
): SimPrincipal {
  const updated = { ...principal };
  const dtSec = dtMs / 1000;

  if (updated.movementPattern === 'stationary') return updated;

  updated.dwellTimeRemaining -= dtSec;

  if (updated.dwellTimeRemaining <= 0) {
    const currentZone = venue.zones.find((z) => z.id === updated.currentZoneId);
    if (!currentZone) return updated;

    let adjacent = getAdjacentZones(venue, currentZone.id);

    if (updated.movementPattern === 'walking') {
      adjacent = adjacent.filter((z) => z.environment === currentZone.environment);
    }

    if (adjacent.length > 0) {
      const nextZone = adjacent[Math.floor(Math.random() * adjacent.length)];
      updated.currentZoneId = nextZone.id;
      updated.pathZoneIds = [...updated.pathZoneIds.slice(-10), nextZone.id];
      updated.currentPathIndex++;

      const polygon = nextZone.polygon;
      if (polygon && polygon.length >= 3) {
        updated.lastKnownPosition = {
          lat:
            polygon.reduce((s, p) => s + p[1], 0) / polygon.length +
            (Math.random() - 0.5) * 0.00005,
          lng:
            polygon.reduce((s, p) => s + p[0], 0) / polygon.length +
            (Math.random() - 0.5) * 0.00005,
        };
      }
    }

    updated.dwellTimeRemaining = 8 + Math.random() * 25;
  } else if (updated.lastKnownPosition) {
    updated.lastKnownPosition = {
      lat: updated.lastKnownPosition.lat + (Math.random() - 0.5) * 0.000005,
      lng: updated.lastKnownPosition.lng + (Math.random() - 0.5) * 0.000005,
    };
  }

  return updated;
}
