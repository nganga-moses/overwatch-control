import type { DroneProfile, PerchState, Tier } from '@/shared/types';
import type { SimVenue } from './venue-sim';

export interface SimDrone extends DroneProfile {
  targetPerchPointId: string | null;
  targetZoneId: string | null;
  transitProgress: number;
  perchAttemptStart: number | null;
}

const BATTERY_DRAIN_RATES: Record<PerchState, number> = {
  sleeping: 0,
  launching: 0.3,
  transit: 0.2,
  perching: 0.15,
  perched: 0.02,
  repositioning: 0.25,
  returning: 0.2,
};

const TRANSIT_SPEED = 0.15;
const PERCH_ATTEMPT_DURATION_MS = 3000;

function uid(): string {
  return crypto.randomUUID();
}

export function createSimDrones(
  kitId: string,
  tier1Count: number,
  tier2Count: number,
): SimDrone[] {
  const drones: SimDrone[] = [];

  for (let i = 0; i < tier1Count; i++) {
    drones.push(makeDrone(kitId, 'tier_1', `T1-${String(i + 1).padStart(2, '0')}`));
  }
  for (let i = 0; i < tier2Count; i++) {
    drones.push(makeDrone(kitId, 'tier_2', `T2-${String(i + 1).padStart(2, '0')}`));
  }

  return drones;
}

function makeDrone(kitId: string, tier: Tier, callsign: string): SimDrone {
  return {
    id: uid(),
    kitId,
    callsign,
    serial: `SIM-${callsign}-${uid().slice(0, 4)}`,
    tier,
    status: 'idle',
    batteryPercent: 85 + Math.random() * 15,
    perchState: 'sleeping',
    currentZoneId: null,
    currentPerchPointId: null,
    position: null,
    perchStartedAt: null,
    lastHeartbeat: Date.now(),
    flightHours: Math.random() * 50,
    totalPerches: Math.floor(Math.random() * 200),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetPerchPointId: null,
    targetZoneId: null,
    transitProgress: 0,
    perchAttemptStart: null,
  };
}

export function tickDrone(
  drone: SimDrone,
  venue: SimVenue,
  dtMs: number,
): SimDrone {
  const updated = { ...drone };
  const dtSec = dtMs / 1000;

  updated.batteryPercent = Math.max(
    0,
    updated.batteryPercent - BATTERY_DRAIN_RATES[updated.perchState] * dtSec,
  );
  updated.lastHeartbeat = Date.now();

  if (updated.batteryPercent <= 5 && updated.perchState !== 'returning' && updated.perchState !== 'sleeping') {
    updated.perchState = 'returning';
    updated.transitProgress = 0;
    updated.targetPerchPointId = null;
    updated.status = 'active';
    return updated;
  }

  switch (updated.perchState) {
    case 'sleeping': {
      if (updated.batteryPercent > 20 && Math.random() < 0.02) {
        const eligiblePoints = getEligiblePerchPoints(updated, venue);
        if (eligiblePoints.length > 0) {
          const target = eligiblePoints[Math.floor(Math.random() * eligiblePoints.length)];
          updated.perchState = 'launching';
          updated.targetPerchPointId = target.id;
          updated.targetZoneId = target.zoneId;
          updated.status = 'active';
          updated.position = { lat: venue.lat, lng: venue.lng, alt: 0 };
        }
      }
      break;
    }

    case 'launching': {
      updated.transitProgress += TRANSIT_SPEED * dtSec;
      if (updated.transitProgress >= 1) {
        updated.perchState = 'transit';
        updated.transitProgress = 0;
      }
      break;
    }

    case 'transit': {
      updated.transitProgress += TRANSIT_SPEED * dtSec;
      if (updated.targetPerchPointId) {
        const pp = venue.perchPoints.find((p) => p.id === updated.targetPerchPointId);
        if (pp) {
          const startLat = updated.position?.lat ?? venue.lat;
          const startLng = updated.position?.lng ?? venue.lng;
          const t = Math.min(updated.transitProgress, 1);
          updated.position = {
            lat: startLat + (pp.position.lat - startLat) * t,
            lng: startLng + (pp.position.lng - startLng) * t,
            alt: pp.position.alt * t,
          };
        }
      }
      if (updated.transitProgress >= 1) {
        updated.perchState = 'perching';
        updated.perchAttemptStart = Date.now();
        updated.transitProgress = 0;
      }
      break;
    }

    case 'perching': {
      if (
        updated.perchAttemptStart &&
        Date.now() - updated.perchAttemptStart >= PERCH_ATTEMPT_DURATION_MS
      ) {
        const pp = venue.perchPoints.find((p) => p.id === updated.targetPerchPointId);
        const success = Math.random() < (pp?.successRate ?? 0.8);

        if (success) {
          updated.perchState = 'perched';
          updated.currentPerchPointId = updated.targetPerchPointId;
          updated.currentZoneId = updated.targetZoneId;
          updated.perchStartedAt = Date.now();
          updated.totalPerches++;
          if (pp) {
            updated.position = { ...pp.position };
          }
        } else {
          const eligiblePoints = getEligiblePerchPoints(updated, venue);
          const fallback = eligiblePoints.find((p) => p.id !== updated.targetPerchPointId);
          if (fallback) {
            updated.targetPerchPointId = fallback.id;
            updated.targetZoneId = fallback.zoneId;
            updated.perchState = 'transit';
            updated.transitProgress = 0;
          } else {
            updated.perchState = 'returning';
            updated.transitProgress = 0;
          }
        }
        updated.perchAttemptStart = null;
      }
      break;
    }

    case 'perched': {
      if (Math.random() < 0.005) {
        const eligiblePoints = getEligiblePerchPoints(updated, venue);
        const newPoint = eligiblePoints.find(
          (p) => p.id !== updated.currentPerchPointId,
        );
        if (newPoint) {
          updated.perchState = 'repositioning';
          updated.targetPerchPointId = newPoint.id;
          updated.targetZoneId = newPoint.zoneId;
          updated.transitProgress = 0;
          updated.currentPerchPointId = null;
          updated.perchStartedAt = null;
        }
      }
      break;
    }

    case 'repositioning': {
      updated.transitProgress += TRANSIT_SPEED * dtSec;
      if (updated.targetPerchPointId) {
        const pp = venue.perchPoints.find((p) => p.id === updated.targetPerchPointId);
        if (pp && updated.position) {
          const t = Math.min(updated.transitProgress, 1);
          updated.position = {
            lat: updated.position.lat + (pp.position.lat - updated.position.lat) * t,
            lng: updated.position.lng + (pp.position.lng - updated.position.lng) * t,
            alt: updated.position.alt + (pp.position.alt - updated.position.alt) * t,
          };
        }
      }
      if (updated.transitProgress >= 1) {
        updated.perchState = 'perching';
        updated.perchAttemptStart = Date.now();
        updated.transitProgress = 0;
      }
      break;
    }

    case 'returning': {
      updated.transitProgress += TRANSIT_SPEED * dtSec;
      if (updated.position) {
        const t = Math.min(updated.transitProgress, 1);
        updated.position = {
          lat: updated.position.lat + (venue.lat - updated.position.lat) * t,
          lng: updated.position.lng + (venue.lng - updated.position.lng) * t,
          alt: updated.position.alt * (1 - t),
        };
      }
      if (updated.transitProgress >= 1) {
        updated.perchState = 'sleeping';
        updated.status = 'idle';
        updated.position = null;
        updated.currentPerchPointId = null;
        updated.currentZoneId = null;
        updated.targetPerchPointId = null;
        updated.targetZoneId = null;
        updated.transitProgress = 0;
        updated.perchStartedAt = null;
      }
      break;
    }
  }

  return updated;
}

function getEligiblePerchPoints(
  drone: SimDrone,
  venue: SimVenue,
) {
  return venue.perchPoints.filter((pp) => {
    const zone = venue.zones.find((z) => z.id === pp.zoneId);
    if (!zone) return false;

    if (drone.tier === 'tier_1' && zone.environment === 'outdoor') return false;
    if (zone.tierRequirement === 'tier_1' && drone.tier !== 'tier_1') return false;
    if (zone.tierRequirement === 'tier_2' && drone.tier !== 'tier_2') return false;

    return pp.suitabilityScore > 0.3;
  });
}
