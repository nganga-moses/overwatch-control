import { useState, useEffect } from 'react';
import {
  ArrowLeft, Clock, Target, AlertTriangle, Shield,
  BarChart3, FileText, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Info, Loader2,
} from 'lucide-react';

interface PostOpReviewProps {
  operationId: string;
  operationName: string;
  onClose: () => void;
}

interface OperationMetrics {
  duration_s: number | null;
  planned_duration_s: number | null;
  alert_counts: Record<string, number>;
  total_alerts: number;
  coverage_score_avg: number | null;
  drone_count_tier1: number;
  drone_count_tier2: number;
  deploy_time_s: number | null;
  total_repositions: number;
}

interface AlertRecord {
  id: string;
  severity: string;
  category: string;
  message: string;
  zone_id: string | null;
  drone_id: string | null;
  acknowledged: number;
  acknowledged_by: string | null;
  created_at: string;
}

interface DebriefResult {
  summary: string;
  metrics: Record<string, any>;
  recommendations: string[];
}

export function PostOpReview({ operationId, operationName, onClose }: PostOpReviewProps) {
  const [metrics, setMetrics] = useState<OperationMetrics | null>(null);
  const [debrief, setDebrief] = useState<DebriefResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'timeline' | 'debrief'>('metrics');

  useEffect(() => {
    loadMetrics();
  }, [operationId]);

  async function loadMetrics() {
    setLoading(true);
    try {
      const m = await window.electronAPI.operations.getMetrics(operationId);
      setMetrics(m);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  }

  async function generateDebrief() {
    setDebriefLoading(true);
    try {
      const d = await window.electronAPI.operations.getDebrief(operationId);
      setDebrief(d);
      setActiveTab('debrief');
    } catch (err) {
      console.error('Failed to generate debrief:', err);
    } finally {
      setDebriefLoading(false);
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <div className="flex-1 flex flex-col bg-ow-bg/95 backdrop-blur-sm overflow-hidden h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-ow-border p-4 flex items-center gap-3">
        <button onClick={onClose} className="p-1.5 rounded hover:bg-ow-surface text-ow-text-dim hover:text-ow-text transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-ow-text">Post-Operation Review</h1>
          <p className="text-[10px] text-ow-text-dim font-mono">{operationName}</p>
        </div>
        <button
          onClick={generateDebrief}
          disabled={debriefLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium bg-ow-accent/10 text-ow-accent border border-ow-accent/30 hover:bg-ow-accent/20 transition-colors disabled:opacity-50"
        >
          {debriefLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
          {debriefLoading ? 'Generating...' : 'Generate Debrief'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex gap-1 px-4 pt-2 border-b border-ow-border">
        {(['metrics', 'timeline', 'debrief'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === t ? '#2dd4bf' : '#6e7681',
              borderBottom: activeTab === t ? '2px solid #2dd4bf' : '2px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="text-ow-text-dim animate-spin" />
          </div>
        ) : activeTab === 'metrics' ? (
          <MetricsDashboard metrics={metrics} formatDuration={formatDuration} />
        ) : activeTab === 'timeline' ? (
          <AlertTimeline operationId={operationId} />
        ) : (
          <DebriefView debrief={debrief} onGenerate={generateDebrief} loading={debriefLoading} />
        )}
      </div>
    </div>
  );
}

function MetricsDashboard({ metrics, formatDuration }: { metrics: OperationMetrics | null; formatDuration: (s: number | null) => string }) {
  if (!metrics) return <p className="text-[10px] text-ow-text-dim text-center py-8">No metrics available</p>;

  const coveragePct = metrics.coverage_score_avg != null ? Math.round(metrics.coverage_score_avg * 100) : null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Duration" value={formatDuration(metrics.duration_s)} sub={metrics.planned_duration_s ? `Planned: ${formatDuration(metrics.planned_duration_s)}` : undefined} icon={<Clock size={14} />} />
        <MetricCard label="Deploy Time" value={metrics.deploy_time_s ? `${Math.round(metrics.deploy_time_s)}s` : '--'} icon={<Target size={14} />} />
        <MetricCard label="Repositions" value={metrics.total_repositions} icon={<RefreshCw size={14} />} />
        <MetricCard label="Total Alerts" value={metrics.total_alerts} icon={<AlertTriangle size={14} />} color={metrics.total_alerts > 10 ? '#f85149' : undefined} />
      </div>

      <div className="bg-ow-surface rounded-lg border border-ow-border p-4">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Coverage Score</h3>
        {coveragePct != null ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full bg-ow-bg overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${coveragePct}%`,
                  background: coveragePct > 80 ? '#3fb950' : coveragePct > 50 ? '#d29922' : '#f85149',
                }}
              />
            </div>
            <span className="text-xl font-bold font-mono" style={{ color: coveragePct > 80 ? '#3fb950' : coveragePct > 50 ? '#d29922' : '#f85149' }}>
              {coveragePct}%
            </span>
          </div>
        ) : (
          <p className="text-[10px] text-ow-text-dim">No coverage data available</p>
        )}
      </div>

      <div className="bg-ow-surface rounded-lg border border-ow-border p-4">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Drone Utilization</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-purple-400 bg-purple-400/10 text-lg font-bold">
              {metrics.drone_count_tier1}
            </div>
            <div>
              <div className="text-[11px] text-ow-text font-medium">Tier 1 Indoor</div>
              <div className="text-[9px] text-ow-text-dim">180mm silent perching</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-orange-400 bg-orange-400/10 text-lg font-bold">
              {metrics.drone_count_tier2}
            </div>
            <div>
              <div className="text-[11px] text-ow-text font-medium">Tier 2 Outdoor</div>
              <div className="text-[9px] text-ow-text-dim">250mm wind-tolerant</div>
            </div>
          </div>
        </div>
      </div>

      {metrics.alert_counts && Object.keys(metrics.alert_counts).length > 0 && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-4">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Alert Summary</h3>
          <div className="flex gap-3">
            {Object.entries(metrics.alert_counts).map(([severity, count]) => (
              <div key={severity} className="flex items-center gap-1.5">
                {severity === 'critical' && <XCircle size={12} className="text-ow-danger" />}
                {severity === 'warning' && <AlertTriangle size={12} className="text-ow-warning" />}
                {severity === 'info' && <Info size={12} className="text-ow-info" />}
                <span className="text-[10px] text-ow-text font-mono">{count}</span>
                <span className="text-[9px] text-ow-text-dim uppercase">{severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-ow-surface rounded-lg border border-ow-border p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-ow-text-dim mb-1">{icon}
        <span className="text-[8px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold font-mono" style={{ color: color ?? '#e6edf3' }}>{value}</div>
      {sub && <div className="text-[8px] text-ow-text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

function AlertTimeline({ operationId }: { operationId: string }) {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Placeholder until alert-list-by-operation IPC is wired
    setTimeout(() => {
      setAlerts([]);
      setLoading(false);
    }, 500);
  }, [operationId]);

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-ow-text-dim" /></div>;

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 size={32} className="text-ow-safe mx-auto mb-2" />
        <p className="text-sm text-ow-text">No alerts recorded</p>
        <p className="text-[10px] text-ow-text-dim mt-1">This operation completed without any alerts.</p>
      </div>
    );
  }

  const filtered = filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter);

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex gap-1">
        {['all', 'critical', 'warning', 'info'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: filter === f ? '#2dd4bf15' : 'transparent',
              color: filter === f ? '#2dd4bf' : '#6e7681',
              border: `1px solid ${filter === f ? '#2dd4bf30' : 'transparent'}`,
            }}
          >
            {f}
          </button>
        ))}
      </div>
      {filtered.map((alert) => (
        <div key={alert.id} className="bg-ow-surface rounded-lg border border-ow-border p-3 flex gap-3">
          <div className="shrink-0">
            {alert.severity === 'critical' && <XCircle size={14} className="text-ow-danger" />}
            {alert.severity === 'warning' && <AlertTriangle size={14} className="text-ow-warning" />}
            {alert.severity === 'info' && <Info size={14} className="text-ow-info" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-ow-text">{alert.message}</p>
            <div className="flex items-center gap-3 mt-1 text-[9px] text-ow-text-dim font-mono">
              <span>{new Date(alert.created_at).toLocaleTimeString()}</span>
              <span className="uppercase">{alert.category}</span>
              {alert.acknowledged ? (
                <span className="text-ow-safe">Acknowledged</span>
              ) : (
                <span className="text-ow-warning">Unacknowledged</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DebriefView({ debrief, onGenerate, loading }: { debrief: DebriefResult | null; onGenerate: () => void; loading: boolean }) {
  if (!debrief) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <FileText size={32} className="text-ow-text-dim mx-auto mb-3" />
        <h3 className="text-sm font-medium text-ow-text mb-1">No debrief generated yet</h3>
        <p className="text-[10px] text-ow-text-dim mb-4">Generate an AI-powered debrief summary from the operation metrics and alerts.</p>
        <button
          onClick={onGenerate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          {loading ? 'Generating...' : 'Generate Debrief'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-ow-surface rounded-lg border border-ow-border p-4">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Summary</h3>
        <p className="text-[11px] text-ow-text leading-relaxed whitespace-pre-wrap">{debrief.summary}</p>
      </div>

      {debrief.recommendations.length > 0 && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-4">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim mb-2">Recommendations</h3>
          <ul className="space-y-1.5">
            {debrief.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-ow-text">
                <span className="text-ow-accent font-bold mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
