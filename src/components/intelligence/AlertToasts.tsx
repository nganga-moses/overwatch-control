import { useState, useEffect, useRef } from 'react';
import { useIntelligenceStore, type AlertItem } from '@/shared/store/intelligence-store';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import clsx from 'clsx';

const TOAST_AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE_TOASTS = 3;

/**
 * Visible alert popups (like Mission Control). New alerts from the orchestrator
 * show as toasts on screen so the operator sees them immediately; they are not
 * hidden in the Intel panel. The Intel panel's Alerts tab remains for history.
 */
export function AlertToasts() {
  const alerts = useIntelligenceStore((s) => s.alerts);
  const resolveAlert = useIntelligenceStore((s) => s.resolveAlert);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const active = alerts.filter((a) => !a.resolved && !dismissedIds.has(a.id));
  const toShow = active.slice(0, MAX_VISIBLE_TOASTS);

  const toShowIds = toShow.map((a) => a.id).join(',');
  useEffect(() => {
    const ids = new Set(toShow.map((a) => a.id));
    toShow.forEach((alert) => {
      if (timersRef.current.has(alert.id)) return;
      const t = setTimeout(() => {
        timersRef.current.delete(alert.id);
        setDismissedIds((prev) => new Set(prev).add(alert.id));
      }, TOAST_AUTO_DISMISS_MS);
      timersRef.current.set(alert.id, t);
    });
    return () => {
      timersRef.current.forEach((t, id) => {
        if (ids.has(id)) return;
        clearTimeout(t);
        timersRef.current.delete(id);
      });
    };
  }, [toShowIds]);

  const handleDismiss = (id: string) => {
    timersRef.current.get(id) && clearTimeout(timersRef.current.get(id)!);
    timersRef.current.delete(id);
    setDismissedIds((prev) => new Set(prev).add(id));
    resolveAlert(id);
  };

  if (toShow.length === 0) return null;

  return (
    <div className="fixed top-12 right-4 z-50 flex flex-col gap-2 max-w-[340px] pointer-events-auto">
      {toShow.map((alert) => (
        <ToastCard key={alert.id} alert={alert} onDismiss={() => handleDismiss(alert.id)} />
      ))}
    </div>
  );
}

function ToastCard({ alert, onDismiss }: { alert: AlertItem; onDismiss: () => void }) {
  const SeverityIcon =
    alert.severity === 'critical' ? XCircle : alert.severity === 'warning' ? AlertTriangle : Info;
  const borderColor =
    alert.severity === 'critical'
      ? 'border-red-500/50'
      : alert.severity === 'warning'
        ? 'border-yellow-500/50'
        : 'border-blue-500/30';
  const bgColor =
    alert.severity === 'critical'
      ? 'bg-red-950/90'
      : alert.severity === 'warning'
        ? 'bg-yellow-950/80'
        : 'bg-[#0c1219]';

  return (
    <div
      className={clsx(
        'rounded-lg border shadow-lg p-3 text-xs',
        borderColor,
        bgColor,
      )}
    >
      <div className="flex items-start gap-2">
        <SeverityIcon
          size={16}
          className={clsx(
            'shrink-0 mt-0.5',
            alert.severity === 'critical' && 'text-red-400',
            alert.severity === 'warning' && 'text-yellow-400',
            alert.severity === 'info' && 'text-blue-400',
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-ow-text truncate">{alert.title}</span>
            <button
              onClick={onDismiss}
              className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
              title="Acknowledge"
            >
              <CheckCircle size={14} className="text-green-400/80 hover:text-green-400" />
            </button>
          </div>
          <p className="text-ow-text-dim leading-relaxed mt-0.5">{alert.message}</p>
          <span className="text-[9px] text-ow-text-dim/80 mt-1 block">
            {new Date(alert.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}
