import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { OverwatchDB } from '../storage/overwatch-db';
import type { SyncManager } from './sync-manager';

export class VenueManager {
  private syncManager: SyncManager | null = null;

  constructor(private db: OverwatchDB) {}

  setSyncManager(syncManager: SyncManager): void {
    this.syncManager = syncManager;
  }

  private get api() {
    if (!this.syncManager) {
      throw new Error('Cloud sync is not configured. Venue operations require cloud connectivity.');
    }
    return this.syncManager;
  }

  // ---------------------------------------------------------------------------
  // Venue CRUD — cloud-first
  // ---------------------------------------------------------------------------

  async createVenue(data: {
    name: string;
    type?: string;
    environment?: string;
    address?: string | null;
    lat?: number | null;
    lon?: number | null;
    tags?: string | null;
    notes?: string | null;
  }): Promise<any> {
    const resp = await this.api.apiFetchPublic('/api/v1/venues', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to create venue: ${resp.status} ${detail}`);
    }
    const venue = await resp.json();
    this.db.writeVenue({
      id: venue.id,
      name: venue.name,
      type: venue.type ?? 'indoor',
      address: venue.address,
      lat: venue.lat,
      lng: venue.lon,
      floorCount: 1,
      notes: venue.notes,
    });
    return venue;
  }

  async updateVenue(id: string, patch: Record<string, unknown>): Promise<any> {
    const resp = await this.api.apiFetchPublic(`/api/v1/venues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Failed to update venue: ${resp.status} ${detail}`);
    }
    const venue = await resp.json();
    const existing = this.db.getVenue(id);
    if (existing) {
      this.db.writeVenue({ ...existing, ...patch, id });
    }
    return venue;
  }

  async deleteVenue(id: string): Promise<void> {
    const resp = await this.api.apiFetchPublic(`/api/v1/venues/${id}`, {
      method: 'DELETE',
    });
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Failed to delete venue: ${resp.status}`);
    }
    this.db.deleteVenue(id);
  }

  getVenue(id: string) {
    return this.db.getVenue(id);
  }

  listVenues(filters?: { type?: string; search?: string }) {
    return this.db.queryVenues(filters);
  }

  // ---------------------------------------------------------------------------
  // Zones — local-first with sync push
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Perch Points — local-first with sync push
  // ---------------------------------------------------------------------------

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

  updatePerchPoint(id: string, patch: Record<string, unknown>) {
    this.db.updatePerchPoint(id, patch);
  }

  deletePerchPoint(id: string) {
    this.db.deletePerchPoint(id);
  }

  // ---------------------------------------------------------------------------
  // Floor plan — cloud upload + ingestion
  // ---------------------------------------------------------------------------

  async uploadFloorPlan(
    venueId: string,
    localFilePath: string,
    options?: { floorLevel?: number; pageNumber?: number },
  ): Promise<{
    jobId: string;
    status: string;
    zoneCount?: number;
    perchPointCount?: number;
    pagesProcessed?: number;
    blobKey: string;
  }> {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`File not found: ${localFilePath}`);
    }

    const ext = path.extname(localFilePath).toLowerCase().replace('.', '');
    const blobKey = `venues/${venueId}/floorplan.${ext}`;
    const contentType = this.mimeType(ext);

    console.info('[VenueManager] uploadFloorPlan: requesting upload URL for', blobKey);

    const urlResp = await this.api.apiFetchPublic(
      `/api/v1/blobs/upload-url?key=${encodeURIComponent(blobKey)}&content_type=${encodeURIComponent(contentType)}`,
    );
    if (!urlResp.ok) {
      const detail = await urlResp.text();
      console.error('[VenueManager] Failed to get upload URL:', urlResp.status, detail);
      throw new Error(`Failed to get upload URL: ${urlResp.status} ${detail}`);
    }
    const { url, key } = await urlResp.json();
    console.info('[VenueManager] Got upload URL, direct:', url.startsWith('__direct__:'));

    const fileBuffer = fs.readFileSync(localFilePath);

    if (url.startsWith('__direct__:')) {
      const boundary = `----OverwatchUpload${Date.now()}`;
      const fileName = path.basename(localFilePath);
      const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const multipartBody = Buffer.concat([header, fileBuffer, footer]);

      const directResp = await this.api.apiFetchPublic(
        `/api/v1/blobs/upload?key=${encodeURIComponent(blobKey)}`,
        {
          method: 'POST',
          body: multipartBody,
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        },
      );
      if (!directResp.ok) {
        const detail = await directResp.text();
        throw new Error(`Direct upload failed: ${directResp.status} ${detail}`);
      }
    } else {
      const uploadResp = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: fileBuffer,
      });
      if (!uploadResp.ok) throw new Error(`Failed to upload file: ${uploadResp.status}`);
    }

    const fmt = ['dxf', 'dwg'].includes(ext) ? 'dxf' : ext === 'pdf' ? 'pdf' : 'image';

    const ingestBody: Record<string, unknown> = {
      blob_key: key,
      format: fmt,
      floor_level: options?.floorLevel ?? 0,
    };
    if (options?.pageNumber != null) {
      ingestBody.page_number = options.pageNumber;
    }

    const ingestResp = await this.api.apiFetchPublic(`/api/v1/venues/${venueId}/ingest`, {
      method: 'POST',
      body: JSON.stringify(ingestBody),
    });
    if (!ingestResp.ok) throw new Error(`Failed to start ingestion: ${ingestResp.status}`);

    const result = await ingestResp.json();

    const effectiveBlobKey = result.rendered_blob_key || key;

    this.db.updateVenueFloorPlan(venueId, {
      floorPlanBlobKey: effectiveBlobKey,
      floorPlanCached: 0,
      floorPlanLocalPath: null,
    });

    if (result.floor_image_keys && typeof result.floor_image_keys === 'object') {
      this.db.deleteFloorPlanImages(venueId);
      for (const [floor, fKey] of Object.entries(result.floor_image_keys)) {
        this.db.upsertFloorPlanImage(venueId, parseInt(floor, 10), fKey as string);
      }
    }

    return {
      jobId: result.job_id,
      status: result.status,
      zoneCount: result.zone_count,
      perchPointCount: result.perch_point_count,
      pagesProcessed: result.pages_processed,
      blobKey: effectiveBlobKey,
    };
  }

  async getPageCount(
    venueId: string,
    blobKey: string,
  ): Promise<number> {
    const resp = await this.api.apiFetchPublic(`/api/v1/venues/${venueId}/page-count`, {
      method: 'POST',
      body: JSON.stringify({ blob_key: blobKey, format: 'pdf', floor_level: 0 }),
    });
    if (!resp.ok) return 1;
    const data = await resp.json();
    return data.page_count ?? 1;
  }

  async pollIngestion(
    venueId: string,
    jobId: string,
  ): Promise<{ status: string; zoneCount?: number; perchPointCount?: number; error?: string }> {
    const resp = await this.api.apiFetchPublic(
      `/api/v1/venues/${venueId}/ingest/${jobId}`,
    );
    if (!resp.ok) throw new Error(`Failed to poll ingestion: ${resp.status}`);
    const data = await resp.json();
    return {
      status: data.status,
      zoneCount: data.zone_count,
      perchPointCount: data.perch_point_count,
      error: data.error_message,
    };
  }

  async pullFloorPlan(venueId: string): Promise<string> {
    const venue = this.db.getVenue(venueId);
    if (!venue) throw new Error(`Venue ${venueId} not found`);

    const blobKey = (venue as any).floor_plan_blob_key;
    if (!blobKey) throw new Error('No floor plan uploaded for this venue');

    const cacheDir = path.join(app.getPath('userData'), 'floor-plans', venueId);
    fs.mkdirSync(cacheDir, { recursive: true });

    const primaryPath = await this.downloadBlob(blobKey, path.join(cacheDir, 'floorplan.png'));

    this.db.updateVenueFloorPlan(venueId, {
      floorPlanLocalPath: primaryPath,
      floorPlanCached: 1,
      floorPlanCachedAt: new Date().toISOString(),
    });

    const floorImages = this.db.getFloorPlanImages(venueId);
    for (const fi of floorImages) {
      const floorPath = path.join(cacheDir, `floor_${fi.floor_level}.png`);
      try {
        await this.downloadBlob(fi.blob_key, floorPath);
        this.db.updateFloorPlanImage(venueId, fi.floor_level, {
          localPath: floorPath,
          cached: 1,
          cachedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn(`[VenueManager] Failed to pull floor ${fi.floor_level} image:`, err);
      }
    }

    return primaryPath;
  }

  private async downloadBlob(blobKey: string, destPath: string): Promise<string> {
    const urlResp = await this.api.apiFetchPublic(
      `/api/v1/blobs/download-url?key=${encodeURIComponent(blobKey)}`,
    );
    if (!urlResp.ok) throw new Error(`Failed to get download URL: ${urlResp.status}`);
    const { url } = await urlResp.json();

    let downloadResp: Response;
    if (url.startsWith('__direct__:')) {
      downloadResp = await this.api.apiFetchPublic(
        `/api/v1/blobs/download?key=${encodeURIComponent(blobKey)}`,
      );
    } else {
      downloadResp = await fetch(url);
    }
    if (!downloadResp.ok) throw new Error(`Failed to download blob: ${downloadResp.status}`);
    const buffer = Buffer.from(await downloadResp.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    return destPath;
  }

  async deleteFloorPlan(venueId: string): Promise<void> {
    const resp = await this.api.apiFetchPublic(`/api/v1/venues/${venueId}/floor-plan`, {
      method: 'DELETE',
    });
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Failed to delete floor plan: ${resp.status}`);
    }

    this.evictFloorPlan(venueId);
    this.db.deleteFloorPlanImages(venueId);

    this.db.updateVenueFloorPlan(venueId, {
      floorPlanBlobKey: null,
      floorPlanLocalPath: null,
      floorPlanCached: 0,
      floorPlanCachedAt: null,
    });

    const zones = this.db.getZones(venueId);
    for (const zone of zones) {
      this.db.deleteZone(zone.id);
    }
  }

  evictFloorPlan(venueId: string): void {
    const cacheDir = path.join(app.getPath('userData'), 'floor-plans', venueId);
    try {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    } catch {
      // best-effort cleanup
    }

    this.db.updateVenueFloorPlan(venueId, {
      floorPlanLocalPath: null,
      floorPlanCached: 0,
      floorPlanCachedAt: null,
    });

    const floorImages = this.db.getFloorPlanImages(venueId);
    for (const fi of floorImages) {
      this.db.updateFloorPlanImage(venueId, fi.floor_level, {
        localPath: null,
        cached: 0,
        cachedAt: null,
      });
    }
  }

  isFloorPlanCached(venueId: string): boolean {
    const venue = this.db.getVenue(venueId) as any;
    if (!venue) return false;
    if (!venue.floor_plan_cached || !venue.floor_plan_local_path) return false;
    return fs.existsSync(venue.floor_plan_local_path);
  }

  getFloorPlanPath(venueId: string): string | null {
    const venue = this.db.getVenue(venueId) as any;
    if (!venue?.floor_plan_local_path) return null;
    if (!fs.existsSync(venue.floor_plan_local_path)) return null;
    return venue.floor_plan_local_path;
  }

  getFloorPlanDataUrl(venueId: string, floorLevel?: number): string | null {
    if (floorLevel !== undefined) {
      const fi = this.db.getFloorPlanImage(venueId, floorLevel);
      if (fi?.local_path && fs.existsSync(fi.local_path)) {
        return this.fileToDataUrl(fi.local_path);
      }
    }

    const localPath = this.getFloorPlanPath(venueId);
    if (!localPath) return null;
    return this.fileToDataUrl(localPath);
  }

  getFloorImageLevels(venueId: string): number[] {
    const images = this.db.getFloorPlanImages(venueId);
    return images.filter((fi: any) => fi.cached && fi.local_path).map((fi: any) => fi.floor_level);
  }

  private fileToDataUrl(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  // ---------------------------------------------------------------------------
  // Surface assessments
  // ---------------------------------------------------------------------------

  recordSurfaceAssessment(data: Record<string, unknown>): string {
    return this.db.writeSurfaceAssessment(data);
  }

  getPerchPointHistory(perchPointId: string) {
    return this.db.getSurfaceAssessments(perchPointId);
  }

  getPerchPointStats(perchPointId: string) {
    return this.db.getPerchPointStats(perchPointId);
  }

  // ---------------------------------------------------------------------------
  // Fetch venue intelligence from cloud after ingestion
  // ---------------------------------------------------------------------------

  async fetchVenueIntelligence(venueId: string): Promise<{ zones: number; perchPoints: number }> {
    const zonesResp = await this.api.apiFetchPublic(`/api/v1/venues/${venueId}/zones`);
    if (!zonesResp.ok) throw new Error(`Failed to fetch zones: ${zonesResp.status}`);
    const zones = await zonesResp.json();

    let totalPerchPoints = 0;

    for (const zone of zones) {
      this.db.writeZone({
        id: zone.id,
        venueId: zone.venue_id,
        name: zone.name,
        type: zone.type ?? 'custom',
        environment: zone.environment ?? 'indoor',
        floor: zone.floor_level ?? 0,
        polygon: zone.polygon_json ? JSON.parse(zone.polygon_json) : undefined,
        tierRequirement: zone.tier_requirement ?? 'any',
        priority: zone.coverage_priority ? parseInt(zone.coverage_priority, 10) : 5,
        notes: zone.notes,
      });

      const ppResp = await this.api.apiFetchPublic(`/api/v1/venues/zones/${zone.id}/perch-points`);
      if (ppResp.ok) {
        const perchPoints = await ppResp.json();
        for (const pp of perchPoints) {
          const pos = pp.position_json ? JSON.parse(pp.position_json) : {};
          this.db.writePerchPoint({
            id: pp.id,
            zoneId: pp.zone_id,
            name: `PP-${pp.id.slice(0, 4)}`,
            surfaceType: pp.surface_class ?? 'wall',
            position: {
              lat: pos.lat ?? 0,
              lng: pos.lon ?? 0,
              alt: pp.height_m ?? 3,
            },
            suitabilityScore: pp.coverage_value ?? 0.5,
          });
          totalPerchPoints++;
        }
      }
    }

    return { zones: zones.length, perchPoints: totalPerchPoints };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mimeType(ext: string): string {
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      dxf: 'application/dxf',
      dwg: 'application/acad',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
