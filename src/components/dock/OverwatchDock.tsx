import { useMemo } from 'react';
import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { TierBadge } from '@/components/common/TierBadge';
import { PerchStateIcon } from '@/components/common/PerchStateIcon';
import type { DroneProfile, Tier } from '@/shared/types';
import {
  Shield, Map, Box, AlertTriangle, Crosshair,
  Eye, Radio, Settings, Battery, Clock,
  Anchor, Navigation, Moon,
} from 'lucide-react';

const DOCK_BG = '#0c1219';
const CARD_BORDER = '#2a3a3a';
const DIVIDER = '#1a2228';
const TEXT_LIGHT = '#a7b3b7';
const TEXT_DIM = '#5a6a70';

const GRAD_DEFAULT = 'linear-gradient(180deg, #1a2530 0%, #141e25 100%)';
const GRAD_SELECTED = 'linear-gradient(180deg, #243038 0%, #1c2830 100%)';
const GRAD_PANEL = 'linear-gradient(180deg, #1e2a30 0%, #151e25 100%)';
const GRAD_EMPTY = 'linear-gradient(180deg, #182028 0%, #121a20 100%)';

export type DockPanel = 'map' | 'coverage' | 'alerts' | 'briefing' | 'operations' | 'assets' | 'worldmodel' | 'settings';

interface OverwatchDockProps {
  activePanel: DockPanel;
  onPanelSelect: (panel: DockPanel) => void;
  mode: 'simulation' | 'live';
  onModeChange: (mode: 'simulation' | 'live') => void;
  selectedDroneId: string | null;
  onSelectDrone: (id: string | null) => void;
}

function statusColor(state: string): string {
  switch (state) {
    case 'perched': return '#3fb950';
    case 'transit': case 'repositioning': return '#58a6ff';
    case 'launching': case 'perching': return '#d29922';
    case 'returning': return '#79c0ff';
    case 'sleeping': return '#6e7681';
    default: return TEXT_DIM;
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return '--';
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function SelectedDroneBox({ drone, onClick }: { drone: DroneProfile | null; onClick: () => void }) {
  if (!drone) {
    return (
      <div className="h-full flex items-center justify-center p-2.5" style={{ background: GRAD_EMPTY }}>
        <div className="text-center">
          <Eye size={18} style={{ color: TEXT_DIM }} className="mx-auto mb-1" />
          <span className="text-[9px]" style={{ color: TEXT_DIM }}>No selection</span>
        </div>
      </div>
    );
  }

  const color = statusColor(drone.perchState);
  const batteryColor = drone.batteryPercent > 50 ? '#3fb950' : drone.batteryPercent > 20 ? '#d29922' : '#f85149';

  return (
    <div className="h-full flex flex-col justify-between p-2.5 cursor-pointer" style={{ background: GRAD_PANEL }} onClick={onClick}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: TEXT_LIGHT }}>
            {drone.callsign}
          </span>
          <TierBadge tier={drone.tier} />
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color, background: `${color}20` }}>
          {drone.perchState}
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center py-1">
        <PerchStateIcon state={drone.perchState} size={28} />
      </div>
      <div className="flex items-center justify-between text-[8px] font-mono" style={{ color: TEXT_DIM }}>
        <span className="flex items-center gap-0.5" style={{ color: batteryColor }}>
          <Battery size={9} /> {Math.round(drone.batteryPercent)}%
        </span>
        {drone.perchStartedAt && (
          <span className="flex items-center gap-0.5">
            <Clock size={9} /> {formatDuration(drone.perchStartedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function NavBox({ label, icon: Icon, active, badge, onClick }: {
  label: string; icon: typeof Shield; active: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col rounded p-1.5 transition-all cursor-pointer hover:brightness-125 overflow-hidden"
      style={{
        background: active ? GRAD_SELECTED : GRAD_DEFAULT,
        border: `1px solid ${active ? CARD_BORDER : DIVIDER}`,
      }}
    >
      <span
        className="text-[9px] font-bold tracking-wider uppercase leading-none self-start z-10"
        style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
      >
        {label}
      </span>
      <div className="flex-1 flex items-center justify-center">
        <Icon size={14} style={{ color: active ? '#2dd4bf' : TEXT_DIM }} />
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-[#f85149] text-white text-[8px] font-bold z-10">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function DroneChip({ drone, selected, onClick }: {
  drone: DroneProfile; selected: boolean; onClick: () => void;
}) {
  const color = statusColor(drone.perchState);
  const batteryColor = drone.batteryPercent > 50 ? '#3fb950' : drone.batteryPercent > 20 ? '#d29922' : '#f85149';

  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded p-1.5 transition-all text-left cursor-pointer hover:brightness-125"
      style={{
        background: selected ? GRAD_SELECTED : GRAD_DEFAULT,
        border: `1px solid ${selected ? CARD_BORDER : DIVIDER}`,
      }}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: TEXT_LIGHT }}>
          {drone.callsign}
        </span>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="flex-1 flex items-center justify-center py-0.5">
        <PerchStateIcon state={drone.perchState} size={12} />
      </div>
      <div className="flex items-center justify-between">
        <TierBadge tier={drone.tier} />
        <span className="text-[7px] font-mono" style={{ color: batteryColor }}>
          {Math.round(drone.batteryPercent)}%
        </span>
      </div>
    </button>
  );
}

export function OverwatchDock({
  activePanel,
  onPanelSelect,
  mode,
  onModeChange,
  selectedDroneId,
  onSelectDrone,
}: OverwatchDockProps) {
  const drones = useOverwatchStore((s) => s.drones);
  const alerts = useOverwatchStore((s) => s.alerts);

  const selectedDrone = useMemo(
    () => selectedDroneId ? drones.find((d) => d.id === selectedDroneId) ?? null : null,
    [drones, selectedDroneId],
  );

  const unackAlerts = alerts.filter((a) => !a.acknowledged);
  const tier1 = drones.filter((d) => d.tier === 'tier_1');
  const tier2 = drones.filter((d) => d.tier === 'tier_2');

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40">
      <div
        className="flex items-stretch gap-[3px] p-[4px] h-[160px]"
        style={{ background: DOCK_BG, borderTop: `1px solid ${DIVIDER}` }}
      >
        {/* LEFT: Selected drone detail */}
        <div className="w-[200px] shrink-0 rounded overflow-hidden" style={{ border: `1px solid ${DIVIDER}` }}>
          <SelectedDroneBox
            drone={selectedDrone}
            onClick={() => onSelectDrone(null)}
          />
        </div>

        {/* MIDDLE: 2×4 navigation grid */}
        <div className="flex-1 grid grid-cols-4 grid-rows-2 gap-[3px] min-w-0 mx-[3px]">
          <NavBox label="Map" icon={Map} active={activePanel === 'map'} onClick={() => onPanelSelect('map')} />
          <NavBox label="Coverage" icon={Crosshair} active={activePanel === 'coverage'} onClick={() => onPanelSelect('coverage')} />
          <NavBox label="Alerts" icon={AlertTriangle} active={activePanel === 'alerts'} badge={unackAlerts.length} onClick={() => onPanelSelect('alerts')} />
          <NavBox label="Briefing" icon={Shield} active={activePanel === 'briefing'} onClick={() => onPanelSelect('briefing')} />
          <NavBox label="Operations" icon={Radio} active={activePanel === 'operations'} onClick={() => onPanelSelect('operations')} />
          <NavBox label="Assets" icon={Box} active={activePanel === 'assets'} onClick={() => onPanelSelect('assets')} />
          <NavBox label="World Model" icon={Eye} active={activePanel === 'worldmodel'} onClick={() => onPanelSelect('worldmodel')} />
          <NavBox label="Settings" icon={Settings} active={activePanel === 'settings'} onClick={() => onPanelSelect('settings')} />
        </div>

        {/* RIGHT: Drone grid — split by tier */}
        <div className="w-[320px] shrink-0 overflow-y-auto overflow-x-hidden" style={{ maxHeight: '100%' }}>
          <div className="flex flex-col gap-[3px] h-full">
            {/* Tier 1 row */}
            {tier1.length > 0 && (
              <div>
                <div className="flex items-center gap-1 px-1 mb-[2px]">
                  <TierBadge tier="tier_1" />
                  <span className="text-[8px] font-mono" style={{ color: TEXT_DIM }}>
                    {tier1.filter((d) => d.perchState !== 'sleeping').length}/{tier1.length}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-[3px]">
                  {tier1.map((d) => (
                    <DroneChip
                      key={d.id}
                      drone={d}
                      selected={d.id === selectedDroneId}
                      onClick={() => onSelectDrone(d.id === selectedDroneId ? null : d.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Tier 2 row */}
            {tier2.length > 0 && (
              <div>
                <div className="flex items-center gap-1 px-1 mb-[2px]">
                  <TierBadge tier="tier_2" />
                  <span className="text-[8px] font-mono" style={{ color: TEXT_DIM }}>
                    {tier2.filter((d) => d.perchState !== 'sleeping').length}/{tier2.length}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-[3px]">
                  {tier2.map((d) => (
                    <DroneChip
                      key={d.id}
                      drone={d}
                      selected={d.id === selectedDroneId}
                      onClick={() => onSelectDrone(d.id === selectedDroneId ? null : d.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mode indicator — far right */}
        <button
          onClick={() => onModeChange(mode === 'simulation' ? 'live' : 'simulation')}
          className="w-[48px] shrink-0 flex flex-col items-center justify-center rounded cursor-pointer transition-all hover:brightness-125"
          style={{
            background: GRAD_DEFAULT,
            border: `1px solid ${DIVIDER}`,
          }}
        >
          <Radio size={14} style={{ color: mode === 'simulation' ? '#d29922' : '#3fb950' }} />
          <span className="text-[8px] font-bold tracking-wider mt-1" style={{ color: mode === 'simulation' ? '#d29922' : '#3fb950' }}>
            {mode === 'simulation' ? 'SIM' : 'LIVE'}
          </span>
        </button>
      </div>
    </div>
  );
}
