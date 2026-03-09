import { useIntelligenceStore, type AlertItem } from '@/shared/store/intelligence-store';
import { AlertTriangle, CheckCircle, Shield, Info, XCircle } from 'lucide-react';
import clsx from 'clsx';

export function AlertFeed() {
  const alerts = useIntelligenceStore((s) => s.alerts);
  const resolveAlert = useIntelligenceStore((s) => s.resolveAlert);

  const active = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-3 py-2 space-y-1.5">
      {alerts.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-ow-text-dim text-xs gap-2">
          <Shield size={32} className="opacity-30" />
          <span>No alerts.</span>
        </div>
      )}

      {active.length > 0 && (
        <>
          <h3 className="text-[10px] font-bold tracking-wider uppercase text-ow-text-dim">
            Active ({active.length})
          </h3>
          {active.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onResolve={() => resolveAlert(alert.id)} />
          ))}
        </>
      )}

      {resolved.length > 0 && (
        <>
          <h3 className="text-[10px] font-bold tracking-wider uppercase text-ow-text-dim mt-2">
            Resolved
          </h3>
          {resolved.slice(0, 20).map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </>
      )}
    </div>
  );
}

function AlertRow({ alert, onResolve }: { alert: AlertItem; onResolve?: () => void }) {
  const SeverityIcon =
    alert.severity === 'critical' ? XCircle : alert.severity === 'warning' ? AlertTriangle : Info;

  const severityColor =
    alert.severity === 'critical' ? 'text-red-400' : alert.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400';

  const bgColor =
    alert.severity === 'critical'
      ? 'bg-red-500/5 border-red-500/20'
      : alert.severity === 'warning'
        ? 'bg-yellow-500/5 border-yellow-500/20'
        : 'bg-blue-500/5 border-blue-500/20';

  return (
    <div
      className={clsx(
        'rounded-lg border p-2.5 text-xs',
        alert.resolved ? 'opacity-40' : bgColor,
        alert.resolved && 'border-ow-border/10 bg-transparent',
      )}
    >
      <div className="flex items-start gap-2">
        <SeverityIcon size={14} className={clsx('shrink-0 mt-0.5', severityColor)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-ow-text truncate">{alert.title}</span>
            <span className="text-[9px] text-ow-text-dim shrink-0" title={new Date(alert.timestamp).toISOString()}>
              {new Date(alert.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}
            </span>
          </div>
          <p className="text-ow-text-dim leading-relaxed mt-0.5">{alert.message}</p>

          <div className="flex items-center gap-2 mt-1">
            {alert.source && (
              <span className="text-[9px] text-ow-text-dim/60 font-mono">{alert.source}</span>
            )}
            {alert.confidence != null && (
              <span className="text-[9px] text-ow-text-dim/60 font-mono">
                conf: {Math.round(alert.confidence * 100)}%
              </span>
            )}
          </div>
        </div>

        {!alert.resolved && onResolve && (
          <button
            onClick={onResolve}
            className="shrink-0 p-1 rounded hover:bg-green-500/20 transition-all"
            title="Acknowledge"
          >
            <CheckCircle size={14} className="text-green-400/60 hover:text-green-400" />
          </button>
        )}
      </div>
    </div>
  );
}
