import { useIntelligenceStore, type ActionCard } from '@/shared/store/intelligence-store';
import { Check, X, Clock, Zap, Shield } from 'lucide-react';
import clsx from 'clsx';

const api = (window as any).electronAPI;

export function DecisionFeed() {
  const cards = useIntelligenceStore((s) => s.actionCards);
  const resolveCard = useIntelligenceStore((s) => s.resolveActionCard);

  const pending = cards.filter((c) => c.status === 'pending');
  const resolved = cards.filter((c) => c.status !== 'pending');

  const handleApprove = async (cardId: string) => {
    try {
      await api.orchestrator.respondToCard(cardId, 'approve');
      resolveCard(cardId, 'approved');
    } catch (err) {
      console.error('[DecisionFeed] approve failed:', err);
    }
  };

  const handleReject = async (cardId: string) => {
    try {
      await api.orchestrator.respondToCard(cardId, 'reject');
      resolveCard(cardId, 'rejected');
    } catch (err) {
      console.error('[DecisionFeed] reject failed:', err);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-3 py-2 space-y-2">
      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-ow-text-dim text-xs gap-2">
          <Shield size={32} className="opacity-30" />
          <span>No pending decisions.</span>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <h3 className="text-[10px] font-bold tracking-wider uppercase text-ow-text-dim">
            Pending ({pending.length})
          </h3>
          {pending.map((card) => (
            <DecisionCard key={card.id} card={card} onApprove={handleApprove} onReject={handleReject} />
          ))}
        </>
      )}

      {resolved.length > 0 && (
        <>
          <h3 className="text-[10px] font-bold tracking-wider uppercase text-ow-text-dim mt-2">
            Recent
          </h3>
          {resolved.slice(0, 10).map((card) => (
            <DecisionCard key={card.id} card={card} />
          ))}
        </>
      )}
    </div>
  );
}

function DecisionCard({
  card,
  onApprove,
  onReject,
}: {
  card: ActionCard;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const isPending = card.status === 'pending';

  return (
    <div
      className={clsx(
        'rounded-lg border p-3 text-xs',
        isPending
          ? 'border-ow-accent/30 bg-ow-accent/5'
          : card.status === 'approved'
            ? 'border-green-500/20 bg-green-500/5 opacity-60'
            : 'border-red-500/20 bg-red-500/5 opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="font-bold text-ow-text capitalize truncate min-w-0">{card.title}</span>
        <span
          className={clsx(
            'text-[9px] px-1.5 py-0.5 rounded-full font-mono shrink-0',
            card.tier === 'auto'
              ? 'bg-green-500/20 text-green-400'
              : card.tier === 'suggest'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400',
          )}
        >
          {card.tier}
        </span>
      </div>
      <div className="text-[9px] text-ow-text-dim mb-1.5" title={new Date(card.createdAt).toISOString()}>
        {new Date(card.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}
      </div>

      {card.details.map((d, i) => (
        <p key={i} className="text-ow-text-dim leading-relaxed">
          {d}
        </p>
      ))}

      {card.autoExecuteAt && isPending && (
        <div className="flex items-center gap-1 mt-1.5 text-[9px] text-yellow-400/70">
          <Clock size={9} />
          <span>Auto-executes at {new Date(card.autoExecuteAt).toLocaleTimeString()}</span>
        </div>
      )}

      {isPending && onApprove && onReject && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onApprove(card.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all text-[10px] font-bold"
          >
            <Check size={12} /> Approve
          </button>
          <button
            onClick={() => onReject(card.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-[10px] font-bold"
          >
            <X size={12} /> Reject
          </button>
        </div>
      )}

      {!isPending && (
        <div className="flex items-center gap-1 mt-1.5 text-[9px]">
          {card.status === 'approved' ? (
            <>
              <Check size={9} className="text-green-400" />
              <span className="text-green-400">Approved</span>
            </>
          ) : card.status === 'auto_executed' ? (
            <>
              <Zap size={9} className="text-yellow-400" />
              <span className="text-yellow-400">Auto-executed</span>
            </>
          ) : (
            <>
              <X size={9} className="text-red-400" />
              <span className="text-red-400">Rejected</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
