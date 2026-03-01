import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

interface CoveragePoint {
  lat: number;
  lng: number;
  fovDeg: number;
  headingDeg: number;
  radiusM: number;
  value: number;
}

interface CoverageOverlayProps {
  map: MapLibreMap | null;
  points: CoveragePoint[];
  visible: boolean;
}

const SOURCE_ID = 'coverage-source';
const LAYER_ID = 'coverage-layer';

export function CoverageOverlay({ map, points, visible }: CoverageOverlayProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!map) return;

    const features = points.map((p) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [computeFovPolygon(p.lat, p.lng, p.headingDeg, p.fovDeg, p.radiusM)],
      },
      properties: {
        value: p.value,
      },
    }));

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    if (!initialized.current) {
      if (map.getSource(SOURCE_ID)) {
        (map.getSource(SOURCE_ID) as any).setData(geojson);
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
      }

      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['get', 'value'],
              0, 'rgba(248, 81, 73, 0.25)',
              0.5, 'rgba(210, 153, 34, 0.3)',
              1, 'rgba(63, 185, 80, 0.35)',
            ],
            'fill-outline-color': 'rgba(45, 212, 191, 0.4)',
          },
        });
      }

      initialized.current = true;
    } else {
      const source = map.getSource(SOURCE_ID) as any;
      if (source) source.setData(geojson);
    }

    if (map.getLayer(LAYER_ID)) {
      map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    }

    return () => {
      if (map.getLayer(LAYER_ID)) {
        map.removeLayer(LAYER_ID);
      }
      if (map.getSource(SOURCE_ID)) {
        map.removeSource(SOURCE_ID);
      }
      initialized.current = false;
    };
  }, [map, points, visible]);

  return null;
}

function computeFovPolygon(
  lat: number,
  lng: number,
  headingDeg: number,
  fovDeg: number,
  radiusM: number,
): [number, number][] {
  const METERS_PER_DEG_LAT = 111_320;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

  const startAngle = headingDeg - fovDeg / 2;
  const endAngle = headingDeg + fovDeg / 2;
  const steps = Math.max(8, Math.ceil(fovDeg / 5));
  const angleStep = (endAngle - startAngle) / steps;

  const coords: [number, number][] = [[lng, lat]];

  for (let i = 0; i <= steps; i++) {
    const angleDeg = startAngle + angleStep * i;
    const angleRad = (angleDeg * Math.PI) / 180;
    const dx = radiusM * Math.sin(angleRad);
    const dy = radiusM * Math.cos(angleRad);
    const pLng = lng + dx / metersPerDegLon;
    const pLat = lat + dy / METERS_PER_DEG_LAT;
    coords.push([pLng, pLat]);
  }

  coords.push([lng, lat]);
  return coords;
}
