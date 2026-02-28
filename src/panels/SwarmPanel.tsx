import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { TierBadge } from '@/components/common/TierBadge';
import { PerchStateIcon } from '@/components/common/PerchStateIcon';
import { Battery, Clock } from 'lucide-react';
import type { DroneProfile, Tier } from '@/shared/types';

function formatDuration(ms: number | null): string {
  if (!ms) return '--';
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function DroneCard({ drone }: { drone: DroneProfile }) {
  const batteryColor =
    drone.batteryPercent > 50
      ? 'text-ow-safe'
      : drone.batteryPercent > 20
        ? 'text-ow-warning'
        : 'text-ow-danger';

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-ow-surface-2 hover:bg-ow-surface-3 transition-colors">
      <PerchStateIcon state={drone.perchState} size={14} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-semibold text-ow-text truncate">
            {drone.callsign}
          </span>
          <TierBadge tier={drone.tier} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-ow-text-muted capitalize">
            {drone.perchState.replace('_', ' ')}
          </span>
          {drone.perchStartedAt && (
            <span className="flex items-center gap-0.5 text-[10px] text-ow-text-dim">
              <Clock size={9} />
              {formatDuration(drone.perchStartedAt)}
            </span>
          )}
        </div>
      </div>

      <div className={`flex items-center gap-0.5 text-xs font-mono ${batteryColor}`}>
        <Battery size={12} />
        <span>{Math.round(drone.batteryPercent)}%</span>
      </div>
    </div>
  );
}

function TierSection({
  tier,
  drones,
}: {
  tier: Tier;
  drones: DroneProfile[];
}) {
  const label = tier === 'tier_1' ? 'Tier 1 — Indoor' : 'Tier 2 — Outdoor';
  const activeCount = drones.filter((d) => d.perchState !== 'sleeping').length;

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-1.5">
          <TierBadge tier={tier} size="md" />
          <span className="text-xs font-medium text-ow-text-muted">{label}</span>
        </div>
        <span className="text-[10px] text-ow-text-dim">
          {activeCount}/{drones.length} active
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {drones.map((d) => (
          <DroneCard key={d.id} drone={d} />
        ))}
      </div>
    </div>
  );
}

export function SwarmPanel() {
  const drones = useOverwatchStore((s) => s.drones);
  const tier1 = drones.filter((d) => d.tier === 'tier_1');
  const tier2 = drones.filter((d) => d.tier === 'tier_2');

  const totalActive = drones.filter((d) => d.perchState !== 'sleeping').length;
  const totalPerched = drones.filter((d) => d.perchState === 'perched').length;

  return (
    <div className="flex flex-col h-full bg-ow-surface border-l border-ow-border">
      {/* Header */}
      <div className="px-3 py-2 border-b border-ow-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ow-text">Swarm</h2>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-ow-text-muted">
              <span className="text-ow-accent font-mono">{totalActive}</span> active
            </span>
            <span className="text-ow-text-muted">
              <span className="text-ow-perched font-mono">{totalPerched}</span> perched
            </span>
          </div>
        </div>
      </div>

      {/* Drone list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {tier1.length > 0 && <TierSection tier="tier_1" drones={tier1} />}
        {tier2.length > 0 && <TierSection tier="tier_2" drones={tier2} />}
        {drones.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-ow-text-dim">
            No drones connected
          </div>
        )}
      </div>
    </div>
  );
}
