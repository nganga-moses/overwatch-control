import fs from 'fs';
import path from 'path';
import type { OverwatchDB } from '../storage/overwatch-db';

export class VenueManager {
  constructor(private db: OverwatchDB) {}

  createVenue(data: {
    name: string;
    type: string;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    floorCount?: number;
    notes?: string | null;
  }): string {
    return this.db.writeVenue(data);
  }

  getVenue(id: string) {
    return this.db.getVenue(id);
  }

  listVenues(filters?: { type?: string; search?: string }) {
    return this.db.queryVenues(filters);
  }

  updateVenue(
    id: string,
    patch: Partial<{
      name: string;
      type: string;
      address: string | null;
      lat: number | null;
      lng: number | null;
      floorCount: number;
      notes: string | null;
    }>,
  ) {
    const existing = this.db.getVenue(id);
    if (!existing) throw new Error(`Venue ${id} not found`);
    this.db.writeVenue({ ...existing, ...patch, id });
  }

  deleteVenue(id: string) {
    this.db.deleteVenue(id);
  }

  // --- Zones ---

  createZone(data: {
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
    return this.db.writeZone(data);
  }

  getZones(venueId: string) {
    return this.db.getZones(venueId);
  }

  updateZone(id: string, patch: Record<string, unknown>) {
    this.db.updateZone(id, patch);
  }

  deleteZone(id: string) {
    this.db.deleteZone(id);
  }

  // --- Perch Points ---

  createPerchPoint(data: {
    zoneId: string;
    name: string;
    surfaceType: string;
    position: { lat: number; lng: number; alt: number };
    headingDeg?: number | null;
    fovCoverageDeg?: number;
    suitabilityScore?: number;
  }): string {
    return this.db.writePerchPoint(data);
  }

  getPerchPoints(zoneId: string) {
    return this.db.getPerchPoints(zoneId);
  }

  deletePerchPoint(id: string) {
    this.db.deletePerchPoint(id);
  }

  // --- Floor Plans ---

  setFloorPlan(venueId: string, filePath: string): string {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Floor plan file not found: ${filePath}`);
    }

    const venue = this.db.getVenue(venueId);
    if (!venue) throw new Error(`Venue ${venueId} not found`);

    this.db.writeVenue({
      ...venue,
      floorPlanPath: filePath,
    });

    return filePath;
  }
}
