import { useState, useRef, useEffect } from 'react';
import { useIntelligenceStore, type ChatMessage } from '@/shared/store/intelligence-store';
import { Send, Mic, Bot, User, Volume2 } from 'lucide-react';
import clsx from 'clsx';

const api = (window as any).electronAPI;

export function ChatPanel() {
  const messages = useIntelligenceStore((s) => s.messages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.orchestrator.process(input.trim());
      setInput('');
    } catch (err) {
      console.error('[ChatPanel] send failed:', err);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-ow-text-dim text-xs gap-2">
            <Bot size={32} className="opacity-30" />
            <span>Control standing by.</span>
            <span className="text-[10px] opacity-50">Type a command or ask a question.</span>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-ow-border/30 p-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-ow-surface/50 border border-ow-border/30 rounded-lg px-3 py-2 text-xs text-ow-text placeholder:text-ow-text-dim/40 focus:outline-none focus:border-ow-accent/50"
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className={clsx(
              'p-2 rounded-lg transition-all',
              input.trim() && !sending
                ? 'bg-ow-accent/20 text-ow-accent hover:bg-ow-accent/30'
                : 'bg-ow-surface/30 text-ow-text-dim/30',
            )}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isOperator = msg.source === 'operator';

  return (
    <div className={clsx('flex gap-2', isOperator ? 'flex-row-reverse' : '')}>
      <div
        className={clsx(
          'shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
          isOperator ? 'bg-blue-500/20' : 'bg-ow-accent/20',
        )}
      >
        {isOperator ? (
          <User size={12} className="text-blue-400" />
        ) : (
          <Bot size={12} className="text-ow-accent" />
        )}
      </div>

      <div
        className={clsx(
          'max-w-[80%] rounded-lg px-3 py-2 text-xs',
          isOperator
            ? 'bg-blue-500/10 border border-blue-500/20 text-ow-text'
            : 'bg-ow-surface/60 border border-ow-border/20 text-ow-text',
        )}
      >
        {msg.voice && (
          <span className="inline-flex items-center gap-1 text-[9px] text-ow-text-dim mb-1">
            <Volume2 size={9} /> voice
          </span>
        )}
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        {msg.significance && msg.significance !== 'routine' && (
          <span
            className={clsx(
              'inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono',
              msg.significance === 'critical'
                ? 'bg-red-500/20 text-red-400'
                : msg.significance === 'significant'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-yellow-500/20 text-yellow-400',
            )}
          >
            {msg.significance}
          </span>
        )}
      </div>
    </div>
  );
}
