import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Play, Pause, Square, CheckCircle2,
  XCircle, Clock, MapPin, Shield, ChevronRight,
  Crosshair, AlertTriangle, Target, FileText,
} from 'lucide-react';
import { PostOpReview } from './PostOpReview';

type StatusTab = 'active' | 'upcoming' | 'past';

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
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  planning: { bg: '#6e768115', text: '#6e7681', label: 'Planning' },
  briefing: { bg: '#d2992215', text: '#d29922', label: 'Briefing' },
  deploying: { bg: '#58a6ff15', text: '#58a6ff', label: 'Deploying' },
  active: { bg: '#3fb95015', text: '#3fb950', label: 'Active' },
  repositioning: { bg: '#79c0ff15', text: '#79c0ff', label: 'Repositioning' },
  paused: { bg: '#d2992215', text: '#d29922', label: 'Paused' },
  recovering: { bg: '#f8514915', text: '#f85149', label: 'Recovering' },
  completed: { bg: '#3fb95015', text: '#3fb950', label: 'Completed' },
  aborted: { bg: '#f8514915', text: '#f85149', label: 'Aborted' },
};

const ACTIVE_STATUSES = ['deploying', 'active', 'repositioning', 'paused', 'recovering'];

export function OperationsView({ onStartBriefing }: { onStartBriefing?: (opId: string) => void }) {
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [tab, setTab] = useState<StatusTab>('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewOpId, setReviewOpId] = useState<string | null>(null);

  const loadOperations = useCallback(async () => {
    if (!window.electronAPI?.operations) return;
    const list = await window.electronAPI.operations.list();
    setOperations(list ?? []);
  }, []);

  useEffect(() => { loadOperations(); }, [loadOperations]);

  const filtered = operations.filter((op) => {
    if (search && !op.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'active') return ACTIVE_STATUSES.includes(op.status);
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
        name: `Operation ${new Date().toLocaleDateString()}`,
      });
      await loadOperations();
      setSelectedId(op.id);
      setTab('upcoming');
    } catch (err) {
      console.error('Failed to create operation:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(id: string, action: string) {
    try {
      if (action === 'startBriefing') {
        await window.electronAPI.operations.startBriefing(id);
        onStartBriefing?.(id);
      } else if (action === 'complete') {
        await window.electronAPI.operations.complete(id);
      } else if (action === 'abort') {
        await window.electronAPI.operations.abort(id);
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
                placeholder="Search operations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-ow-surface border border-ow-border rounded pl-8 pr-3 py-1.5 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="p-1.5 rounded bg-ow-accent/10 border border-ow-accent/30 text-ow-accent hover:bg-ow-accent/20 transition-colors disabled:opacity-50"
              title="New operation"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex gap-1">
            {(['active', 'upcoming', 'past'] as const).map((t) => (
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
                  if (t === 'active') return ACTIVE_STATUSES.includes(o.status);
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
              No {tab} operations
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
                  <span className="flex items-center gap-0.5">
                    <AlertTriangle size={8} /> {op.total_alerts}
                  </span>
                  {op.active_drones > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Target size={8} /> {op.active_drones}
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
          <OperationDetail
            operation={selected}
            onAction={handleAction}
            onStartBriefing={onStartBriefing}
            onRefresh={loadOperations}
            onViewReview={(opId) => setReviewOpId(opId)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Crosshair size={32} className="text-ow-text-dim" />
            <p className="text-sm text-ow-text-dim">Select an operation or create a new one</p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded text-xs font-medium bg-ow-accent/10 text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/20 transition-colors disabled:opacity-50"
            >
              <Plus size={14} />
              New Operation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OperationDetail({
  operation: op,
  onAction,
  onStartBriefing,
  onRefresh,
  onViewReview,
}: {
  operation: OperationRecord;
  onAction: (id: string, action: string) => void;
  onStartBriefing?: (opId: string) => void;
  onRefresh: () => void;
  onViewReview?: (opId: string) => void;
}) {
  const style = STATUS_STYLES[op.status] ?? STATUS_STYLES.planning;
  const kitIds: string[] = op.assigned_kit_ids ? JSON.parse(op.assigned_kit_ids) : [];

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
        <StatCard label="Drones" value={op.active_drones} icon={<Target size={14} />} />
        <StatCard label="Alerts" value={op.total_alerts} icon={<AlertTriangle size={14} />} color={op.total_alerts > 0 ? '#f85149' : undefined} />
        <StatCard label="T1 Drones" value={op.drone_count_tier1 ?? 0} />
        <StatCard label="T2 Drones" value={op.drone_count_tier2 ?? 0} />
      </div>

      {/* Kit assignment */}
      {kitIds.length > 0 && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-3">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Assigned Kits</h3>
          <div className="flex flex-wrap gap-1">
            {kitIds.map((kid) => (
              <span key={kid} className="text-[10px] font-mono px-2 py-0.5 rounded bg-ow-bg border border-ow-border text-ow-text">
                {kid.slice(0, 8)}...
              </span>
            ))}
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
        {op.status === 'planning' && (
          <>
            <ActionButton
              label="Start Briefing"
              icon={<FileText size={12} />}
              onClick={() => {
                onAction(op.id, 'startBriefing');
              }}
              accent
            />
            <ActionButton label="Delete" icon={<XCircle size={12} />} onClick={() => onAction(op.id, 'delete')} danger />
          </>
        )}
        {op.status === 'briefing' && (
          <ActionButton
            label="Continue Briefing"
            icon={<FileText size={12} />}
            onClick={() => onStartBriefing?.(op.id)}
            accent
          />
        )}
        {ACTIVE_STATUSES.includes(op.status) && op.status !== 'paused' && (
          <>
            <ActionButton label="Pause" icon={<Pause size={12} />} onClick={() => onAction(op.id, 'pause')} />
            <ActionButton label="End Operation" icon={<CheckCircle2 size={12} />} onClick={() => onAction(op.id, 'complete')} accent />
            <ActionButton label="Abort" icon={<XCircle size={12} />} onClick={() => onAction(op.id, 'abort')} danger />
          </>
        )}
        {op.status === 'paused' && (
          <>
            <ActionButton label="Resume" icon={<Play size={12} />} onClick={() => onAction(op.id, 'resume')} accent />
            <ActionButton label="Abort" icon={<XCircle size={12} />} onClick={() => onAction(op.id, 'abort')} danger />
          </>
        )}
        {op.status === 'completed' && (
          <ActionButton label="View Review" icon={<FileText size={12} />} onClick={() => onViewReview?.(op.id)} accent />
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
  label, icon, onClick, accent, danger,
}: {
  label: string; icon: React.ReactNode; onClick: () => void; accent?: boolean; danger?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-colors';
  const variant = danger
    ? 'text-ow-danger border border-ow-danger/30 hover:bg-ow-danger/10'
    : accent
    ? 'text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/10 bg-ow-accent/5'
    : 'text-ow-text-dim border border-ow-border hover:text-ow-text hover:bg-ow-surface-2';

  return (
    <button onClick={onClick} className={`${base} ${variant}`}>
      {icon}
      {label}
    </button>
  );
}
