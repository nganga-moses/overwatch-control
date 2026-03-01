import { useState, useEffect } from 'react';
import { FloorPlanUpload } from './FloorPlanUpload';
import {
  MapPin, Layers, Target, Download, Trash2,
  Upload, ChevronDown, ChevronRight, Edit2, Eye,
} from 'lucide-react';

interface VenueRecord {
  id: string;
  name: string;
  type: string;
  address: string | null;
  floor_plan_blob_key: string | null;
  floor_plan_cached: number;
  floor_plan_local_path: string | null;
  floor_count: number;
  operation_count: number;
}

interface ZoneRecord {
  id: string;
  venue_id: string;
  name: string;
  type: string;
  environment: string;
  floor: number;
  tier_requirement: string;
  priority: number;
}

interface PerchPointRecord {
  id: string;
  zone_id: string;
  name: string;
  surface_type: string;
  position_lat: number;
  position_lng: number;
  position_alt: number;
  suitability_score: number;
  is_verified: number;
  success_rate: number;
}

interface VenueDetailProps {
  venue: VenueRecord;
  onUpdate: () => void;
}

export function VenueDetail({ venue, onUpdate }: VenueDetailProps) {
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [perchPoints, setPerchPoints] = useState<Record<string, PerchPointRecord[]>>({});
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [pullingFloorPlan, setPullingFloorPlan] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    loadZones();
  }, [venue.id]);

  async function loadZones() {
    if (!window.electronAPI?.venues) return;
    const z = await window.electronAPI.venues.getZones(venue.id);
    setZones(z ?? []);

    const ppMap: Record<string, PerchPointRecord[]> = {};
    for (const zone of z ?? []) {
      const pp = await window.electronAPI.venues.getPerchPoints(zone.id);
      ppMap[zone.id] = pp ?? [];
    }
    setPerchPoints(ppMap);
  }

  async function handlePullFloorPlan() {
    setPullingFloorPlan(true);
    try {
      await window.electronAPI.venues.pullFloorPlan(venue.id);
      onUpdate();
    } catch (err) {
      console.error('Failed to pull floor plan:', err);
    } finally {
      setPullingFloorPlan(false);
    }
  }

  async function handleEvictFloorPlan() {
    try {
      await window.electronAPI.venues.evictFloorPlan(venue.id);
      onUpdate();
    } catch (err) {
      console.error('Failed to evict floor plan:', err);
    }
  }

  async function handleFetchIntelligence() {
    try {
      const result = await window.electronAPI.venues.fetchIntelligence(venue.id);
      console.info('Fetched intelligence:', result);
      loadZones();
    } catch (err) {
      console.error('Failed to fetch intelligence:', err);
    }
  }

  function toggleZone(zoneId: string) {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  }

  const totalPerchPoints = Object.values(perchPoints).reduce((sum, pp) => sum + pp.length, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-ow-text">{venue.name}</h2>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-ow-text-dim font-mono">
            <span className="uppercase px-1.5 py-0.5 rounded bg-ow-surface-2 border border-ow-border">
              {venue.type}
            </span>
            {venue.address && (
              <span className="flex items-center gap-1">
                <MapPin size={10} /> {venue.address}
              </span>
            )}
            <span>{venue.operation_count} deployments</span>
          </div>
        </div>
        <button
          onClick={() => setEditMode(!editMode)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
          style={{
            background: editMode ? '#2dd4bf15' : 'transparent',
            color: editMode ? '#2dd4bf' : '#6e7681',
            border: `1px solid ${editMode ? '#2dd4bf30' : '#30363d'}`,
          }}
        >
          {editMode ? <Eye size={10} /> : <Edit2 size={10} />}
          {editMode ? 'View' : 'Edit'}
        </button>
      </div>

      {/* Floor plan section */}
      <div className="rounded border border-ow-border bg-ow-surface p-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">
          Floor Plan
        </h3>

        {venue.floor_plan_cached && venue.floor_plan_local_path ? (
          <div className="space-y-2">
            <div className="h-48 rounded bg-ow-bg border border-ow-border flex items-center justify-center overflow-hidden">
              <img
                src={`file://${venue.floor_plan_local_path}`}
                alt="Floor plan"
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEvictFloorPlan}
                className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-ow-text-dim hover:text-ow-danger border border-ow-border hover:border-ow-danger/30 transition-colors"
              >
                <Trash2 size={9} /> Evict cache
              </button>
              <button
                onClick={handleFetchIntelligence}
                className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/10 transition-colors"
              >
                <Download size={9} /> Refresh zones from cloud
              </button>
            </div>
          </div>
        ) : venue.floor_plan_blob_key ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePullFloorPlan}
              disabled={pullingFloorPlan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-ow-info/10 text-ow-info border border-ow-info/30 hover:bg-ow-info/20 transition-colors disabled:opacity-50"
            >
              <Download size={12} />
              {pullingFloorPlan ? 'Downloading...' : 'Pull Floor Plan'}
            </button>
            <span className="text-[9px] text-ow-text-dim">Available in cloud</span>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-ow-text-dim">No floor plan uploaded</p>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-ow-accent/10 text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/20 transition-colors"
            >
              <Upload size={12} /> Upload Floor Plan
            </button>
          </div>
        )}

        {showUpload && (
          <FloorPlanUpload
            venueId={venue.id}
            onComplete={() => {
              setShowUpload(false);
              onUpdate();
              loadZones();
            }}
            onCancel={() => setShowUpload(false)}
          />
        )}
      </div>

      {/* Zones + Perch points */}
      <div className="rounded border border-ow-border bg-ow-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-ow-text-dim">
            Zones ({zones.length})
          </h3>
          <span className="text-[9px] text-ow-text-dim font-mono">
            {totalPerchPoints} perch points
          </span>
        </div>

        {zones.length === 0 ? (
          <p className="text-[10px] text-ow-text-dim py-2">
            No zones yet. Upload a floor plan to auto-generate zones, or add them manually.
          </p>
        ) : (
          <div className="space-y-1">
            {zones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                perchPoints={perchPoints[zone.id] ?? []}
                expanded={expandedZones.has(zone.id)}
                onToggle={() => toggleZone(zone.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ZoneRow({
  zone,
  perchPoints,
  expanded,
  onToggle,
}: {
  zone: { id: string; name: string; type: string; environment: string; tier_requirement: string; priority: number };
  perchPoints: PerchPointRecord[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const tierColor = zone.tier_requirement === 'tier_1' ? '#a78bfa' : zone.tier_requirement === 'tier_2' ? '#f97316' : '#6e7681';

  return (
    <div className="rounded border border-ow-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-ow-surface-2/50 transition-colors"
      >
        {expanded ? <ChevronDown size={10} className="text-ow-text-dim" /> : <ChevronRight size={10} className="text-ow-text-dim" />}
        <Layers size={10} style={{ color: tierColor }} />
        <span className="text-[10px] font-medium text-ow-text flex-1">{zone.name}</span>
        <span className="text-[8px] font-mono uppercase px-1 py-0.5 rounded" style={{ color: tierColor, background: `${tierColor}15` }}>
          {zone.tier_requirement === 'any' ? 'ANY' : zone.tier_requirement === 'tier_1' ? 'T1' : 'T2'}
        </span>
        <span className="text-[8px] text-ow-text-dim font-mono">
          {perchPoints.length} pp
        </span>
      </button>

      {expanded && perchPoints.length > 0 && (
        <div className="px-2.5 pb-2 pt-0.5 space-y-0.5 border-t border-ow-border/50">
          {perchPoints.map((pp) => (
            <PerchPointRow key={pp.id} point={pp} />
          ))}
        </div>
      )}
    </div>
  );
}

function PerchPointRow({ point }: { point: PerchPointRecord }) {
  const reliabilityColor =
    point.success_rate > 0.8 ? '#3fb950' :
    point.success_rate > 0.5 ? '#d29922' :
    '#f85149';

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-ow-bg/50">
      <Target size={9} style={{ color: reliabilityColor }} />
      <span className="text-[9px] text-ow-text flex-1">{point.name}</span>
      <span className="text-[8px] font-mono text-ow-text-dim">{point.surface_type}</span>
      <span className="text-[8px] font-mono" style={{ color: reliabilityColor }}>
        {Math.round(point.success_rate * 100)}%
      </span>
      {point.is_verified ? (
        <span className="text-[7px] font-mono text-ow-safe">VER</span>
      ) : (
        <span className="text-[7px] font-mono text-ow-text-dim">UNV</span>
      )}
    </div>
  );
}
