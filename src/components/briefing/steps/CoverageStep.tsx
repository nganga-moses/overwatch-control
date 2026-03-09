import { useState, useEffect, useMemo } from 'react';
import { Layers, Shield, AlertTriangle, Ban } from 'lucide-react';
import type { BriefingData } from '../BriefingWizard';

interface ZoneRecord {
  id: string;
  name: string;
  type: string;
  environment: string;
  floor: number;
  tier_requirement: string | null;
}

interface Props {
  data: BriefingData;
  onChange: (patch: Partial<BriefingData>) => void;
}

const PRIORITIES = ['high', 'normal', 'low', 'exclusion'] as const;
const SENSITIVITIES = ['high', 'medium', 'low'] as const;

const PRIORITY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  high:      { bg: '#2dd4bf10', border: '#2dd4bf40', text: 'text-ow-accent',   label: 'High' },
  normal:    { bg: '#161b22',   border: '#30363d',   text: 'text-ow-text',     label: 'Normal' },
  low:       { bg: '#161b22',   border: '#30363d',   text: 'text-ow-text-dim', label: 'Low' },
  exclusion: { bg: '#f8514910', border: '#f8514940', text: 'text-ow-danger',   label: 'Exclusion' },
};

export function CoverageStep({ data, onChange }: Props) {
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!data.venueId) return;
    setLoading(true);
    window.electronAPI?.venues
      .getZones(data.venueId)
      .then((z: ZoneRecord[]) => setZones(z ?? []))
      .finally(() => setLoading(false));
  }, [data.venueId]);

  const floorGroups = useMemo(() => {
    const grouped = new Map<number, ZoneRecord[]>();
    for (const z of zones) {
      const floor = z.floor ?? 0;
      if (!grouped.has(floor)) grouped.set(floor, []);
      grouped.get(floor)!.push(z);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [zones]);

  const stats = useMemo(() => {
    let highCount = 0;
    let exclusionCount = 0;
    for (const val of Object.values(data.zonePriorities)) {
      if (val === 'high') highCount++;
      if (val === 'exclusion') exclusionCount++;
    }
    return {
      total: zones.length,
      high: highCount,
      exclusion: exclusionCount,
      restricted: data.restrictedZoneIds.length,
    };
  }, [zones.length, data.zonePriorities, data.restrictedZoneIds]);

  function getPriority(zoneId: string): string {
    return data.zonePriorities[zoneId] ?? 'normal';
  }

  function getSensitivity(zoneId: string): string {
    return data.zoneAlertSensitivity[zoneId] ?? 'medium';
  }

  function setPriority(zoneId: string, value: string) {
    onChange({ zonePriorities: { ...data.zonePriorities, [zoneId]: value } });
  }

  function setSensitivity(zoneId: string, value: string) {
    onChange({ zoneAlertSensitivity: { ...data.zoneAlertSensitivity, [zoneId]: value } });
  }

  function toggleRestricted(zoneId: string) {
    const current = data.restrictedZoneIds;
    const next = current.includes(zoneId)
      ? current.filter((id) => id !== zoneId)
      : [...current, zoneId];
    onChange({ restrictedZoneIds: next });
  }

  if (!data.venueId) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-ow-text mb-1">Step 5: Coverage Configuration</h2>
          <p className="text-[11px] text-ow-text-dim">Select a venue first to configure zone coverage.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ow-text mb-1">Step 5: Coverage Configuration</h2>
        <p className="text-[11px] text-ow-text-dim">
          Configure zone priorities, alert sensitivity, and restricted areas for {data.venueName}.
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-ow-surface border border-ow-border">
        <div className="text-center">
          <div className="text-lg font-bold text-ow-accent">{stats.total}</div>
          <div className="text-[8px] uppercase tracking-wider text-ow-text-dim">Total Zones</div>
        </div>
        <div className="w-px h-8 bg-ow-border" />
        <div className="text-center">
          <div className="text-lg font-bold text-ow-accent">{stats.high}</div>
          <div className="text-[8px] uppercase tracking-wider text-ow-text-dim">High Priority</div>
        </div>
        <div className="w-px h-8 bg-ow-border" />
        <div className="text-center">
          <div className="text-lg font-bold text-ow-danger">{stats.exclusion}</div>
          <div className="text-[8px] uppercase tracking-wider text-ow-text-dim">Exclusion</div>
        </div>
        <div className="w-px h-8 bg-ow-border" />
        <div className="text-center">
          <div className="text-lg font-bold text-ow-warning">{stats.restricted}</div>
          <div className="text-[8px] uppercase tracking-wider text-ow-text-dim">Restricted</div>
        </div>
      </div>

      {loading && (
        <p className="text-[10px] text-ow-text-dim text-center py-6">Loading zones...</p>
      )}

      {!loading && zones.length === 0 && (
        <p className="text-[10px] text-ow-text-dim text-center py-6">
          No zones configured for this venue. Add zones in the Venue Library first.
        </p>
      )}

      {/* Zone groups by floor */}
      {floorGroups.map(([floor, floorZones]) => (
        <div key={floor} className="space-y-2">
          <div className="flex items-center gap-2">
            <Layers size={12} className="text-ow-text-dim" />
            <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim">
              {floor === 0 ? 'Ground Floor' : floor > 0 ? `Floor ${floor}` : `Basement ${Math.abs(floor)}`}
            </h3>
            <div className="flex-1 h-px bg-ow-border" />
          </div>

          <div className="space-y-1.5">
            {floorZones.map((zone) => {
              const priority = getPriority(zone.id);
              const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal;
              const restricted = data.restrictedZoneIds.includes(zone.id);

              return (
                <div
                  key={zone.id}
                  className="rounded-lg p-3 transition-all"
                  style={{ background: style.bg, border: `1px solid ${style.border}` }}
                >
                  <div className="flex items-center gap-3">
                    {/* Zone info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-medium ${style.text}`}>{zone.name}</span>
                        <span className="text-[8px] font-mono text-ow-text-dim uppercase px-1 py-0.5 rounded bg-ow-bg">
                          {zone.type}
                        </span>
                        {zone.tier_requirement && (
                          <span className="text-[8px] font-mono text-purple-400 uppercase px-1 py-0.5 rounded bg-ow-bg">
                            {zone.tier_requirement}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Priority selector */}
                    <div className="flex items-center gap-1.5">
                      <label className="text-[8px] text-ow-text-dim uppercase">Priority</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(zone.id, e.target.value)}
                        className="bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_STYLES[p].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Sensitivity selector */}
                    <div className="flex items-center gap-1.5">
                      <label className="text-[8px] text-ow-text-dim uppercase">Sensitivity</label>
                      <select
                        value={getSensitivity(zone.id)}
                        onChange={(e) => setSensitivity(zone.id, e.target.value)}
                        className="bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
                      >
                        {SENSITIVITIES.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Restricted toggle */}
                    <button
                      onClick={() => toggleRestricted(zone.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-colors"
                      style={{
                        background: restricted ? '#f8514920' : 'transparent',
                        border: `1px solid ${restricted ? '#f8514940' : '#30363d'}`,
                        color: restricted ? '#f85149' : '#6e7681',
                      }}
                      title="Restricted zone — triggers immediate alert on entry"
                    >
                      {restricted ? <Shield size={10} /> : <Ban size={10} />}
                      {restricted ? 'Restricted' : 'Unrestricted'}
                    </button>
                  </div>

                  {priority === 'exclusion' && (
                    <div className="flex items-center gap-1.5 mt-2 text-[9px] text-ow-danger">
                      <AlertTriangle size={10} />
                      <span>Drones will not enter this zone</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
