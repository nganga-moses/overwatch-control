import { useState, useEffect, useCallback } from 'react';
import { FloorPlanUpload } from './FloorPlanUpload';
import { FloorPlanViewer } from './FloorPlanViewer';
import { PerchPointEditor } from './PerchPointEditor';
import { ZONE_COLORS } from '@/components/map/ZoneOverlay';
import {
  MapPin, Target, Download, Trash2,
  Upload, ChevronDown, ChevronRight, Edit2, Eye,
} from 'lucide-react';

interface VenueRecord {
  id: string;
  name: string;
  type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
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
  polygon: string | null;
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
  heading_deg: number | null;
  fov_coverage_deg: number;
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
  const [deletingFloorPlan, setDeletingFloorPlan] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);
  const [editingPerchPoint, setEditingPerchPoint] = useState<PerchPointRecord | null>(null);
  const [newPerchData, setNewPerchData] = useState<{ zoneId: string; lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadZones();
    setSelectedZoneId(null);
    setHighlightedZoneId(null);
    setEditingPerchPoint(null);
    setNewPerchData(null);
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

  async function handleDeleteFloorPlan() {
    setDeletingFloorPlan(true);
    try {
      await window.electronAPI.venues.deleteFloorPlan(venue.id);
      setZones([]);
      setPerchPoints({});
      setConfirmDelete(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to delete floor plan:', err);
    } finally {
      setDeletingFloorPlan(false);
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

  const handlePerchPointMoved = useCallback(async (id: string, lat: number, lng: number) => {
    try {
      await window.electronAPI.venues.updatePerchPoint(id, {
        positionLat: lat,
        positionLng: lng,
      });
      loadZones();
    } catch (err) {
      console.error('Failed to move perch point:', err);
    }
  }, []);

  const handleAddPerchPoint = useCallback((zoneId: string, lat: number, lng: number) => {
    setNewPerchData({ zoneId, lat, lng });
  }, []);

  const handleSelectPerchPoint = useCallback((pp: PerchPointRecord | null) => {
    if (editMode && pp) {
      setEditingPerchPoint(pp);
    }
  }, [editMode]);

  const totalPerchPoints = Object.values(perchPoints).reduce((sum, pp) => sum + pp.length, 0);
  const hasFloorPlan = !!(venue.floor_plan_cached && venue.floor_plan_local_path);
  const hasZones = zones.length > 0;
  const showViewer = hasZones || hasFloorPlan;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-3 pb-2 border-b border-ow-border">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ow-text">{venue.name}</h2>
            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-ow-text-dim font-mono">
              <span className="uppercase px-1.5 py-0.5 rounded bg-ow-surface-2 border border-ow-border">
                {venue.type}
              </span>
              {venue.address && (
                <span className="flex items-center gap-1">
                  <MapPin size={10} /> {venue.address}
                </span>
              )}
              <span>{venue.operation_count} ops</span>
              <span>{zones.length} zones</span>
              <span>{totalPerchPoints} perch pts</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(hasFloorPlan || venue.floor_plan_blob_key) && (
              <>
                {hasFloorPlan && (
                  <button
                    onClick={handleEvictFloorPlan}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-ow-text-dim hover:text-ow-danger border border-ow-border hover:border-ow-danger/30 transition-colors"
                    title="Evict cached floor plan"
                  >
                    <Trash2 size={9} />
                  </button>
                )}
                <button
                  onClick={handleFetchIntelligence}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/10 transition-colors"
                  title="Refresh zones from cloud"
                >
                  <Download size={9} />
                </button>
                {confirmDelete ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] text-ow-danger">Delete plan?</span>
                    <button
                      onClick={handleDeleteFloorPlan}
                      disabled={deletingFloorPlan}
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white bg-red-600 hover:bg-red-500 border border-red-500 transition-colors disabled:opacity-50"
                    >
                      {deletingFloorPlan ? '...' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-1.5 py-0.5 rounded text-[9px] text-ow-text-dim border border-ow-border hover:text-ow-text transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-ow-text-dim hover:text-ow-danger border border-ow-border hover:border-ow-danger/30 transition-colors"
                    title="Delete floor plan and zones from cloud"
                  >
                    <Trash2 size={9} /> Delete plan
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
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
        </div>
      </div>

      {/* Floor Plan Viewer or placeholder */}
      <div className="flex-1 min-h-0 relative">
        {showViewer ? (
          <FloorPlanViewer
            venueId={venue.id}
            venueLat={venue.lat}
            venueLng={venue.lng}
            hasFloorPlan={hasFloorPlan}
            zones={zones}
            perchPoints={perchPoints}
            editMode={editMode}
            selectedZoneId={selectedZoneId}
            highlightedZoneId={highlightedZoneId}
            onSelectZone={setSelectedZoneId}
            onPerchPointMoved={handlePerchPointMoved}
            onAddPerchPoint={handleAddPerchPoint}
            onSelectPerchPoint={handleSelectPerchPoint}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {venue.floor_plan_blob_key ? (
              <>
                <p className="text-[10px] text-ow-text-dim">Floor plan available in cloud</p>
                <button
                  onClick={handlePullFloorPlan}
                  disabled={pullingFloorPlan}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-ow-info/10 text-ow-info border border-ow-info/30 hover:bg-ow-info/20 transition-colors disabled:opacity-50"
                >
                  <Download size={12} />
                  {pullingFloorPlan ? 'Downloading...' : 'Pull Floor Plan'}
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-ow-text-dim">No floor plan uploaded</p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-ow-accent/10 text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/20 transition-colors"
                >
                  <Upload size={12} /> Upload Floor Plan
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Zone list with hover/click interaction */}
      <div className="shrink-0 max-h-[200px] overflow-y-auto border-t border-ow-border">
        <div className="px-3 py-1.5 flex items-center justify-between bg-ow-surface/80 sticky top-0 z-10 backdrop-blur-sm">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim">
            Zones ({zones.length})
          </h3>
          {!hasFloorPlan && !venue.floor_plan_blob_key && (
            <button
              onClick={() => setShowUpload(true)}
              className="text-[9px] text-ow-accent hover:underline"
            >
              + Upload plan
            </button>
          )}
        </div>

        {zones.length === 0 ? (
          <p className="text-[10px] text-ow-text-dim px-3 py-2">
            No zones yet. Upload a floor plan to auto-generate, or add manually.
          </p>
        ) : (
          <div className="px-2 pb-2 space-y-0.5">
            {zones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                perchPoints={perchPoints[zone.id] ?? []}
                expanded={expandedZones.has(zone.id)}
                isSelected={zone.id === selectedZoneId}
                onToggle={() => toggleZone(zone.id)}
                onSelect={() => setSelectedZoneId(zone.id === selectedZoneId ? null : zone.id)}
                onMouseEnter={() => setHighlightedZoneId(zone.id)}
                onMouseLeave={() => setHighlightedZoneId(null)}
                onSelectPerchPoint={editMode ? setEditingPerchPoint : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-ow-surface rounded-lg border border-ow-border shadow-2xl p-4 max-w-md">
            <FloorPlanUpload
              venueId={venue.id}
              onComplete={() => {
                setShowUpload(false);
                onUpdate();
                loadZones();
              }}
              onCancel={() => setShowUpload(false)}
            />
          </div>
        </div>
      )}

      {/* Perch point editor overlay */}
      {editingPerchPoint && (
        <div className="absolute bottom-[200px] right-2 z-50 w-[280px]">
          <PerchPointEditor
            zoneId={editingPerchPoint.zone_id}
            point={editingPerchPoint}
            onSave={() => {
              setEditingPerchPoint(null);
              loadZones();
            }}
            onCancel={() => setEditingPerchPoint(null)}
            onDelete={() => {
              setEditingPerchPoint(null);
              loadZones();
            }}
          />
        </div>
      )}

      {/* New perch point form */}
      {newPerchData && (
        <div className="absolute bottom-[200px] right-2 z-50 w-[280px]">
          <PerchPointEditor
            zoneId={newPerchData.zoneId}
            point={{
              id: '',
              name: '',
              surface_type: 'wall',
              position_lat: newPerchData.lat,
              position_lng: newPerchData.lng,
              position_alt: 3,
              heading_deg: null,
              fov_coverage_deg: 120,
              suitability_score: 0.5,
            }}
            onSave={() => {
              setNewPerchData(null);
              loadZones();
            }}
            onCancel={() => setNewPerchData(null)}
          />
        </div>
      )}
    </div>
  );
}

function ZoneRow({
  zone,
  perchPoints,
  expanded,
  isSelected,
  onToggle,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  onSelectPerchPoint,
}: {
  zone: ZoneRecord;
  perchPoints: PerchPointRecord[];
  expanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onSelectPerchPoint?: (pp: PerchPointRecord) => void;
}) {
  const zoneColor = ZONE_COLORS[zone.type] ?? ZONE_COLORS.custom;
  const tierColor = zone.tier_requirement === 'tier_1' ? '#a78bfa' : zone.tier_requirement === 'tier_2' ? '#f97316' : '#6e7681';

  return (
    <div
      className="rounded border overflow-hidden transition-colors"
      style={{
        borderColor: isSelected ? `${zoneColor}60` : '#30363d',
        background: isSelected ? `${zoneColor}08` : 'transparent',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center">
        <button
          onClick={onToggle}
          className="shrink-0 px-1.5 py-1 text-ow-text-dim hover:text-ow-text"
        >
          {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        </button>
        <button
          onClick={onSelect}
          className="flex-1 flex items-center gap-1.5 py-1 pr-2 text-left hover:brightness-125 transition-all"
        >
          <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: zoneColor }} />
          <span className="text-[10px] font-medium text-ow-text flex-1 truncate">{zone.name}</span>
          <span className="text-[7px] font-mono uppercase px-1 py-0.5 rounded" style={{ color: tierColor, background: `${tierColor}15` }}>
            {zone.tier_requirement === 'any' ? 'ANY' : zone.tier_requirement === 'tier_1' ? 'T1' : 'T2'}
          </span>
          <span className="text-[8px] text-ow-text-dim font-mono">
            {perchPoints.length}pp
          </span>
        </button>
      </div>

      {expanded && perchPoints.length > 0 && (
        <div className="px-2 pb-1 pt-0.5 space-y-0.5 border-t border-ow-border/30">
          {perchPoints.map((pp) => (
            <PerchPointRow
              key={pp.id}
              point={pp}
              onClick={onSelectPerchPoint ? () => onSelectPerchPoint(pp) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PerchPointRow({ point, onClick }: { point: PerchPointRecord; onClick?: () => void }) {
  const reliabilityColor =
    point.success_rate > 0.8 ? '#3fb950' :
    point.success_rate > 0.5 ? '#d29922' :
    '#f85149';

  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-ow-bg/50 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <Target size={8} style={{ color: reliabilityColor }} />
      <span className="text-[9px] text-ow-text flex-1 truncate">{point.name}</span>
      <span className="text-[7px] font-mono text-ow-text-dim">{point.surface_type}</span>
      <span className="text-[7px] font-mono" style={{ color: reliabilityColor }}>
        {Math.round(point.success_rate * 100)}%
      </span>
      {point.is_verified ? (
        <span className="text-[6px] font-mono text-ow-safe">VER</span>
      ) : (
        <span className="text-[6px] font-mono text-ow-text-dim">UNV</span>
      )}
    </div>
  );
}
