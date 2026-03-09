import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Plus, Play, Pause, Square, CheckCircle2,
  XCircle, Clock, ChevronRight,
  Crosshair, AlertTriangle, Target, FileText, Rocket, Box,
} from 'lucide-react';
import { PostOpReview } from './PostOpReview';
import { useOverwatchStore } from '@/shared/store/overwatch-store';

type StatusTab = 'upcoming' | 'past';

interface OperationRecord {
  id: string;
  venue_id: string;
  name: string;
  type: string | null;
  status: string;
  environment: string | null;
  principal_id: string | null;
  assigned_kit_ids: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  active_drones: number;
  total_alerts: number;
  drone_count_tier1: number | null;
  drone_count_tier2: number | null;
  coverage_score_avg: number | null;
  notes: string | null;
  briefing_json: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  planning: { bg: '#6e768115', text: '#6e7681', label: 'Planning' },
  briefing: { bg: '#d2992215', text: '#d29922', label: 'Briefed' },
  deploying: { bg: '#58a6ff15', text: '#58a6ff', label: 'Deploying' },
  active: { bg: '#3fb95015', text: '#3fb950', label: 'Active' },
  repositioning: { bg: '#79c0ff15', text: '#79c0ff', label: 'Repositioning' },
  paused: { bg: '#d2992215', text: '#d29922', label: 'Paused' },
  recovering: { bg: '#f8514915', text: '#f85149', label: 'Recovering' },
  completed: { bg: '#3fb95015', text: '#3fb950', label: 'Completed' },
  aborted: { bg: '#f8514915', text: '#f85149', label: 'Aborted' },
};

const ACTIVE_STATUSES = ['deploying', 'active', 'repositioning', 'paused', 'recovering'];

interface MissionsViewProps {
  onStartMission: (opId: string) => void;
  onEndMission: () => void;
  onOpenBriefing: (opId: string) => void;
}

export function MissionsView({ onStartMission, onEndMission, onOpenBriefing }: MissionsViewProps) {
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [tab, setTab] = useState<StatusTab>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewOpId, setReviewOpId] = useState<string | null>(null);
  const activeMission = useOverwatchStore((s) => s.activeMission);

  const loadOperations = useCallback(async () => {
    if (!window.electronAPI?.operations) return;
    const list = await window.electronAPI.operations.list();
    setOperations(list ?? []);
  }, []);

  useEffect(() => { loadOperations(); }, [loadOperations]);

  const activeMissions = operations.filter((op) => ACTIVE_STATUSES.includes(op.status));

  const filtered = operations.filter((op) => {
    if (search && !op.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'upcoming') return ['planning', 'briefing'].includes(op.status);
    if (tab === 'past') return ['completed', 'aborted'].includes(op.status);
    return true;
  });

  const selected = operations.find((o) => o.id === selectedId) ?? null;

  async function handleCreate() {
    setCreating(true);
    try {
      const op = await window.electronAPI.operations.create({
        venueId: '',
        name: `Mission ${new Date().toLocaleDateString()}`,
      });
      await loadOperations();
      setSelectedId(op.id);
      setTab('upcoming');
      onOpenBriefing(op.id);
    } catch (err) {
      console.error('Failed to create mission:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(id: string, action: string) {
    try {
      if (action === 'startMission') {
        await window.electronAPI.operations.deploy(id, {});
        onStartMission(id);
      } else if (action === 'endMission') {
        await window.electronAPI.operations.complete(id);
        onEndMission();
      } else if (action === 'abort') {
        await window.electronAPI.operations.abort(id);
        onEndMission();
      } else if (action === 'pause') {
        await window.electronAPI.operations.pause(id);
      } else if (action === 'resume') {
        await window.electronAPI.operations.resume(id);
      } else if (action === 'delete') {
        await window.electronAPI.operations.delete(id);
        setSelectedId(null);
      }
      await loadOperations();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
  }

  const reviewOp = reviewOpId ? operations.find((o) => o.id === reviewOpId) : null;
  if (reviewOpId && reviewOp) {
    return (
      <PostOpReview
        operationId={reviewOpId}
        operationName={reviewOp.name}
        onClose={() => setReviewOpId(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex bg-ow-bg/95 backdrop-blur-sm overflow-hidden">
      {/* Left sidebar */}
      <div className="w-[320px] shrink-0 flex flex-col border-r border-ow-border">
        <div className="p-3 space-y-2 border-b border-ow-border">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ow-text-dim" />
              <input
                type="text"
                placeholder="Search missions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-ow-surface border border-ow-border rounded pl-8 pr-3 py-1.5 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="p-1.5 rounded bg-ow-accent/10 border border-ow-accent/30 text-ow-accent hover:bg-ow-accent/20 transition-colors disabled:opacity-50"
              title="New mission"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Active mission banner */}
          {activeMission && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-ow-safe/10 border border-ow-safe/30">
              <div className="w-2 h-2 rounded-full bg-ow-safe animate-pulse" />
              <span className="text-[10px] font-bold text-ow-safe uppercase tracking-wider flex-1 truncate">
                {activeMission.name}
              </span>
              <span className="text-[8px] font-mono text-ow-safe/70 uppercase">{activeMission.status}</span>
            </div>
          )}

          <div className="flex gap-1">
            {(['upcoming', 'past'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                style={{
                  background: tab === t ? '#2dd4bf15' : 'transparent',
                  color: tab === t ? '#2dd4bf' : '#6e7681',
                  border: `1px solid ${tab === t ? '#2dd4bf30' : 'transparent'}`,
                }}
              >
                {t} ({operations.filter((o) => {
                  if (t === 'upcoming') return ['planning', 'briefing'].includes(o.status);
                  return ['completed', 'aborted'].includes(o.status);
                }).length})
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
          {filtered.length === 0 && (
            <p className="text-[10px] text-ow-text-dim text-center py-6">
              No {tab} missions
            </p>
          )}
          {filtered.map((op) => {
            const style = STATUS_STYLES[op.status] ?? STATUS_STYLES.planning;
            const isSelected = op.id === selectedId;
            return (
              <button
                key={op.id}
                onClick={() => setSelectedId(op.id)}
                className="w-full text-left rounded-lg p-2.5 transition-all"
                style={{
                  background: isSelected ? '#1c2830' : 'transparent',
                  border: `1px solid ${isSelected ? '#2dd4bf30' : '#30363d'}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                    style={{ background: style.bg, color: style.text }}
                  >
                    {style.label}
                  </span>
                  <span className="flex-1 text-[11px] font-medium text-ow-text truncate">{op.name}</span>
                  <ChevronRight size={12} className="text-ow-text-dim" />
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[9px] text-ow-text-dim font-mono">
                  {op.type && <span className="uppercase">{op.type.replace('_', ' ')}</span>}
                  {op.total_alerts > 0 && (
                    <span className="flex items-center gap-0.5">
                      <AlertTriangle size={8} /> {op.total_alerts}
                    </span>
                  )}
                  <span>{new Date(op.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selected ? (
          <MissionDetail
            operation={selected}
            onAction={handleAction}
            onOpenBriefing={onOpenBriefing}
            onRefresh={loadOperations}
            onViewReview={(opId) => setReviewOpId(opId)}
            hasActiveMission={!!activeMission}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Crosshair size={32} className="text-ow-text-dim" />
            <p className="text-sm text-ow-text-dim">Select a mission or plan a new one</p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded text-xs font-medium bg-ow-accent/10 text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/20 transition-colors disabled:opacity-50"
            >
              <Plus size={14} />
              New Mission
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MissionDetail({
  operation: op,
  onAction,
  onOpenBriefing,
  onRefresh,
  onViewReview,
  hasActiveMission,
}: {
  operation: OperationRecord;
  onAction: (id: string, action: string) => void;
  onOpenBriefing: (opId: string) => void;
  onRefresh: () => void;
  onViewReview: (opId: string) => void;
  hasActiveMission: boolean;
}) {
  const style = STATUS_STYLES[op.status] ?? STATUS_STYLES.planning;
  const kitIds: string[] = useMemo(
    () => (op.assigned_kit_ids ? JSON.parse(op.assigned_kit_ids) : []),
    [op.assigned_kit_ids],
  );

  const [kitMap, setKitMap] = useState<Record<string, { name: string; serial: string; type: string; status: string }>>({});
  const [droneCounts, setDroneCounts] = useState<{ total: number; t1: number; t2: number }>({ total: 0, t1: 0, t2: 0 });

  useEffect(() => {
    if (kitIds.length === 0) {
      setKitMap({});
      setDroneCounts({ total: 0, t1: 0, t2: 0 });
      return;
    }

    (async () => {
      const allKits = await window.electronAPI?.assets?.listKits() ?? [];
      const map: Record<string, { name: string; serial: string; type: string; status: string }> = {};
      for (const k of allKits) {
        if (kitIds.includes(k.id)) {
          map[k.id] = { name: k.name, serial: k.serial, type: k.type, status: k.status };
        }
      }
      setKitMap(map);

      let t1 = 0, t2 = 0;
      for (const kid of kitIds) {
        const drones = await window.electronAPI?.assets?.listDrones(kid) ?? [];
        for (const d of drones) {
          if (d.tier === 'tier_1') t1++;
          else if (d.tier === 'tier_2') t2++;
        }
      }
      setDroneCounts({ total: t1 + t2, t1, t2 });
    })();
  }, [kitIds]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ow-text">{op.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[9px] font-bold uppercase px-2 py-0.5 rounded"
              style={{ background: style.bg, color: style.text }}
            >
              {style.label}
            </span>
            {op.type && (
              <span className="text-[10px] text-ow-text-dim uppercase font-mono">{op.type.replace('_', ' ')}</span>
            )}
            {op.environment && (
              <span className="text-[10px] text-ow-text-dim uppercase font-mono">{op.environment}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Drones" value={droneCounts.total} icon={<Target size={14} />} />
        <StatCard label="Alerts" value={op.total_alerts} icon={<AlertTriangle size={14} />} color={op.total_alerts > 0 ? '#f85149' : undefined} />
        <StatCard label="T1" value={droneCounts.t1} />
        <StatCard label="T2" value={droneCounts.t2} />
      </div>

      {/* Kit assignment */}
      {kitIds.length > 0 && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-3">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Assigned Kits</h3>
          <div className="flex flex-wrap gap-2">
            {kitIds.map((kid) => {
              const kit = kitMap[kid];
              return (
                <div key={kid} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-ow-bg border border-ow-border">
                  <Box size={12} className="text-ow-accent shrink-0" />
                  <div>
                    <span className="text-[11px] font-medium text-ow-text">{kit?.name ?? kid.slice(0, 8)}</span>
                    {kit && (
                      <span className="ml-2 text-[9px] text-ow-text-dim font-mono uppercase">{kit.type} · {kit.status}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-ow-surface rounded-lg border border-ow-border p-3">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Timeline</h3>
        <div className="space-y-1.5 text-[10px]">
          <TimelineRow label="Created" time={op.created_at} />
          {op.planned_start && <TimelineRow label="Planned Start" time={op.planned_start} />}
          {op.actual_start && <TimelineRow label="Deployed" time={op.actual_start} />}
          {op.actual_end && <TimelineRow label="Ended" time={op.actual_end} />}
        </div>
      </div>

      {/* Coverage */}
      {op.coverage_score_avg != null && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-3">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Coverage</h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-ow-bg overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(op.coverage_score_avg ?? 0) * 100}%`,
                  background: (op.coverage_score_avg ?? 0) > 0.8 ? '#3fb950' : (op.coverage_score_avg ?? 0) > 0.5 ? '#d29922' : '#f85149',
                }}
              />
            </div>
            <span className="text-[11px] font-mono text-ow-text">{Math.round((op.coverage_score_avg ?? 0) * 100)}%</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {op.notes && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-3">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-1">Notes</h3>
          <p className="text-[11px] text-ow-text-muted">{op.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-ow-border">
        {/* Planning: open briefing wizard */}
        {op.status === 'planning' && (
          <>
            <ActionButton
              label="Plan Briefing"
              icon={<FileText size={12} />}
              onClick={() => onOpenBriefing(op.id)}
              accent
            />
            <ActionButton label="Delete" icon={<XCircle size={12} />} onClick={() => onAction(op.id, 'delete')} danger />
          </>
        )}

        {/* Briefed: ready to start mission */}
        {op.status === 'briefing' && (
          <>
            <ActionButton
              label="Edit Briefing"
              icon={<FileText size={12} />}
              onClick={() => onOpenBriefing(op.id)}
            />
            <ActionButton
              label="Start Mission"
              icon={<Rocket size={12} />}
              onClick={() => onAction(op.id, 'startMission')}
              accent
              disabled={hasActiveMission}
            />
            {hasActiveMission && (
              <span className="text-[9px] text-ow-warning self-center">End the active mission first</span>
            )}
            <ActionButton label="Delete" icon={<XCircle size={12} />} onClick={() => onAction(op.id, 'delete')} danger />
          </>
        )}

        {/* Active mission controls */}
        {ACTIVE_STATUSES.includes(op.status) && op.status !== 'paused' && (
          <>
            <ActionButton label="Pause" icon={<Pause size={12} />} onClick={() => onAction(op.id, 'pause')} />
            <ActionButton label="End Mission" icon={<CheckCircle2 size={12} />} onClick={() => onAction(op.id, 'endMission')} accent />
            <ActionButton label="Abort" icon={<XCircle size={12} />} onClick={() => onAction(op.id, 'abort')} danger />
          </>
        )}

        {/* Paused */}
        {op.status === 'paused' && (
          <>
            <ActionButton label="Resume" icon={<Play size={12} />} onClick={() => onAction(op.id, 'resume')} accent />
            <ActionButton label="Abort" icon={<XCircle size={12} />} onClick={() => onAction(op.id, 'abort')} danger />
          </>
        )}

        {/* Completed: post-op review */}
        {op.status === 'completed' && (
          <ActionButton label="Post-Mission Review" icon={<FileText size={12} />} onClick={() => onViewReview(op.id)} accent />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="bg-ow-surface rounded-lg border border-ow-border p-2 text-center">
      <div className="flex items-center justify-center gap-1 text-ow-text-dim mb-0.5">
        {icon}
        <span className="text-[8px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-lg font-bold font-mono" style={{ color: color ?? '#e6edf3' }}>{value}</span>
    </div>
  );
}

function TimelineRow({ label, time }: { label: string; time: string }) {
  return (
    <div className="flex items-center gap-2 text-ow-text-muted">
      <Clock size={10} className="text-ow-text-dim shrink-0" />
      <span className="text-ow-text-dim w-24 shrink-0">{label}</span>
      <span className="font-mono">{new Date(time).toLocaleString()}</span>
    </div>
  );
}

function ActionButton({
  label, icon, onClick, accent, danger, disabled,
}: {
  label: string; icon: React.ReactNode; onClick: () => void; accent?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-colors disabled:opacity-30';
  const variant = danger
    ? 'text-ow-danger border border-ow-danger/30 hover:bg-ow-danger/10'
    : accent
    ? 'text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/10 bg-ow-accent/5'
    : 'text-ow-text-dim border border-ow-border hover:text-ow-text hover:bg-ow-surface';

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variant}`}>
      {icon}
      {label}
    </button>
  );
}
