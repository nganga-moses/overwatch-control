import { useEffect } from 'react';
import { useIntelligenceStore } from '@/shared/store/intelligence-store';
import { ChatPanel } from './ChatPanel';
import { DecisionFeed } from './DecisionFeed';
import { AlertFeed } from './AlertFeed';
import { MessageSquare, GitBranch, AlertTriangle, X, Brain } from 'lucide-react';
import clsx from 'clsx';

const api = (window as any).electronAPI;

export function IntelligencePanel() {
  const panelOpen = useIntelligenceStore((s) => s.panelOpen);
  const activeTab = useIntelligenceStore((s) => s.activeTab);
  const setActiveTab = useIntelligenceStore((s) => s.setActiveTab);
  const setPanelOpen = useIntelligenceStore((s) => s.setPanelOpen);
  const actionCards = useIntelligenceStore((s) => s.actionCards);
  const alerts = useIntelligenceStore((s) => s.alerts);
  const addMessage = useIntelligenceStore((s) => s.addMessage);
  const addActionCard = useIntelligenceStore((s) => s.addActionCard);
  const addAlert = useIntelligenceStore((s) => s.addAlert);
  const setLlmStatus = useIntelligenceStore((s) => s.setLlmStatus);

  const pendingCards = actionCards.filter((c) => c.status === 'pending').length;
  const activeAlerts = alerts.filter((a) => !a.resolved).length;

  useEffect(() => {
    if (!api.orchestrator) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      api.orchestrator.onMessage((msg: any) => {
        addMessage(msg);
      }),
    );

    unsubs.push(
      api.orchestrator.onActionCard((card: any) => {
        addActionCard(card);
      }),
    );

    unsubs.push(
      api.orchestrator.onAlert((alert: any) => {
        addAlert({
          id: alert.id ?? `alert-${Date.now()}`,
          timestamp: alert.timestamp ?? new Date().toISOString(),
          severity: alert.severity ?? 'info',
          title: alert.title ?? 'Alert',
          message: alert.message ?? '',
          source: alert.source ?? 'orchestrator',
          resolved: false,
          zoneId: alert.zoneId,
          droneId: alert.droneId,
          confidence: alert.confidence,
        });
      }),
    );

    if (api.llm?.onStatusChange) {
      unsubs.push(
        api.llm.onStatusChange((status: any) => {
          setLlmStatus(status);
        }),
      );
    }

    api.llm?.getStatus?.().then((s: any) => s && setLlmStatus(s));

    return () => unsubs.forEach((u) => u());
  }, [addMessage, addActionCard, addAlert, setLlmStatus]);

  if (!panelOpen) return null;

  const tabs = [
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare, badge: 0 },
    { id: 'decisions' as const, label: 'Decisions', icon: GitBranch, badge: pendingCards },
    { id: 'alerts' as const, label: 'Alerts', icon: AlertTriangle, badge: activeAlerts },
  ];

  return (
    <div className="w-[360px] shrink-0 h-full flex flex-col bg-[#0c1219] border-l border-ow-border/20">
      {/* Titlebar spacer */}
      <div className="h-8 shrink-0 titlebar-drag" />
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-ow-border/20">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-ow-accent" />
          <span className="text-xs font-bold tracking-wider uppercase text-ow-text">
            Control
          </span>
        </div>
        <button
          onClick={() => setPanelOpen(false)}
          className="p-1 rounded hover:bg-ow-surface/50 transition-all"
        >
          <X size={14} className="text-ow-text-dim" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-ow-border/20">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-bold tracking-wider uppercase transition-all relative',
              activeTab === tab.id
                ? 'text-ow-accent'
                : 'text-ow-text-dim hover:text-ow-text',
            )}
          >
            <tab.icon size={12} />
            {tab.label}
            {tab.badge > 0 && (
              <span className="absolute top-1 right-2 min-w-[14px] h-3.5 flex items-center justify-center px-0.5 rounded-full bg-[#c43a3a] text-white text-[8px] font-bold">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-ow-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'decisions' && <DecisionFeed />}
        {activeTab === 'alerts' && <AlertFeed />}
      </div>
    </div>
  );
}
