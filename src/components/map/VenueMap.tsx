import { useEffect, useRef, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { getZoneLayerStyle } from './ZoneOverlay';
import type { VenueZone } from '@/shared/types';

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-saturation': -0.8,
        'raster-brightness-max': 0.4,
        'raster-contrast': 0.2,
      },
    },
  ],
};

function droneColor(state: string): string {
  const colors: Record<string, string> = {
    sleeping: '#6e7681',
    launching: '#d29922',
    transit: '#58a6ff',
    perching: '#d29922',
    perched: '#3fb950',
    repositioning: '#bc8cff',
    returning: '#79c0ff',
  };
  return colors[state] ?? '#8b949e';
}

export function VenueMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const principalMarkerRef = useRef<maplibregl.Marker | null>(null);

  const venue = useOverwatchStore((s) => s.venue);
  const drones = useOverwatchStore((s) => s.drones);
  const principal = useOverwatchStore((s) => s.principal);
  const [selectedFloor, setSelectedFloor] = useState(0);

  const floors = useMemo((): number[] => {
    if (!venue) return [];
    const set = new Set(venue.zones.map((z) => z.floor));
    return Array.from(set).sort((a, b) => a - b);
  }, [venue]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DARK_STYLE,
      center: [venue?.lng ?? -77.0365, venue?.lat ?? 38.8977],
      zoom: 17,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update zone layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !venue) return;

    const handleLoad = () => {
      const visibleZones = venue.zones.filter((z) => z.floor === selectedFloor);

      for (const zone of visibleZones) {
        if (!zone.polygon || zone.polygon.length < 3) continue;
        const style = getZoneLayerStyle(zone);
        const sourceId = `zone-${zone.id}`;
        const fillId = `zone-fill-${zone.id}`;
        const lineId = `zone-line-${zone.id}`;

        const ring = [...zone.polygon, zone.polygon[0]];

        if (map.getSource(sourceId)) {
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
            type: 'Feature',
            properties: { name: zone.name, type: zone.type },
            geometry: { type: 'Polygon', coordinates: [ring] },
          });
        } else {
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: zone.name, type: zone.type },
              geometry: { type: 'Polygon', coordinates: [ring] },
            },
          });

          map.addLayer({
            id: fillId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': style.fillColor,
              'fill-opacity': style.fillOpacity,
            },
          });

          map.addLayer({
            id: lineId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': style.strokeColor,
              'line-opacity': style.strokeOpacity,
              'line-width': style.strokeWidth,
            },
          });
        }
      }
    };

    if (map.loaded()) {
      handleLoad();
    } else {
      map.on('load', handleLoad);
    }
  }, [venue, selectedFloor]);

  // Update drone markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeDroneIds = new Set<string>();

    for (const drone of drones) {
      if (!drone.position) continue;
      activeDroneIds.add(drone.id);

      const el = document.createElement('div');
      el.className = 'drone-marker';
      el.innerHTML = `
        <svg width="22" height="22" viewBox="-8 -8 16 16">
          <${drone.tier === 'tier_1' ? 'polygon points="0,-6 5,3 -5,3"' : 'rect x="-5" y="-5" width="10" height="10"'}
            fill="${droneColor(drone.perchState)}" stroke="#0d1117" stroke-width="1" />
        </svg>
        <div style="font-size:7px;font-family:monospace;color:${droneColor(drone.perchState)};text-align:center;margin-top:-2px;text-shadow:0 0 2px #0d1117">${drone.callsign}</div>
      `;
      el.style.cursor = 'pointer';

      const existing = markersRef.current.get(drone.id);
      if (existing) {
        existing.setLngLat([drone.position.lng, drone.position.lat]);
        const existingEl = existing.getElement();
        if (existingEl) {
          existingEl.innerHTML = el.innerHTML;
        }
      } else {
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([drone.position.lng, drone.position.lat])
          .addTo(map);
        markersRef.current.set(drone.id, marker);
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!activeDroneIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [drones]);

  // Update principal marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !principal?.lastKnownPosition) return;

    if (!principalMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:16px;height:16px;border-radius:50%;background:#f85149;border:2px solid #0d1117;box-shadow:0 0 8px #f8514980"></div>
        <div style="font-size:7px;font-family:monospace;color:#f85149;text-align:center;margin-top:1px;text-shadow:0 0 2px #0d1117">${principal.codename}</div>
      `;
      principalMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([
          principal.lastKnownPosition.lng,
          principal.lastKnownPosition.lat,
        ])
        .addTo(map);
    } else {
      principalMarkerRef.current.setLngLat([
        principal.lastKnownPosition.lng,
        principal.lastKnownPosition.lat,
      ]);
    }
  }, [principal]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Floor selector */}
      {floors.length > 1 && (
        <div className="absolute top-12 left-3 flex flex-col gap-1 bg-ow-surface/90 border border-ow-border rounded p-1 backdrop-blur-sm">
          {floors.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFloor(f)}
              className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
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

      {/* Venue label */}
      {venue && (
        <div className="absolute bottom-3 left-3 bg-ow-surface/90 border border-ow-border rounded px-2 py-1 backdrop-blur-sm">
          <span className="text-[10px] text-ow-text-muted">VENUE</span>
          <span className="text-xs text-ow-text font-medium ml-1.5">
            {venue.name}
          </span>
        </div>
      )}
    </div>
  );
}
