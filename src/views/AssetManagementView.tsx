import { useState, useEffect, useCallback, useRef } from 'react';
import { TierBadge } from '@/components/common/TierBadge';
import { PerchStateIcon } from '@/components/common/PerchStateIcon';
import type { Kit, KitType, KitStatus, DroneProfile, DroneStatus } from '@/shared/types';
import { KIT_COMPOSITIONS } from '@/shared/types';
import {
  Search, Box, Battery, Clock, Activity,
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Pencil,
} from 'lucide-react';

type StatusFilter = 'all' | KitStatus;

const KIT_STATUS_COLORS: Record<KitStatus, string> = {
  ready: '#3fb950',
  deployed: '#58a6ff',
  maintenance: '#d29922',
  transit: '#a78bfa',
};

const DRONE_STATUS_COLORS: Record<DroneStatus, string> = {
  idle: '#6e7681',
  active: '#3fb950',
  fault: '#f85149',
  charging: '#d29922',
  offline: '#6e7681',
};

function batteryColor(pct: number): string {
  if (pct > 50) return '#3fb950';
  if (pct > 20) return '#d29922';
  return '#f85149';
}

function formatFlightHours(hours?: number | null): string {
  if (hours == null) return '0m';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

export function AssetManagementView() {
  const [kits, setKits] = useState<Kit[]>([]);
  const [drones, setDrones] = useState<DroneProfile[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadKits = useCallback(async () => {
    if (!window.electronAPI?.assets) return;
    const list = await window.electronAPI.assets.listKits();
    setKits(list ?? []);
  }, []);

  const handleSyncKits = useCallback(async () => {
    if (!window.electronAPI?.sync) return;
    setSyncing(true);
    try {
      const result = await window.electronAPI.sync.fetchAllKits();
      console.info(`[SyncKits] Fetched ${result.kits} kits, ${result.drones} drones`);
      await loadKits();
      if (selectedKitId) {
        const list = await window.electronAPI.assets.listDrones(selectedKitId);
        setDrones(list ?? []);
      }
    } catch (err) {
      console.error('Kit sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, [loadKits, selectedKitId]);

  const loadDrones = useCallback(async (kitId: string | null) => {
    if (!window.electronAPI?.assets || !kitId) {
      setDrones([]);
      return;
    }
    const list = await window.electronAPI.assets.listDrones(kitId);
    setDrones(list ?? []);
  }, []);

  useEffect(() => { loadKits(); }, [loadKits]);
  useEffect(() => { loadDrones(selectedKitId); }, [selectedKitId, loadDrones]);

  const filtered = kits.filter((k) => {
    if (statusFilter !== 'all' && k.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        k.name.toLowerCase().includes(q) ||
        k.serial.toLowerCase().includes(q) ||
        k.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedKit = kits.find((k) => k.id === selectedKitId) ?? null;

  const handleDroneStatusChange = useCallback(async (droneId: string, status: DroneStatus) => {
    try {
      await window.electronAPI?.assets?.updateDrone?.(droneId, { status });
      if (selectedKitId) loadDrones(selectedKitId);
    } catch (err) {
      console.error('Failed to update drone status:', err);
    }
  }, [selectedKitId, loadDrones]);

  const handleDroneCallsignChange = useCallback(async (droneId: string, callsign: string) => {
    try {
      await window.electronAPI?.assets?.updateDrone?.(droneId, { callsign });
      if (selectedKitId) loadDrones(selectedKitId);
    } catch (err) {
      console.error('Failed to update drone callsign:', err);
    }
  }, [selectedKitId, loadDrones]);

  return (
    <div className="flex-1 flex bg-ow-bg/95 backdrop-blur-sm overflow-hidden">
      {/* Left sidebar — kit list */}
      <div className="w-[320px] shrink-0 flex flex-col border-r border-ow-border">
        <div className="p-3 space-y-2 border-b border-ow-border">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ow-text-dim" />
            <input
              type="text"
              placeholder="Search kits..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-ow-surface border border-ow-border rounded pl-8 pr-3 py-1.5 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
            />
          </div>

          <div className="flex gap-1">
            {(['all', 'ready', 'deployed', 'maintenance'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s as StatusFilter)}
                className="flex-1 px-1.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors"
                style={{
                  background: statusFilter === s ? '#2dd4bf15' : 'transparent',
                  color: statusFilter === s ? '#2dd4bf' : '#6e7681',
                  border: `1px solid ${statusFilter === s ? '#2dd4bf30' : 'transparent'}`,
                }}
              >
                {s === 'maintenance' ? 'maint.' : s}
              </button>
            ))}
          </div>

          <button
            onClick={handleSyncKits}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
            style={{
              background: '#2dd4bf12',
              color: '#2dd4bf',
              border: '1px solid #2dd4bf30',
            }}
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Kits'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-ow-text-dim text-xs">
              No kits found
            </div>
          )}
          {filtered.map((kit) => (
            <KitCard
              key={kit.id}
              kit={kit}
              selected={kit.id === selectedKitId}
              onClick={() => setSelectedKitId(kit.id === selectedKitId ? null : kit.id)}
            />
          ))}
        </div>
      </div>

      {/* Right — kit detail */}
      <div className="flex-1 min-w-0 relative">
        {selectedKit ? (
          <KitDetailPanel kit={selectedKit} drones={drones} onDroneStatusChange={handleDroneStatusChange} onDroneCallsignChange={handleDroneCallsignChange} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-ow-text-dim">
              <Box size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs">Select a kit to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KitCard({
  kit,
  selected,
  onClick,
}: {
  kit: Kit;
  selected: boolean;
  onClick: () => void;
}) {
  const statusColor = KIT_STATUS_COLORS[kit.status];
  const composition = KIT_COMPOSITIONS[kit.type];

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2.5 rounded transition-all hover:brightness-110"
      style={{
        background: selected
          ? 'linear-gradient(180deg, #243038 0%, #1c2830 100%)'
          : 'linear-gradient(180deg, #1a2530 0%, #141e25 100%)',
        border: `1px solid ${selected ? '#2a3a3a' : '#1a2228'}`,
      }}
    >
      <div className="flex items-start gap-2">
        <Box size={14} className="mt-0.5 shrink-0" style={{ color: selected ? '#2dd4bf' : '#5a6a70' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-ow-text truncate">
              {kit.name}
            </span>
            <span
              className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ color: statusColor, background: `${statusColor}20` }}
            >
              {kit.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[9px] text-ow-text-dim font-mono">
            <span className="uppercase">{kit.type}</span>
            <span>{kit.serial}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[9px] text-ow-text-dim">
            <span>T1:{composition.tier_1} T2:{composition.tier_2}</span>
            <span className="text-ow-text-dim">·</span>
            <span>{kit.totalDrones} drones</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function KitDetailPanel({
  kit,
  drones,
  onDroneStatusChange,
  onDroneCallsignChange,
}: {
  kit: Kit;
  drones: DroneProfile[];
  onDroneStatusChange: (droneId: string, status: DroneStatus) => void;
  onDroneCallsignChange: (droneId: string, callsign: string) => void;
}) {
  const statusColor = KIT_STATUS_COLORS[kit.status];
  const composition = KIT_COMPOSITIONS[kit.type];

  const healthyCt = drones.filter((d) => d.status === 'active' || d.status === 'idle' || d.status === 'charging').length;
  const warningCt = drones.filter((d) => d.batteryPercent <= 20 && d.status !== 'fault' && d.status !== 'offline').length;
  const faultCt = drones.filter((d) => d.status === 'fault' || d.status === 'offline').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Kit header */}
      <div className="p-4 border-b border-ow-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Box size={20} className="text-ow-accent" />
            <div>
              <h2 className="text-sm font-semibold text-ow-text">{kit.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ow-text-dim font-mono">
                <span className="uppercase">{kit.type}</span>
                <span>{kit.serial}</span>
                <span>T1:{composition.tier_1} T2:{composition.tier_2}</span>
              </div>
            </div>
          </div>
          <span
            className="text-[10px] font-bold uppercase px-2 py-1 rounded"
            style={{ color: statusColor, background: `${statusColor}20`, border: `1px solid ${statusColor}40` }}
          >
            {kit.status}
          </span>
        </div>

        {/* Health summary */}
        <div className="flex items-center gap-4 mt-3">
          <HealthChip icon={CheckCircle2} label="Healthy" count={healthyCt} color="#3fb950" />
          <HealthChip icon={AlertTriangle} label="Warning" count={warningCt} color="#d29922" />
          <HealthChip icon={XCircle} label="Fault" count={faultCt} color="#f85149" />
          <div className="flex-1" />
          <span className="text-[10px] text-ow-text-dim font-mono">
            {drones.length} / {kit.totalDrones} drones loaded
          </span>
        </div>
      </div>

      {/* Drone roster table */}
      <div className="flex-1 overflow-y-auto">
        {drones.length === 0 ? (
          <div className="flex items-center justify-center h-full text-ow-text-dim text-xs">
            No drones in this kit
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-ow-text-dim uppercase tracking-wider border-b border-ow-border">
                <th className="text-left px-4 py-2 font-medium">Callsign</th>
                <th className="text-left px-2 py-2 font-medium">Tier</th>
                <th className="text-left px-2 py-2 font-medium">Status</th>
                <th className="text-left px-2 py-2 font-medium">Battery</th>
                <th className="text-left px-2 py-2 font-medium">Flight Hrs</th>
                <th className="text-left px-2 py-2 font-medium">Perch State</th>
              </tr>
            </thead>
            <tbody>
              {drones.map((drone) => (
                <DroneRow key={drone.id} drone={drone} onStatusChange={onDroneStatusChange} onCallsignChange={onDroneCallsignChange} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function HealthChip({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: typeof CheckCircle2;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono"
      style={{ color, background: `${color}10`, border: `1px solid ${color}25` }}
    >
      <Icon size={12} />
      <span className="font-medium">{count}</span>
      <span className="text-[9px] opacity-70">{label}</span>
    </div>
  );
}

const SETTABLE_STATUSES: DroneStatus[] = ['idle', 'active', 'fault', 'charging', 'offline'];

function DroneRow({ drone, onStatusChange, onCallsignChange }: {
  drone: DroneProfile;
  onStatusChange: (droneId: string, status: DroneStatus) => void;
  onCallsignChange: (droneId: string, callsign: string) => void;
}) {
  const statusCol = DRONE_STATUS_COLORS[drone.status];
  const batCol = batteryColor(drone.batteryPercent);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(drone.callsign);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commitCallsign = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== drone.callsign) {
      onCallsignChange(drone.id, trimmed);
    } else {
      setDraft(drone.callsign);
    }
    setEditing(false);
  };

  return (
    <tr className="border-b border-ow-border/50 hover:bg-ow-surface/30 transition-colors">
      <td className="px-4 py-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCallsign}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCallsign(); if (e.key === 'Escape') { setDraft(drone.callsign); setEditing(false); } }}
            className="bg-ow-surface-2 border border-ow-accent rounded px-1.5 py-0.5 text-sm text-ow-text font-medium w-28 focus:outline-none"
          />
        ) : (
          <span className="inline-flex items-center gap-1.5 group cursor-pointer" onClick={() => { setDraft(drone.callsign); setEditing(true); }}>
            <span className="font-medium text-ow-text tracking-wide">{drone.callsign}</span>
            <Pencil size={10} className="text-ow-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        )}
        <span className="ml-1.5 text-[9px] text-ow-text-dim font-mono">{drone.serial}</span>
      </td>
      <td className="px-2 py-2">
        <TierBadge tier={drone.tier} />
      </td>
      <td className="px-2 py-2">
        <select
          value={drone.status}
          onChange={(e) => onStatusChange(drone.id, e.target.value as DroneStatus)}
          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ow-accent"
          style={{ color: statusCol, background: `${statusCol}20` }}
        >
          {SETTABLE_STATUSES.map((s) => (
            <option key={s} value={s} style={{ background: '#0d1117', color: DRONE_STATUS_COLORS[s] }}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <span className="inline-flex items-center gap-1 font-mono" style={{ color: batCol }}>
          <Battery size={12} />
          {Math.round(drone.batteryPercent ?? 0)}%
        </span>
      </td>
      <td className="px-2 py-2">
        <span className="inline-flex items-center gap-1 text-ow-text-dim font-mono">
          <Clock size={10} />
          {formatFlightHours(drone.flightHours)}
        </span>
      </td>
      <td className="px-2 py-2">
        <PerchStateIcon state={drone.perchState} size={12} showLabel />
      </td>
    </tr>
  );
}
