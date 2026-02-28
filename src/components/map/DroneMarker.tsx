import type { Tier, PerchState } from '@/shared/types';

const STATE_COLORS: Record<PerchState, string> = {
  sleeping: '#6e7681',
  launching: '#d29922',
  transit: '#58a6ff',
  perching: '#d29922',
  perched: '#3fb950',
  repositioning: '#bc8cff',
  returning: '#79c0ff',
};

const TIER_SHAPES = {
  tier_1: 'M0,-8 L6,4 L-6,4 Z',
  tier_2: 'M-6,-6 L6,-6 L6,6 L-6,6 Z',
} as const;

interface DroneMarkerProps {
  tier: Tier;
  state: PerchState;
  callsign: string;
  batteryPercent: number;
  selected?: boolean;
}

export function DroneMarker({
  tier,
  state,
  callsign,
  batteryPercent,
  selected = false,
}: DroneMarkerProps) {
  const color = STATE_COLORS[state];
  const shapePath = TIER_SHAPES[tier];
  const batteryColor =
    batteryPercent > 50
      ? '#3fb950'
      : batteryPercent > 20
        ? '#d29922'
        : '#f85149';

  return (
    <div className="relative flex flex-col items-center pointer-events-auto cursor-pointer">
      <svg
        width="28"
        height="28"
        viewBox="-10 -10 20 20"
        className="drop-shadow-lg"
      >
        {selected && (
          <circle
            r="12"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            opacity="0.5"
          />
        )}
        <path d={shapePath} fill={color} stroke="#0d1117" strokeWidth="1" />
        {state === 'perched' && (
          <circle r="2" fill="#0d1117" />
        )}
      </svg>
      <div className="absolute -bottom-4 flex flex-col items-center">
        <span
          className="text-[8px] font-mono font-bold leading-none px-0.5 rounded"
          style={{ color, backgroundColor: '#0d1117cc' }}
        >
          {callsign}
        </span>
        <div
          className="w-3 h-[2px] mt-0.5 rounded-full"
          style={{ backgroundColor: batteryColor }}
        />
      </div>
    </div>
  );
}
