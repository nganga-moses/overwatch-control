import { useState } from 'react';
import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { useIntelligenceStore } from '@/shared/store/intelligence-store';
import { TierBadge } from '@/components/common/TierBadge';
import { PerchStateIcon } from '@/components/common/PerchStateIcon';
import type { DroneProfile, Tier } from '@/shared/types';
import {
  Shield, Map, AlertTriangle, Crosshair, Video,
  Settings, Battery, Clock, Activity, Radio,
  Cloud, CloudOff, Loader2, LogOut,
} from 'lucide-react';

const DOCK_BG = '#0c1219';
const CARD_BORDER = '#2a3a3a';
const DIVIDER = '#1a2228';
const TEXT_LIGHT = '#a7b3b7';
const TEXT_DIM = '#5a6a70';

const GRAD_DEFAULT = 'linear-gradient(180deg, #1a2530 0%, #141e25 100%)';
const GRAD_SELECTED = 'linear-gradient(180deg, #243038 0%, #1c2830 100%)';

export type DockPanel = 'map' | 'coverage' | 'feed' | 'missions' | 'assets' | 'kit_mgmt' | 'settings';

interface OverwatchDockProps {
  activePanel: DockPanel;
  onPanelSelect: (panel: DockPanel) => void;
  mode: 'simulation' | 'live';
  onModeChange: (mode: 'simulation' | 'live') => void;
  onLogout: () => void;
  selectedDroneId: string | null;
  onSelectDrone: (id: string | null) => void;
}

function SettingsButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Settings"
      className="relative flex items-center justify-center p-1 rounded transition-all hover:brightness-125"
      style={{
        background: active ? 'rgba(23, 130, 106, 0.2)' : 'transparent',
        border: `1px solid ${active ? 'rgba(23, 130, 106, 0.4)' : 'transparent'}`,
      }}
    >
      <Settings
        size={14}
        style={{ color: active ? '#17826A' : TEXT_DIM }}
      />
    </button>
  );
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

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
        style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}
      >
        {label}
      </span>
      <div className="flex-1 flex items-center justify-center">
        <Icon
          size={14}
          style={{
            color: active ? '#17826A' : TEXT_DIM,
            filter: active ? 'brightness(1.1)' : undefined,
          }}
        />
      </div>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-[#c43a3a] text-white text-[8px] font-bold z-10"
          style={{ boxShadow: '0 0 6px rgba(196,58,58,0.6)' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {active && (
        <div
          className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full z-10"
          style={{ backgroundColor: '#17826A' }}
        />
      )}
    </button>
  );
}

function TierToggle({ selected, onChange, tier1Count, tier2Count }: {
  selected: Tier; onChange: (tier: Tier) => void; tier1Count: number; tier2Count: number;
}) {
  return (
    <div className="flex items-center rounded-full p-[2px]" style={{ background: '#141e25', border: `1px solid ${DIVIDER}` }}>
      <button
        onClick={() => onChange('tier_1')}
        className="flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[9px] font-bold tracking-wider transition-all"
        style={{
          background: selected === 'tier_1' ? '#a78bfa25' : 'transparent',
          color: selected === 'tier_1' ? '#a78bfa' : TEXT_DIM,
          boxShadow: selected === 'tier_1' ? '0 0 8px #a78bfa20' : 'none',
        }}
      >
        T1
        <span className="font-mono text-[8px] opacity-70">{tier1Count}</span>
      </button>
      <button
        onClick={() => onChange('tier_2')}
        className="flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[9px] font-bold tracking-wider transition-all"
        style={{
          background: selected === 'tier_2' ? '#f9731625' : 'transparent',
          color: selected === 'tier_2' ? '#f97316' : TEXT_DIM,
          boxShadow: selected === 'tier_2' ? '0 0 8px #f9731620' : 'none',
        }}
      >
        T2
        <span className="font-mono text-[8px] opacity-70">{tier2Count}</span>
      </button>
    </div>
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
        <span className="text-[8px] font-mono capitalize" style={{ color: TEXT_DIM }}>
          {drone.perchState.replace('_', ' ')}
        </span>
        <span className="text-[7px] font-mono" style={{ color: batteryColor }}>
          {Math.round(drone.batteryPercent)}%
        </span>
      </div>
    </button>
  );
}

function IntelligenceNavBox() {
  const panelOpen = useIntelligenceStore((s) => s.panelOpen);
  const setPanelOpen = useIntelligenceStore((s) => s.setPanelOpen);
  const actionCards = useIntelligenceStore((s) => s.actionCards);
  const alerts = useIntelligenceStore((s) => s.alerts);

  const pendingCount = actionCards.filter((c) => c.status === 'pending').length + alerts.filter((a) => !a.resolved).length;

  return (
    <button
      onClick={() => setPanelOpen(!panelOpen)}
      className="relative flex flex-col rounded p-1.5 transition-all cursor-pointer hover:brightness-125 overflow-hidden"
      style={{
        background: panelOpen ? GRAD_SELECTED : GRAD_DEFAULT,
        border: `1px solid ${panelOpen ? CARD_BORDER : DIVIDER}`,
      }}
    >
      <span
        className="text-[9px] font-bold tracking-wider uppercase leading-none self-start z-10"
        style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}
      >
        Control
      </span>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img
          src="/control.png"
          alt=""
          className="h-[85%] w-auto object-contain"
          style={{
            filter: 'invert(1) brightness(0.8)',
            mixBlendMode: 'screen',
            opacity: panelOpen ? 0.7 : 0.4,
          }}
        />
      </div>
      {pendingCount > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-[#c43a3a] text-white text-[8px] font-bold z-10"
          style={{ boxShadow: '0 0 6px rgba(196,58,58,0.6)' }}
        >
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}
      {panelOpen && (
        <div
          className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full z-10"
          style={{ backgroundColor: '#17826A' }}
        />
      )}
    </button>
  );
}

export function OverwatchDock({
  activePanel,
  onPanelSelect,
  mode,
  onModeChange,
  onLogout,
  selectedDroneId,
  onSelectDrone,
}: OverwatchDockProps) {
  const drones = useOverwatchStore((s) => s.drones);
  const principal = useOverwatchStore((s) => s.principal);
  const alerts = useOverwatchStore((s) => s.alerts);
  const simElapsedMs = useOverwatchStore((s) => s.simElapsedMs);
  const syncStatus = useOverwatchStore((s) => s.syncStatus);
  const activeOperator = useOverwatchStore((s) => s.activeOperator);
  const activeMission = useOverwatchStore((s) => s.activeMission);

  const [activeTier, setActiveTier] = useState<Tier>('tier_1');

  const unackAlerts = alerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unackAlerts.filter((a) => a.severity === 'critical');
  const tier1 = drones.filter((d) => d.tier === 'tier_1');
  const tier2 = drones.filter((d) => d.tier === 'tier_2');
  const activeCount = drones.filter((d) => d.perchState !== 'sleeping').length;
  const perchedCount = drones.filter((d) => d.perchState === 'perched').length;

  const visibleDrones = activeTier === 'tier_1' ? tier1 : tier2;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40">
      {/* Status strip — directly above dock */}
      <div
        className="flex items-center h-7 px-4 gap-5 text-[10px] font-mono"
        style={{ background: '#0c1219e6', borderTop: `1px solid ${DIVIDER}` }}
      >
        <div className="flex items-center gap-1.5">
          <Shield size={11} className="text-ow-accent" />
          <span style={{ color: TEXT_DIM }}>Principal:</span>
          <span
            style={{
              color: principal?.status === 'safe' ? '#3fb950'
                : principal?.status === 'at_risk' ? '#f85149'
                : TEXT_DIM,
            }}
          >
            {principal?.codename ?? '--'} ({principal?.status ?? 'unknown'})
          </span>
        </div>

        <div className="w-px h-3" style={{ background: `${DIVIDER}` }} />

        <div className="flex items-center gap-1.5">
          <Activity size={11} style={{ color: '#58a6ff' }} />
          <span style={{ color: TEXT_DIM }}>Drones:</span>
          <span style={{ color: TEXT_LIGHT }}>{activeCount}/{drones.length}</span>
          <span style={{ color: '#3fb950' }}>{perchedCount} perched</span>
        </div>

        <div className="w-px h-3" style={{ background: `${DIVIDER}` }} />

        {criticalAlerts.length > 0 ? (
          <div className="flex items-center gap-1.5" style={{ color: '#f85149' }}>
            <AlertTriangle size={11} />
            <span>{criticalAlerts.length} critical</span>
          </div>
        ) : unackAlerts.length > 0 ? (
          <div className="flex items-center gap-1.5" style={{ color: '#d29922' }}>
            <AlertTriangle size={11} />
            <span>{unackAlerts.length} alerts</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5" style={{ color: '#3fb950' }}>
            <Shield size={11} />
            <span>All clear</span>
          </div>
        )}

        <div className="w-px h-3" style={{ background: `${DIVIDER}` }} />

        {activeMission && (
          <>
            <div className="flex items-center gap-1.5">
              <Crosshair size={11} className="text-ow-accent" />
              <span className="font-bold" style={{ color: '#2dd4bf' }}>{activeMission.name}</span>
            </div>
            <div className="w-px h-3" style={{ background: `${DIVIDER}` }} />
          </>
        )}

        {/* Sync status */}
        {syncStatus.state === 'syncing' || syncStatus.state === 'bootstrapping' ? (
          <div className="flex items-center gap-1.5" style={{ color: '#58a6ff' }}>
            <Loader2 size={11} className="animate-spin" />
            <span>{syncStatus.state === 'bootstrapping' ? 'Bootstrap' : 'Syncing'}</span>
          </div>
        ) : syncStatus.state === 'offline' ? (
          <div className="flex items-center gap-1.5" style={{ color: '#d29922' }}>
            <CloudOff size={11} />
            <span>Offline</span>
            {syncStatus.pendingQueueSize > 0 && (
              <span style={{ color: TEXT_DIM }}>({syncStatus.pendingQueueSize} queued)</span>
            )}
          </div>
        ) : syncStatus.state === 'error' ? (
          <div className="flex items-center gap-1.5" style={{ color: '#f85149' }} title={syncStatus.lastError ?? ''}>
            <CloudOff size={11} />
            <span>Sync err</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5" style={{ color: '#3fb950' }}>
            <Cloud size={11} />
            <span>Synced</span>
          </div>
        )}

        {activeOperator && (
          <>
            <div className="w-px h-3" style={{ background: `${DIVIDER}` }} />
            <div className="flex items-center gap-1.5">
              <span style={{ color: TEXT_DIM }}>Op:</span>
              <span style={{ color: TEXT_LIGHT }}>{activeOperator.name}</span>
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* SIM/LIVE toggle in status strip */}
        <button
          onClick={() => onModeChange(mode === 'simulation' ? 'live' : 'simulation')}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all hover:brightness-125"
          style={{
            background: mode === 'simulation' ? '#d2992215' : '#3fb95015',
            border: `1px solid ${mode === 'simulation' ? '#d2992240' : '#3fb95040'}`,
          }}
        >
          <Radio size={10} style={{ color: mode === 'simulation' ? '#d29922' : '#3fb950' }} />
          <span className="text-[9px] font-bold tracking-wider" style={{ color: mode === 'simulation' ? '#d29922' : '#3fb950' }}>
            {mode === 'simulation' ? 'SIM' : 'LIVE'}
          </span>
        </button>

        <span style={{ color: TEXT_DIM }}>{formatElapsed(simElapsedMs)}</span>

        <div className="w-px h-3" style={{ background: `${DIVIDER}` }} />

        <SettingsButton
          active={activePanel === 'settings'}
          onClick={() => onPanelSelect('settings')}
        />

        <button
          onClick={onLogout}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all hover:bg-[#f8514920]"
          title="Logout"
        >
          <LogOut size={11} style={{ color: TEXT_DIM }} />
        </button>
      </div>

      {/* Main dock */}
      <div
        className="flex items-stretch gap-[3px] p-[4px] h-[160px]"
        style={{ background: DOCK_BG, borderTop: `1px solid ${DIVIDER}` }}
      >
        {/* 3×2 navigation grid */}
        <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-[3px] min-w-0 mx-[3px]">
          {/* Map — terrain-style background image */}
          <button
            onClick={() => onPanelSelect('map')}
            className="relative flex flex-col rounded p-1.5 transition-all cursor-pointer hover:brightness-125 overflow-hidden"
            style={{
              background: activePanel === 'map' ? GRAD_SELECTED : GRAD_DEFAULT,
              border: `1px solid ${activePanel === 'map' ? CARD_BORDER : DIVIDER}`,
            }}
          >
            <img
              src="/map.png"
              alt=""
              className="w-full h-full object-cover absolute inset-0 rounded"
              style={{
                opacity: activePanel === 'map' ? 0.45 : 0.2,
                filter: 'brightness(0.7)',
              }}
            />
            <span
              className="text-[9px] font-bold tracking-wider uppercase leading-none self-start z-10"
              style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}
            >
              Map
            </span>
            {activePanel === 'map' && (
              <div className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full z-10" style={{ backgroundColor: '#17826A' }} />
            )}
          </button>
          {/* Missions — image-based, matching mission-control */}
          <button
            onClick={() => onPanelSelect('missions')}
            className="relative flex flex-col rounded p-1.5 transition-all cursor-pointer hover:brightness-125 overflow-hidden"
            style={{
              background: activePanel === 'missions' ? GRAD_SELECTED : GRAD_DEFAULT,
              border: `1px solid ${activePanel === 'missions' ? CARD_BORDER : DIVIDER}`,
            }}
          >
            <span
              className="text-[9px] font-bold tracking-wider uppercase leading-none self-start z-10"
              style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}
            >
              Missions
            </span>
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <img
                src="/missions-flag.png"
                alt=""
                className="h-[50%] w-auto object-contain"
                style={{
                  filter: 'invert(1) brightness(0.8)',
                  mixBlendMode: 'screen',
                  opacity: activePanel === 'missions' ? 0.7 : 0.4,
                }}
              />
            </div>
            {activePanel === 'missions' && (
              <div className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full z-10" style={{ backgroundColor: '#17826A' }} />
            )}
          </button>

          {/* Feed — move camera feeds to main area for larger view */}
          <button
            onClick={() => onPanelSelect('feed')}
            className="relative flex flex-col rounded p-1.5 transition-all cursor-pointer hover:brightness-125 overflow-hidden"
            style={{
              background: activePanel === 'feed' ? GRAD_SELECTED : GRAD_DEFAULT,
              border: `1px solid ${activePanel === 'feed' ? CARD_BORDER : DIVIDER}`,
            }}
          >
            <span
              className="text-[9px] font-bold tracking-wider uppercase leading-none self-start z-10"
              style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}
            >
              Feed
            </span>
            <div className="flex-1 flex items-center justify-center">
              <Video
                size={24}
                style={{
                  color: activePanel === 'feed' ? '#17826A' : TEXT_DIM,
                  opacity: activePanel === 'feed' ? 0.9 : 0.5,
                }}
              />
            </div>
            {activePanel === 'feed' && (
              <div className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full z-10" style={{ backgroundColor: '#17826A' }} />
            )}
          </button>
          {/* Venues — terrain-style background image */}
          <button
            onClick={() => onPanelSelect('assets')}
            className="relative flex flex-col rounded p-1.5 transition-all cursor-pointer hover:brightness-125 overflow-hidden"
            style={{
              background: activePanel === 'assets' ? GRAD_SELECTED : GRAD_DEFAULT,
              border: `1px solid ${activePanel === 'assets' ? CARD_BORDER : DIVIDER}`,
            }}
          >
            <img
              src="/venue-map.jpg"
              alt=""
              className="w-full h-full object-cover absolute inset-0 rounded"
              style={{
                opacity: activePanel === 'assets' ? 0.45 : 0.2,
                filter: 'brightness(0.7)',
              }}
            />
            <span
              className="text-[9px] font-bold tracking-wider uppercase leading-none self-start z-10"
              style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}
            >
              Venues
            </span>
            {activePanel === 'assets' && (
              <div className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full z-10" style={{ backgroundColor: '#17826A' }} />
            )}
          </button>
          {/* Kits — image-based, matching mission-control assets */}
          <button
            onClick={() => onPanelSelect('kit_mgmt')}
            className="relative flex flex-col rounded p-1.5 transition-all cursor-pointer hover:brightness-125 overflow-hidden"
            style={{
              background: activePanel === 'kit_mgmt' ? GRAD_SELECTED : GRAD_DEFAULT,
              border: `1px solid ${activePanel === 'kit_mgmt' ? CARD_BORDER : DIVIDER}`,
            }}
          >
            <img
              src="/assets.png"
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                opacity: activePanel === 'kit_mgmt' ? 0.6 : 0.25,
                filter: activePanel === 'kit_mgmt' ? 'brightness(1.1)' : 'saturate(0.3) brightness(0.9)',
                mixBlendMode: 'lighten',
              }}
            />
            <div
              className="absolute inset-0 z-[1]"
              style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(12,18,25,0.85) 100%)' }}
            />
            <span
              className="text-[9px] font-bold tracking-wider uppercase leading-none self-start z-10"
              style={{ color: TEXT_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}
            >
              Kits
            </span>
            {activePanel === 'kit_mgmt' && (
              <div className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full z-10" style={{ backgroundColor: '#17826A' }} />
            )}
          </button>
          <IntelligenceNavBox />
        </div>

        {/* RIGHT: Drone grid with tier toggle */}
        <div className="w-[320px] shrink-0 flex flex-col" style={{ maxHeight: '100%' }}>
          {/* Tier toggle header */}
          <div className="flex items-center justify-between px-1 pb-[3px]">
            <TierToggle
              selected={activeTier}
              onChange={setActiveTier}
              tier1Count={tier1.length}
              tier2Count={tier2.length}
            />
            <span className="text-[8px] font-mono" style={{ color: TEXT_DIM }}>
              {visibleDrones.filter((d) => d.perchState !== 'sleeping').length}/{visibleDrones.length} active
            </span>
          </div>

          {/* Drone chips */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-4 gap-[3px]">
              {visibleDrones.map((d) => (
                <DroneChip
                  key={d.id}
                  drone={d}
                  selected={d.id === selectedDroneId}
                  onClick={() => onSelectDrone(d.id === selectedDroneId ? null : d.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
