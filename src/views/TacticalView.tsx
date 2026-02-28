import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { VenueMap } from '@/components/map/VenueMap';
import { SwarmPanel } from '@/panels/SwarmPanel';
import { AlertTriangle, Shield, Activity } from 'lucide-react';

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TacticalView() {
  const drones = useOverwatchStore((s) => s.drones);
  const principal = useOverwatchStore((s) => s.principal);
  const alerts = useOverwatchStore((s) => s.alerts);
  const simElapsedMs = useOverwatchStore((s) => s.simElapsedMs);

  const activeCount = drones.filter((d) => d.perchState !== 'sleeping').length;
  const perchedCount = drones.filter((d) => d.perchState === 'perched').length;
  const unackAlerts = alerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unackAlerts.filter((a) => a.severity === 'critical');

  return (
    <div className="flex h-full">
      {/* Map area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 relative">
          <VenueMap />
        </div>

        {/* Bottom status bar */}
        <div className="h-8 flex items-center px-3 gap-4 bg-ow-surface border-t border-ow-border text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <Shield size={11} className="text-ow-accent" />
            <span className="text-ow-text-muted">Principal:</span>
            <span
              className={
                principal?.status === 'safe'
                  ? 'text-ow-safe'
                  : principal?.status === 'at_risk'
                    ? 'text-ow-danger'
                    : 'text-ow-text-dim'
              }
            >
              {principal?.codename ?? '--'}{' '}
              ({principal?.status ?? 'unknown'})
            </span>
          </div>

          <div className="w-px h-3 bg-ow-border" />

          <div className="flex items-center gap-1.5">
            <Activity size={11} className="text-ow-info" />
            <span className="text-ow-text-muted">Drones:</span>
            <span className="text-ow-text">
              {activeCount}/{drones.length} active
            </span>
            <span className="text-ow-perched">
              {perchedCount} perched
            </span>
          </div>

          <div className="w-px h-3 bg-ow-border" />

          {criticalAlerts.length > 0 ? (
            <div className="flex items-center gap-1.5 text-ow-danger">
              <AlertTriangle size={11} />
              <span>{criticalAlerts.length} critical</span>
            </div>
          ) : unackAlerts.length > 0 ? (
            <div className="flex items-center gap-1.5 text-ow-warning">
              <AlertTriangle size={11} />
              <span>{unackAlerts.length} alerts</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-ow-safe">
              <Shield size={11} />
              <span>All clear</span>
            </div>
          )}

          <div className="flex-1" />

          <span className="text-ow-text-dim">
            {formatElapsed(simElapsedMs)}
          </span>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-64">
        <SwarmPanel />
      </div>
    </div>
  );
}
