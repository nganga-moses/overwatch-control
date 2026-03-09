import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ZONE_COLORS, getZoneLayerStyle } from '@/components/map/ZoneOverlay';
import { Plus, MousePointer } from 'lucide-react';

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

interface FloorPlanViewerProps {
  venueId: string;
  venueLat: number | null;
  venueLng: number | null;
  hasFloorPlan: boolean;
  zones: ZoneRecord[];
  perchPoints: Record<string, PerchPointRecord[]>;
  editMode: boolean;
  selectedZoneId: string | null;
  highlightedZoneId: string | null;
  onSelectZone: (zoneId: string | null) => void;
  onPerchPointMoved: (id: string, lat: number, lng: number) => void;
  onAddPerchPoint: (zoneId: string, lat: number, lng: number) => void;
  onSelectPerchPoint: (perchPoint: PerchPointRecord | null) => void;
}

const DARK_BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0d1117' },
    },
  ],
};

function parsePolygon(raw: string | null): [number, number][] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 3) return parsed;
  } catch { /* ignore */ }
  return null;
}

function computeBounds(
  zones: ZoneRecord[],
  perchPoints: Record<string, PerchPointRecord[]>,
  venueLat: number | null,
  venueLng: number | null,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  let hasPoints = false;

  for (const zone of zones) {
    const poly = parsePolygon(zone.polygon);
    if (!poly) continue;
    for (const [lat, lng] of poly) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      hasPoints = true;
    }
  }

  for (const pps of Object.values(perchPoints)) {
    for (const pp of pps) {
      minLat = Math.min(minLat, pp.position_lat);
      maxLat = Math.max(maxLat, pp.position_lat);
      minLng = Math.min(minLng, pp.position_lng);
      maxLng = Math.max(maxLng, pp.position_lng);
      hasPoints = true;
    }
  }

  if (!hasPoints) {
    if (venueLat != null && venueLng != null) {
      const pad = 0.001;
      return { minLat: venueLat - pad, maxLat: venueLat + pad, minLng: venueLng - pad, maxLng: venueLng + pad };
    }
    return null;
  }

  const latPad = (maxLat - minLat) * 0.15 || 0.0005;
  const lngPad = (maxLng - minLng) * 0.15 || 0.0005;
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function perchColor(score: number): string {
  if (score > 0.8) return '#3fb950';
  if (score > 0.5) return '#d29922';
  return '#f85149';
}

export function FloorPlanViewer({
  venueId,
  venueLat,
  venueLng,
  hasFloorPlan,
  zones,
  perchPoints,
  editMode,
  selectedZoneId,
  highlightedZoneId,
  onSelectZone,
  onPerchPointMoved,
  onAddPerchPoint,
  onSelectPerchPoint,
}: FloorPlanViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [selectedFloor, setSelectedFloor] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasFloorPlan) {
      setImageDataUrl(null);
      return;
    }
    console.info('[FloorPlanViewer] Loading data URL for venue=%s floor=%d', venueId, selectedFloor);
    window.electronAPI?.venues.getFloorPlanDataUrl(venueId, selectedFloor).then((url: string | null) => {
      console.info('[FloorPlanViewer] Data URL loaded:', url ? `${url.length} chars` : 'null');
      setImageDataUrl(url);
    }).catch((err: unknown) => {
      console.error('[FloorPlanViewer] Failed to load data URL:', err);
      setImageDataUrl(null);
    });
  }, [venueId, hasFloorPlan, selectedFloor]);

  const floors = useMemo(() => {
    const set = new Set(zones.map((z) => z.floor ?? 0));
    return Array.from(set).sort((a, b) => a - b);
  }, [zones]);

  const floorZones = useMemo(
    () => zones.filter((z) => (z.floor ?? 0) === selectedFloor),
    [zones, selectedFloor],
  );

  const allPerchPoints = useMemo(() => {
    const floorZoneIds = new Set(floorZones.map((z) => z.id));
    const result: PerchPointRecord[] = [];
    for (const [zoneId, pps] of Object.entries(perchPoints)) {
      if (floorZoneIds.has(zoneId)) result.push(...pps);
    }
    return result;
  }, [floorZones, perchPoints]);

  const bounds = useMemo(
    () => computeBounds(floorZones, perchPoints, venueLat, venueLng),
    [floorZones, perchPoints, venueLat, venueLng],
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const centerLat = bounds ? (bounds.minLat + bounds.maxLat) / 2 : (venueLat ?? 0);
    const centerLng = bounds ? (bounds.minLng + bounds.maxLng) / 2 : (venueLng ?? 0);

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DARK_BLANK_STYLE,
      center: [centerLng, centerLat],
      zoom: 19,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [venueId]);

  // Fit bounds when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds || !mapReady) return;

    map.fitBounds(
      [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
      { padding: 40, duration: 300 },
    );
  }, [bounds, mapReady]);

  // Floor plan image overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const sourceId = 'floor-plan-image';
    const layerId = 'floor-plan-layer';

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (!imageDataUrl || !bounds) {
      console.info('[FloorPlanViewer] Skipping image overlay: dataUrl=%s bounds=%s', !!imageDataUrl, !!bounds);
      return;
    }

    console.info('[FloorPlanViewer] Adding image overlay, bounds:', bounds);
    map.addSource(sourceId, {
      type: 'image',
      url: imageDataUrl,
      coordinates: [
        [bounds.minLng, bounds.maxLat],
        [bounds.maxLng, bounds.maxLat],
        [bounds.maxLng, bounds.minLat],
        [bounds.minLng, bounds.minLat],
      ],
    });

    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': 0.85,
        'raster-brightness-max': 0.9,
        'raster-saturation': -0.2,
      },
    });
  }, [imageDataUrl, bounds, mapReady]);

  // Zone polygon layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clean up previous zone layers
    const style = map.getStyle();
    if (style?.layers) {
      for (const layer of style.layers) {
        if (layer.id.startsWith('zone-fill-fp-') || layer.id.startsWith('zone-line-fp-') || layer.id.startsWith('zone-label-fp-')) {
          map.removeLayer(layer.id);
        }
      }
    }
    if (style?.sources) {
      for (const srcId of Object.keys(style.sources)) {
        if (srcId.startsWith('zone-fp-')) {
          map.removeSource(srcId);
        }
      }
    }

    for (const zone of floorZones) {
      const poly = parsePolygon(zone.polygon);
      if (!poly || poly.length < 3) continue;

      const isHighlighted = zone.id === selectedZoneId || zone.id === highlightedZoneId;
      const zoneStyle = getZoneLayerStyle(
        { ...zone, polygon: poly, floor: zone.floor ?? 0 } as any,
        isHighlighted,
      );
      const sourceId = `zone-fp-${zone.id}`;
      const fillId = `zone-fill-fp-${zone.id}`;
      const lineId = `zone-line-fp-${zone.id}`;
      const labelId = `zone-label-fp-${zone.id}`;

      const ring = [...poly.map(([lat, lng]) => [lng, lat] as [number, number]), [poly[0][1], poly[0][0]] as [number, number]];

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { name: zone.name, type: zone.type, id: zone.id },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      });

      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': zoneStyle.fillColor,
          'fill-opacity': zoneStyle.fillOpacity,
        },
      });

      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': zoneStyle.strokeColor,
          'line-opacity': zoneStyle.strokeOpacity,
          'line-width': zoneStyle.strokeWidth,
        },
      });

      map.addLayer({
        id: labelId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'text-field': zone.name,
          'text-size': 10,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': zoneStyle.fillColor,
          'text-opacity': 0.8,
          'text-halo-color': '#0d1117',
          'text-halo-width': 1,
        },
      });

      map.on('click', fillId, () => {
        onSelectZone(zone.id === selectedZoneId ? null : zone.id);
      });

      map.on('mouseenter', fillId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', fillId, () => {
        map.getCanvas().style.cursor = addMode ? 'crosshair' : '';
      });
    }
  }, [floorZones, selectedZoneId, highlightedZoneId, mapReady, addMode]);

  // Perch point markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const activeIds = new Set<string>();

    for (const pp of allPerchPoints) {
      activeIds.add(pp.id);
      const existing = markersRef.current.get(pp.id);

      if (existing) {
        existing.setLngLat([pp.position_lng, pp.position_lat]);
        existing.setDraggable(editMode && !addMode);
        continue;
      }

      const el = document.createElement('div');
      el.style.cursor = 'pointer';
      updateMarkerElement(el, pp, false);

      const marker = new maplibregl.Marker({ element: el, draggable: editMode && !addMode })
        .setLngLat([pp.position_lng, pp.position_lat])
        .addTo(map);

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        onPerchPointMoved(pp.id, lngLat.lat, lngLat.lng);
      });

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectPerchPoint(pp);
      });

      markersRef.current.set(pp.id, marker);
    }

    for (const [id, marker] of markersRef.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [allPerchPoints, editMode, addMode, mapReady]);

  // Click-to-add perch point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (addMode && selectedZoneId) {
      map.getCanvas().style.cursor = 'crosshair';
    } else {
      map.getCanvas().style.cursor = '';
    }

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!addMode || !selectedZoneId) return;

      const features = map.queryRenderedFeatures(e.point);
      const clickedOnZone = features.some((f) => f.layer.id.startsWith('zone-fill-fp-'));
      const clickedOnMarker = (e.originalEvent.target as HTMLElement)?.closest('.maplibregl-marker');

      if (clickedOnZone || clickedOnMarker) return;

      onAddPerchPoint(selectedZoneId, e.lngLat.lat, e.lngLat.lng);
      setAddMode(false);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [addMode, selectedZoneId, mapReady, onAddPerchPoint]);

  return (
    <div className="relative w-full h-full rounded overflow-hidden border border-ow-border bg-[#0d1117]">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Floor selector */}
      {floors.length > 1 && (
        <div className="absolute top-2 left-2 flex flex-col gap-0.5 bg-ow-surface/90 border border-ow-border rounded p-0.5 backdrop-blur-sm z-10">
          {floors.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFloor(f)}
              className={`px-2 py-0.5 text-[9px] font-mono rounded transition-colors ${
                selectedFloor === f
                  ? 'bg-ow-accent text-ow-bg font-bold'
                  : 'text-ow-text-muted hover:text-ow-text hover:bg-ow-surface-3'
              }`}
            >
              F{f}
            </button>
          ))}
        </div>
      )}

      {/* Edit toolbar */}
      {editMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-ow-surface/90 border border-ow-border rounded px-2 py-1 backdrop-blur-sm z-10">
          <button
            onClick={() => setAddMode(false)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
              !addMode ? 'bg-ow-accent/20 text-ow-accent border border-ow-accent/30' : 'text-ow-text-dim hover:text-ow-text'
            }`}
            title="Select / Move"
          >
            <MousePointer size={10} /> Select
          </button>
          <button
            onClick={() => {
              if (!selectedZoneId) return;
              setAddMode(true);
            }}
            disabled={!selectedZoneId}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors disabled:opacity-30 ${
              addMode ? 'bg-ow-accent/20 text-ow-accent border border-ow-accent/30' : 'text-ow-text-dim hover:text-ow-text'
            }`}
            title={selectedZoneId ? 'Click map to add perch point' : 'Select a zone first'}
          >
            <Plus size={10} /> Add Perch
          </button>
          {addMode && (
            <span className="text-[8px] text-ow-accent animate-pulse ml-1">Click on map to place</span>
          )}
        </div>
      )}

      {/* Legend */}
      {floorZones.length > 0 && (
        <div className="absolute bottom-2 right-2 bg-ow-surface/90 border border-ow-border rounded p-1.5 backdrop-blur-sm z-10 max-w-[140px]">
          <div className="text-[7px] uppercase tracking-wider text-ow-text-dim font-bold mb-1">Zones</div>
          {floorZones.map((z) => {
            const color = ZONE_COLORS[z.type] ?? ZONE_COLORS.custom;
            return (
              <div
                key={z.id}
                className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:brightness-125"
                onClick={() => onSelectZone(z.id === selectedZoneId ? null : z.id)}
              >
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color, opacity: 0.7 }} />
                <span className="text-[8px] text-ow-text truncate">{z.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function updateMarkerElement(el: HTMLElement, pp: PerchPointRecord, isSelected: boolean) {
  const color = perchColor(pp.suitability_score);
  const size = isSelected ? 14 : 10;
  const ring = isSelected ? `box-shadow: 0 0 0 2px ${color}40, 0 0 6px ${color}60;` : '';

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:1.5px solid #0d1117;${ring}"></div>
      <div style="font-size:7px;font-family:'Kantumruy Pro',monospace;color:${color};text-align:center;margin-top:1px;text-shadow:0 0 3px #0d1117,0 0 3px #0d1117;white-space:nowrap;pointer-events:none;">${pp.name}</div>
    </div>
  `;
}
