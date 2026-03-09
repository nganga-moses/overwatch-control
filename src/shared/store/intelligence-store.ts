import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  timestamp: string;
  source: 'operator' | 'orchestrator';
  mode: 'agent' | 'plan';
  content: string;
  intentClass?: string;
  significance?: string;
  voice?: boolean;
}

export interface ActionCard {
  id: string;
  title: string;
  details: string[];
  status: 'pending' | 'approved' | 'rejected' | 'auto_executed';
  tier: 'auto' | 'suggest' | 'confirm';
  createdAt: string;
  autoExecuteAt?: string;
}

export interface AlertItem {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  resolved: boolean;
  zoneId?: string;
  droneId?: string;
  confidence?: number;
}

export interface LLMStatusInfo {
  status: string;
  model: string;
  error: string | null;
  restartCount: number;
  uptime_s: number;
  gpu: { vram_total_mb: number; vram_used_mb: number; vram_free_mb: number } | null;
  queueDepth: number;
}

export interface WhisperStatus {
  status: string;
  error: string | null;
}

export interface VoiceState {
  capturing: boolean;
  processing: boolean;
  lastTranscript: string | null;
  error: string | null;
}

export interface IntelligenceState {
  messages: ChatMessage[];
  actionCards: ActionCard[];
  alerts: AlertItem[];
  llmStatus: LLMStatusInfo | null;
  whisperStatus: WhisperStatus | null;
  voiceState: VoiceState;
  orchestratorMode: 'agent' | 'plan';
  panelOpen: boolean;
  activeTab: 'chat' | 'decisions' | 'alerts';

  addMessage: (msg: ChatMessage) => void;
  addActionCard: (card: ActionCard) => void;
  resolveActionCard: (cardId: string, status: 'approved' | 'rejected') => void;
  addAlert: (alert: AlertItem) => void;
  resolveAlert: (alertId: string) => void;
  setLlmStatus: (status: LLMStatusInfo) => void;
  setWhisperStatus: (status: WhisperStatus) => void;
  setVoiceState: (patch: Partial<VoiceState>) => void;
  setOrchestratorMode: (mode: 'agent' | 'plan') => void;
  setPanelOpen: (open: boolean) => void;
  setActiveTab: (tab: 'chat' | 'decisions' | 'alerts') => void;
}

export const useIntelligenceStore = create<IntelligenceState>((set, get) => ({
  messages: [],
  actionCards: [],
  alerts: [],
  llmStatus: null,
  whisperStatus: null,
  voiceState: {
    capturing: false,
    processing: false,
    lastTranscript: null,
    error: null,
  },
  orchestratorMode: 'agent',
  panelOpen: false,
  activeTab: 'chat',

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg].slice(-200) })),

  addActionCard: (card) =>
    set((s) => ({ actionCards: [card, ...s.actionCards].slice(0, 50) })),

  resolveActionCard: (cardId, status) =>
    set((s) => ({
      actionCards: s.actionCards.map((c) =>
        c.id === cardId ? { ...c, status } : c,
      ),
    })),

  addAlert: (alert) =>
    set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 100) })),

  resolveAlert: (alertId) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === alertId ? { ...a, resolved: true } : a,
      ),
    })),

  setLlmStatus: (status) => set({ llmStatus: status }),
  setWhisperStatus: (status) => set({ whisperStatus: status }),
  setVoiceState: (patch) =>
    set((s) => ({ voiceState: { ...s.voiceState, ...patch } })),
  setOrchestratorMode: (mode) => set({ orchestratorMode: mode }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
