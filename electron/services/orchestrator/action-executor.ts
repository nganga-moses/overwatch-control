import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import type { SituationModel, PendingDecision } from './situation-model';
import type { GroundedReasoner } from './grounded-reasoner';

export type AutonomyTier = 'auto' | 'suggest' | 'confirm';

export interface ActionRequest {
  id: string;
  type: string;
  tier: AutonomyTier;
  description: string;
  parameters: Record<string, unknown>;
  zoneId?: string;
  droneId?: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  tier: AutonomyTier;
  actionId: string;
}

export interface ActionCard {
  id: string;
  title: string;
  details: string[];
  status: 'pending' | 'approved' | 'rejected' | 'auto_executed';
  tier: AutonomyTier;
  actionRequest: ActionRequest;
  createdAt: string;
  autoExecuteAt?: string;
}

export interface AutonomyConfig {
  suggestTimeoutS: number;
  confirmEmergencyTimeoutS: number;
}

const TIER_MAP: Record<string, AutonomyTier> = {
  generate_alert: 'auto',
  update_situation: 'auto',
  log_event: 'auto',
  answer_query: 'auto',

  relocate_drone: 'suggest',
  reposition_coverage: 'suggest',
  boost_zone_coverage: 'suggest',
  adjust_perimeter: 'suggest',

  recall_all: 'confirm',
  emergency_lockdown: 'confirm',
  set_threat_level: 'confirm',
  clear_zone: 'confirm',
  hold_all: 'confirm',
  resume_all: 'confirm',
};

const DEFAULT_CONFIG: AutonomyConfig = {
  suggestTimeoutS: 15,
  confirmEmergencyTimeoutS: 30,
};

export class ActionExecutor extends EventEmitter {
  private situationModel: SituationModel;
  private reasoner: GroundedReasoner;
  private mainWindow: BrowserWindow | null = null;
  private config: AutonomyConfig;

  private pendingCards = new Map<string, ActionCard>();
  private autoExecuteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(deps: {
    situationModel: SituationModel;
    reasoner: GroundedReasoner;
    config?: Partial<AutonomyConfig>;
  }) {
    super();
    this.situationModel = deps.situationModel;
    this.reasoner = deps.reasoner;
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setSituationModel(model: SituationModel): void {
    this.situationModel = model;
  }

  getTierForAction(actionType: string): AutonomyTier {
    return TIER_MAP[actionType] ?? 'confirm';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    const tier = this.getTierForAction(request.type);
    request.tier = tier;

    switch (tier) {
      case 'auto':
        return this.executeAuto(request);
      case 'suggest':
        return this.executeSuggest(request);
      case 'confirm':
        return this.executeConfirm(request);
    }
  }

  private async executeAuto(request: ActionRequest): Promise<ActionResult> {
    try {
      const result = await this.dispatch(request);
      this.logAction(request, result);
      return result;
    } catch (err) {
      return { success: false, message: String(err), tier: 'auto', actionId: request.id };
    }
  }

  private async executeSuggest(request: ActionRequest): Promise<ActionResult> {
    const card = this.createCard(request);
    const timeoutMs = this.config.suggestTimeoutS * 1000;
    card.autoExecuteAt = new Date(Date.now() + timeoutMs).toISOString();

    this.pendingCards.set(card.id, card);
    this.situationModel.addPendingDecision({
      id: card.id,
      createdAt: card.createdAt,
      type: 'suggest',
      summary: card.title,
      autoExecuteAt: card.autoExecuteAt,
      resolved: false,
    });

    this.sendToRenderer('orchestrator-action-card', card);

    const timer = setTimeout(async () => {
      const pending = this.pendingCards.get(card.id);
      if (pending?.status === 'pending') {
        pending.status = 'auto_executed';
        this.autoExecuteTimers.delete(card.id);
        try {
          const result = await this.dispatch(request);
          this.logAction(request, result);
          this.situationModel.resolveDecision(card.id);
          this.sendToRenderer('orchestrator-action-executed', { cardId: card.id, result });
        } catch (err) {
          this.sendToRenderer('orchestrator-action-failed', { cardId: card.id, error: String(err) });
        }
        this.pendingCards.delete(card.id);
      }
    }, timeoutMs);

    this.autoExecuteTimers.set(card.id, timer);

    return {
      success: true,
      message: `Suggestion sent. Auto-executing in ${this.config.suggestTimeoutS}s unless cancelled.`,
      tier: 'suggest',
      actionId: request.id,
    };
  }

  private async executeConfirm(request: ActionRequest): Promise<ActionResult> {
    const card = this.createCard(request);
    this.pendingCards.set(card.id, card);
    this.situationModel.addPendingDecision({
      id: card.id,
      createdAt: card.createdAt,
      type: 'confirm',
      summary: card.title,
      resolved: false,
    });

    this.sendToRenderer('orchestrator-action-card', card);

    return {
      success: true,
      message: 'Awaiting operator confirmation.',
      tier: 'confirm',
      actionId: request.id,
    };
  }

  async respondToCard(
    cardId: string,
    action: 'approve' | 'reject' | 'cancel',
  ): Promise<ActionResult> {
    const card = this.pendingCards.get(cardId);
    if (!card) {
      return { success: false, message: 'No pending action card found.', tier: 'confirm', actionId: '' };
    }

    const timer = this.autoExecuteTimers.get(cardId);
    if (timer) {
      clearTimeout(timer);
      this.autoExecuteTimers.delete(cardId);
    }

    if (action === 'approve') {
      card.status = 'approved';
      this.pendingCards.delete(cardId);
      this.situationModel.resolveDecision(cardId);

      try {
        const result = await this.dispatch(card.actionRequest);
        this.logAction(card.actionRequest, result);
        this.sendToRenderer('orchestrator-action-executed', { cardId, result });
        return result;
      } catch (err) {
        return { success: false, message: String(err), tier: card.tier, actionId: card.actionRequest.id };
      }
    }

    card.status = 'rejected';
    this.pendingCards.delete(cardId);
    this.situationModel.resolveDecision(cardId);
    this.sendToRenderer('orchestrator-action-cancelled', { cardId });
    return {
      success: true,
      message: action === 'cancel' ? 'Action cancelled.' : 'Action rejected.',
      tier: card.tier,
      actionId: card.actionRequest.id,
    };
  }

  getPendingCards(): ActionCard[] {
    return Array.from(this.pendingCards.values()).filter((c) => c.status === 'pending');
  }

  private async dispatch(request: ActionRequest): Promise<ActionResult> {
    switch (request.type) {
      case 'generate_alert':
        this.sendToRenderer('orchestrator-alert', {
          severity: request.parameters.severity ?? 'info',
          title: request.parameters.title ?? 'Alert',
          message: request.parameters.message ?? '',
          source: 'orchestrator',
          timestamp: new Date().toISOString(),
        });
        return { success: true, message: 'Alert sent.', tier: 'auto', actionId: request.id };

      case 'set_threat_level':
        this.situationModel.setThreatLevel(request.parameters.level as any ?? 'amber');
        this.sendToRenderer('threat-level-change', { level: request.parameters.level });
        return { success: true, message: `Threat level set to ${request.parameters.level}.`, tier: request.tier, actionId: request.id };

      case 'hold_all':
      case 'resume_all':
      case 'recall_all':
      case 'emergency_lockdown':
        this.sendToRenderer('orchestrator-command', { command: request.type, parameters: request.parameters });
        return { success: true, message: `${request.type.replace(/_/g, ' ')} command dispatched.`, tier: request.tier, actionId: request.id };

      case 'relocate_drone':
      case 'reposition_coverage':
      case 'boost_zone_coverage':
      case 'adjust_perimeter':
      case 'clear_zone':
        this.sendToRenderer('orchestrator-command', { command: request.type, parameters: request.parameters });
        return { success: true, message: `${request.type.replace(/_/g, ' ')} dispatched.`, tier: request.tier, actionId: request.id };

      default:
        return { success: false, message: `Unknown action: ${request.type}`, tier: request.tier, actionId: request.id };
    }
  }

  private createCard(request: ActionRequest): ActionCard {
    return {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: request.type.replace(/_/g, ' '),
      details: [request.description],
      status: 'pending',
      tier: request.tier,
      actionRequest: request,
      createdAt: new Date().toISOString(),
    };
  }

  private logAction(request: ActionRequest, result: ActionResult): void {
    this.emit('action-executed', { request, result, timestamp: new Date().toISOString() });
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  shutdown(): void {
    for (const timer of this.autoExecuteTimers.values()) clearTimeout(timer);
    this.autoExecuteTimers.clear();
    this.pendingCards.clear();
  }
}
