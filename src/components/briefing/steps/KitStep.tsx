import { useState, useEffect } from 'react';
import { Box, Check, AlertTriangle } from 'lucide-react';
import type { BriefingData } from '../BriefingWizard';

interface KitRecord {
  id: string;
  name: string;
  type: string;
  serial: string;
  status: string;
}

interface DroneRecord {
  id: string;
  callsign: string;
  tier: string;
  status: string;
  battery_percent: number;
}

interface Props {
  data: BriefingData;
  onChange: (patch: Partial<BriefingData>) => void;
}

export function KitStep({ data, onChange }: Props) {
  const [kits, setKits] = useState<KitRecord[]>([]);
  const [dronesByKit, setDronesByKit] = useState<Record<string, DroneRecord[]>>({});

  useEffect(() => {
    window.electronAPI?.assets.listKits().then(async (k: KitRecord[]) => {
      const list = k ?? [];
      setKits(list);
      const dMap: Record<string, DroneRecord[]> = {};
      for (const kit of list) {
        const drones = await window.electronAPI.assets.listDrones(kit.id);
        dMap[kit.id] = drones ?? [];
      }
      setDronesByKit(dMap);
    });
  }, []);

  function droneCounts(kitId: string) {
    const drones = dronesByKit[kitId] ?? [];
    const t1 = drones.filter((d) => d.tier === 'tier_1').length;
    const t2 = drones.filter((d) => d.tier === 'tier_2').length;
    return { t1, t2 };
  }

  function toggleKit(kitId: string) {
    const current = data.assignedKitIds;
    const next = current.includes(kitId)
      ? current.filter((id) => id !== kitId)
      : [...current, kitId];

    let t1 = 0, t2 = 0;
    for (const id of next) {
      const c = droneCounts(id);
      t1 += c.t1;
      t2 += c.t2;
    }

    onChange({
      assignedKitIds: next,
      kitSummary: { tier1: t1, tier2: t2, total: t1 + t2 },
    });
  }

  const needsT2 = data.environment === 'outdoor' || data.environment === 'mixed';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ow-text mb-1">Step 2: Kit Assignment</h2>
        <p className="text-[11px] text-ow-text-dim">Select one or more kits for this operation.</p>
      </div>

      <div className="flex items-center gap-4 p-3 rounded-lg bg-ow-surface border border-ow-border">
        <div className="text-center">
          <div className="text-lg font-bold text-ow-accent">{data.kitSummary.total}</div>
          <div className="text-[8px] uppercase tracking-wider text-ow-text-dim">Total Drones</div>
        </div>
        <div className="w-px h-8 bg-ow-border" />
        <div className="text-center">
          <div className="text-lg font-bold text-purple-400">{data.kitSummary.tier1}</div>
          <div className="text-[8px] uppercase tracking-wider text-ow-text-dim">Tier 1 Indoor</div>
        </div>
        <div className="w-px h-8 bg-ow-border" />
        <div className="text-center">
          <div className="text-lg font-bold text-orange-400">{data.kitSummary.tier2}</div>
          <div className="text-[8px] uppercase tracking-wider text-ow-text-dim">Tier 2 Outdoor</div>
        </div>
        {needsT2 && data.kitSummary.tier2 === 0 && (
          <>
            <div className="w-px h-8 bg-ow-border" />
            <div className="flex items-center gap-1.5 text-ow-warning text-[10px]">
              <AlertTriangle size={14} />
              <span>Outdoor/mixed venue requires Tier 2 drones</span>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {kits.map((kit) => {
          const selected = data.assignedKitIds.includes(kit.id);
          const drones = dronesByKit[kit.id] ?? [];
          const counts = droneCounts(kit.id);
          const unhealthy = drones.filter((d) => d.status === 'fault' || d.battery_percent < 20);

          return (
            <button
              key={kit.id}
              onClick={() => toggleKit(kit.id)}
              className="text-left rounded-lg p-3 transition-all"
              style={{
                background: selected ? '#2dd4bf10' : '#0d1117',
                border: `1px solid ${selected ? '#2dd4bf40' : '#30363d'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Box size={14} className={selected ? 'text-ow-accent' : 'text-ow-text-dim'} />
                <span className="text-[11px] font-medium text-ow-text flex-1">{kit.name}</span>
                {selected && <Check size={14} className="text-ow-accent" />}
              </div>
              <div className="flex items-center gap-3 text-[9px] text-ow-text-dim font-mono">
                <span className="uppercase">{kit.type}</span>
                <span className="text-purple-400">{counts.t1}×T1</span>
                <span className="text-orange-400">{counts.t2}×T2</span>
                <span className={kit.status === 'ready' ? 'text-ow-safe' : 'text-ow-warning'}>{kit.status}</span>
              </div>
              {unhealthy.length > 0 && (
                <div className="mt-2 flex items-center gap-1 text-[9px] text-ow-warning">
                  <AlertTriangle size={10} />
                  <span>{unhealthy.length} drone(s) need attention</span>
                </div>
              )}
            </button>
          );
        })}
        {kits.length === 0 && (
          <p className="col-span-2 text-center text-[10px] text-ow-text-dim py-6">No kits available. Onboard a kit first.</p>
        )}
      </div>
    </div>
  );
}
