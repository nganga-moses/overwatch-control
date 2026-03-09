import { useMemo } from 'react';
import { AlertTriangle, Shield, Radio, Clock, MapPin, Box, Users, Layers, Settings, Rocket } from 'lucide-react';
import type { BriefingData } from '../BriefingWizard';

interface Props {
  data: BriefingData;
  onChange: (patch: Partial<BriefingData>) => void;
}

const AUTONOMY_LABELS: Record<string, string> = {
  inform: 'Inform Only',
  recommend: 'Recommend Actions',
  act: 'Act Autonomously',
};

export function ReviewStep({ data }: Props) {
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!data.venueId) w.push('No venue selected');
    if (data.assignedKitIds.length === 0) w.push('No kits assigned');
    if (!data.principalId) w.push('No principal configured');
    if (!data.plannedStart) w.push('No planned start time');
    return w;
  }, [data.venueId, data.assignedKitIds.length, data.principalId, data.plannedStart]);

  const zonePriorityCounts = useMemo(() => {
    let high = 0, exclusion = 0;
    for (const v of Object.values(data.zonePriorities)) {
      if (v === 'high') high++;
      if (v === 'exclusion') exclusion++;
    }
    return { configured: Object.keys(data.zonePriorities).length, high, exclusion };
  }, [data.zonePriorities]);

  const hitlSummary = useMemo(() => {
    const parts: string[] = [];
    if (data.hitlRules.critical) parts.push('Critical');
    if (data.hitlRules.warning) parts.push('Warning');
    if (data.hitlRules.info) parts.push('Info');
    return parts.length > 0 ? parts.join(', ') : 'None';
  }, [data.hitlRules]);

  function formatTime(iso: string): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ow-text mb-1">Step 7: Review & Deploy</h2>
        <p className="text-[11px] text-ow-text-dim">Review all configuration before deployment.</p>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg p-3 space-y-1.5" style={{ background: '#d2992210', border: '1px solid #d2992240' }}>
          <div className="flex items-center gap-1.5 text-ow-warning text-[11px] font-medium">
            <AlertTriangle size={14} />
            <span>Missing Configuration</span>
          </div>
          {warnings.map((w) => (
            <div key={w} className="text-[10px] text-ow-warning pl-5">• {w}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Operation */}
        <Section icon={<Rocket size={12} />} title="Operation">
          <Row label="Name" value={data.operationName || '—'} />
          <Row label="Type" value={data.operationType.replace(/_/g, ' ')} />
          <Row label="Environment" value={data.environment} />
          <Row label="Start" value={formatTime(data.plannedStart)} />
          <Row label="End" value={formatTime(data.plannedEnd)} />
        </Section>

        {/* Venue */}
        <Section icon={<MapPin size={12} />} title="Venue">
          <Row label="Name" value={data.venueName || '—'} />
          <Row label="Type" value={data.venueType} />
          {data.venueLat != null && data.venueLng != null && (
            <Row label="Coords" value={`${data.venueLat.toFixed(4)}, ${data.venueLng.toFixed(4)}`} mono />
          )}
        </Section>

        {/* Kit Assignment */}
        <Section icon={<Box size={12} />} title="Kit Assignment">
          {data.assignedKitIds.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {data.assignedKitIds.map((id) => (
                  <span key={id} className="text-[9px] font-mono text-ow-accent bg-ow-bg px-1.5 py-0.5 rounded">
                    {id.slice(0, 8)}
                  </span>
                ))}
              </div>
              <Row
                label="Tier Summary"
                value={`${data.kitSummary.tier1} × T1, ${data.kitSummary.tier2} × T2, ${data.kitSummary.total} total`}
              />
            </>
          ) : (
            <p className="text-[9px] text-ow-text-dim">No kits assigned</p>
          )}
        </Section>

        {/* Principal */}
        <Section icon={<Shield size={12} />} title="Principal">
          {data.principalId ? (
            <>
              <Row label="Codename" value={data.principalCodename} />
              <Row label="BLE Beacon" value={data.principalBleBeaconId ? 'Paired' : 'Not paired'} />
              <Row label="Arrival" value={formatTime(data.arrivalTime)} />
              <Row label="Departure" value={formatTime(data.departureTime)} />
            </>
          ) : (
            <p className="text-[9px] text-ow-text-dim">No principal configured</p>
          )}
        </Section>

        {/* Protection Detail */}
        <Section icon={<Users size={12} />} title="Protection Detail">
          {data.agents.length > 0 ? (
            <>
              <Row label="Agents" value={`${data.agents.length}`} />
              <div className="space-y-1 mt-1.5">
                {data.agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-ow-text">{a.callsign}</span>
                    <span className="text-[8px] font-mono uppercase text-ow-text-dim px-1 py-0.5 rounded bg-ow-bg">
                      {a.role}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[9px] text-ow-text-dim">No agents assigned</p>
          )}
        </Section>

        {/* Coverage */}
        <Section icon={<Layers size={12} />} title="Coverage">
          <Row label="Zones Configured" value={`${zonePriorityCounts.configured}`} />
          <Row label="High Priority" value={`${zonePriorityCounts.high}`} />
          <Row label="Exclusion" value={`${zonePriorityCounts.exclusion}`} />
          <Row label="Restricted" value={`${data.restrictedZoneIds.length}`} />
        </Section>

        {/* Operational Parameters */}
        <Section icon={<Settings size={12} />} title="Operational Parameters" className="col-span-2">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Row label="Autonomy" value={AUTONOMY_LABELS[data.autonomyLevel] ?? data.autonomyLevel} />
            </div>
            <div>
              <Row label="HITL Escalation" value={hitlSummary} />
            </div>
            <div>
              <Row label="Environment" value={data.environment} />
            </div>
          </div>
        </Section>
      </div>

      {/* Deployment Breakdown */}
      {data.kitSummary.total > 0 && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-4">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5 mb-3">
            <Radio size={12} /> Deployment Breakdown
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {data.kitSummary.tier1 > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ow-bg border border-ow-border">
                <span className="text-sm font-bold text-purple-400">{data.kitSummary.tier1}</span>
                <span className="text-[10px] text-ow-text-dim">× Tier 1 Indoor</span>
              </div>
            )}
            {data.kitSummary.tier2 > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ow-bg border border-ow-border">
                <span className="text-sm font-bold text-orange-400">{data.kitSummary.tier2}</span>
                <span className="text-[10px] text-ow-text-dim">× Tier 2 Outdoor</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ow-accent-bg border border-ow-accent/20">
              <span className="text-sm font-bold text-ow-accent">{data.kitSummary.total}</span>
              <span className="text-[10px] text-ow-text-dim">Total Drones</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
  className = '',
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-ow-surface rounded-lg border border-ow-border p-3 ${className}`}>
      <h3 className="text-[8px] font-bold uppercase tracking-widest text-ow-text-dim flex items-center gap-1.5 mb-2">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[9px] text-ow-text-dim shrink-0">{label}</span>
      <span className={`text-[10px] text-ow-text text-right truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
