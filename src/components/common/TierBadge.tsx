import type { Tier } from '@/shared/types';

interface TierBadgeProps {
  tier: Tier;
  size?: 'sm' | 'md';
}

export function TierBadge({ tier, size = 'sm' }: TierBadgeProps) {
  const label = tier === 'tier_1' ? 'T1' : 'T2';
  const colorClass =
    tier === 'tier_1' ? 'bg-ow-tier1/20 text-ow-tier1' : 'bg-ow-tier2/20 text-ow-tier2';
  const sizeClass = size === 'sm' ? 'text-[9px] px-1 py-0.5' : 'text-xs px-1.5 py-0.5';

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded ${colorClass} ${sizeClass}`}
    >
      {label}
    </span>
  );
}
