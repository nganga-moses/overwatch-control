import {
  Moon,
  Rocket,
  Navigation,
  Anchor,
  Move,
  RotateCcw,
  CircleDot,
} from 'lucide-react';
import type { PerchState } from '@/shared/types';

const STATE_CONFIG: Record<
  PerchState,
  { icon: typeof Moon; color: string; label: string }
> = {
  sleeping: { icon: Moon, color: 'text-ow-sleeping', label: 'Sleeping' },
  launching: { icon: Rocket, color: 'text-ow-launching', label: 'Launching' },
  transit: { icon: Navigation, color: 'text-ow-transit', label: 'Transit' },
  perching: { icon: CircleDot, color: 'text-ow-launching', label: 'Perching' },
  perched: { icon: Anchor, color: 'text-ow-perched', label: 'Perched' },
  repositioning: { icon: Move, color: 'text-ow-repositioning', label: 'Repositioning' },
  returning: { icon: RotateCcw, color: 'text-ow-returning', label: 'Returning' },
};

interface PerchStateIconProps {
  state: PerchState;
  size?: number;
  showLabel?: boolean;
}

export function PerchStateIcon({
  state,
  size = 14,
  showLabel = false,
}: PerchStateIconProps) {
  const config = STATE_CONFIG[state] ?? STATE_CONFIG.sleeping;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 ${config.color}`}>
      <Icon size={size} />
      {showLabel && <span className="text-xs">{config.label}</span>}
    </span>
  );
}
