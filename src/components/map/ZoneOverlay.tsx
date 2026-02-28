import type { VenueZone } from '@/shared/types';

const ZONE_COLORS: Record<string, string> = {
  lobby: '#58a6ff',
  corridor: '#6e7681',
  room: '#a78bfa',
  stairwell: '#d29922',
  elevator: '#d29922',
  parking: '#8b949e',
  perimeter: '#f97316',
  rooftop: '#79c0ff',
  courtyard: '#3fb950',
  entrance: '#58a6ff',
  custom: '#8b949e',
};

interface ZoneOverlayProps {
  zone: VenueZone;
  isHighlighted?: boolean;
  onClick?: () => void;
}

export function ZoneOverlay({
  zone,
  isHighlighted = false,
  onClick,
}: ZoneOverlayProps) {
  if (!zone.polygon || zone.polygon.length < 3) return null;

  const color = ZONE_COLORS[zone.type] ?? ZONE_COLORS.custom;
  const opacity = isHighlighted ? 0.35 : 0.15;
  const strokeOpacity = isHighlighted ? 0.8 : 0.4;

  return {
    id: zone.id,
    type: zone.type,
    color,
    opacity,
    strokeOpacity,
    polygon: zone.polygon,
    name: zone.name,
    environment: zone.environment,
    onClick,
  };
}

export function getZoneLayerStyle(zone: VenueZone, isHighlighted = false) {
  const color = ZONE_COLORS[zone.type] ?? ZONE_COLORS.custom;
  return {
    fillColor: color,
    fillOpacity: isHighlighted ? 0.35 : 0.15,
    strokeColor: color,
    strokeOpacity: isHighlighted ? 0.8 : 0.4,
    strokeWidth: isHighlighted ? 2 : 1,
  };
}
