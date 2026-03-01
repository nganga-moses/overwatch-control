import { useState, useCallback } from 'react';
import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { VenueMap } from '@/components/map/VenueMap';
import { OverwatchDock, type DockPanel } from '@/components/dock/OverwatchDock';
import { AlertTriangle, Shield, Activity } from 'lucide-react';

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface TacticalViewProps {
  mode: 'simulation' | 'live';
  onModeChange: (mode: 'simulation' | 'live') => void;
}

export function TacticalView({ mode, onModeChange }: TacticalViewProps) {
  const drones = useOverwatchStore((s) => s.drones);
  const principal = useOverwatchStore((s) => s.principal);
  const alerts = useOverwatchStore((s) => s.alerts);
  const simElapsedMs = useOverwatchStore((s) => s.simElapsedMs);

  const [activePanel, setActivePanel] = useState<DockPanel>('map');
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);

  const activeCount = drones.filter((d) => d.perchState !== 'sleeping').length;
  const perchedCount = drones.filter((d) => d.perchState === 'perched').length;
  const unackAlerts = alerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unackAlerts.filter((a) => a.severity === 'critical');

  const handlePanelSelect = useCallback((panel: DockPanel) => {
    setActivePanel(panel);
  }, []);

  return (
    <div className="relative h-full bg-ow-bg overflow-hidden">
      {/* Full-bleed map */}
      <VenueMap />

      {/* Top status bar — translucent overlay */}
      <div className="absolute top-0 left-0 right-0 z-30">
        <div className="titlebar-drag h-8" />
        <div className="flex items-center h-8 px-4 gap-5 bg-ow-surface/60 backdrop-blur-xl border-b border-ow-border/40 text-[10px] font-mono">
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
              {principal?.codename ?? '--'} ({principal?.status ?? 'unknown'})
            </span>
          </div>

          <div className="w-px h-3 bg-ow-border/40" />

          <div className="flex items-center gap-1.5">
            <Activity size={11} className="text-ow-info" />
            <span className="text-ow-text-muted">Drones:</span>
            <span className="text-ow-text">
              {activeCount}/{drones.length}
            </span>
            <span className="text-ow-perched">
              {perchedCount} perched
            </span>
          </div>

          <div className="w-px h-3 bg-ow-border/40" />

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

          <span className="text-ow-text-dim">{formatElapsed(simElapsedMs)}</span>
        </div>
      </div>

      {/* Dock — horizontal, full-width, bottom */}
      <OverwatchDock
        activePanel={activePanel}
        onPanelSelect={handlePanelSelect}
        mode={mode}
        onModeChange={onModeChange}
        selectedDroneId={selectedDroneId}
        onSelectDrone={setSelectedDroneId}
      />
    </div>
  );
}
