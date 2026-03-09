import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { LLMManager } from '../../sidecar/llm-manager';
/**
 * Simulation tick data is defined in the renderer process, so we declare
 * a compatible shape here to avoid cross-process import issues.
 */
interface SimTickData {
  drones: Array<{
    id: string;
    callsign: string;
    kitId: string;
    tier: string;
    position: { lat: number; lng: number; alt: number } | null;
    batteryPercent: number;
    perchState: string;
    status?: string;
    targetZoneId?: string | null;
    targetPerchPointId?: string | null;
  }>;
  venue: {
    zones?: Array<{
      id: string;
      name: string;
      threatLevel?: string;
      perchPoints?: Array<{ id: string }>;
    }>;
  };
  principal: {
    currentZoneId?: string | null;
    lastKnownPosition?: { lat: number; lng: number } | null;
    speed?: number;
    heading?: number;
  } | null;
  missionActive: boolean;
  tickCount: number;
  elapsedMs: number;
}

import { SituationModel, type CognitiveEvent, type Alert } from './situation-model';
import { EventClassifier, type ClassifiedEvent } from './event-classifier';
import { AttentionManager, type AttentionItem } from './attention-manager';
import { GroundedReasoner, type ReasoningResult } from './grounded-reasoner';
import { ActionExecutor, type ActionRequest, type ActionCard, type AutonomyConfig } from './action-executor';
import { ProactiveAnalyzer, type ProactiveInsight } from './proactive-analyzer';

export type OrchestratorMode = 'agent' | 'plan';

export type IntentClass = 'command' | 'query' | 'adjustment' | 'unknown';

export interface ChatMessage {
  id: string;
  timestamp: string;
  source: 'operator' | 'orchestrator';
  mode: OrchestratorMode;
  content: string;
  intentClass?: IntentClass;
  actionCard?: ActionCard;
  structuredData?: Record<string, unknown>;
  significance?: string;
  voice?: boolean;
}

export interface OrchestratorDeps {
  llm: LLMManager;
  db: DatabaseType;
  autonomyConfig?: Partial<AutonomyConfig>;
}

export class Orchestrator extends EventEmitter {
  private deps: OrchestratorDeps;
  private mainWindow: BrowserWindow | null = null;
  private db: DatabaseType;

  private situationModel: SituationModel;
  private eventClassifier: EventClassifier;
  private attentionManager: AttentionManager;
  private reasoner: GroundedReasoner;
  private actionExecutor: ActionExecutor;
  private proactiveAnalyzer: ProactiveAnalyzer;

  private currentMode: OrchestratorMode = 'agent';
  private manualModeOverride = false;
  private transcript: ChatMessage[] = [];
  private msgCounter = 0;
  private sessionId: string;
  private running = false;
  private lastPrincipalZone: string | null = null;

  constructor(deps: OrchestratorDeps) {
    super();
    this.deps = deps;
    this.db = deps.db;
    this.sessionId = crypto.randomUUID();

    this.situationModel = new SituationModel(this.db, this.sessionId);
    this.eventClassifier = new EventClassifier();

    this.attentionManager = new AttentionManager(
      (item) => this.processAttentionItem(item),
    );

    this.reasoner = new GroundedReasoner(deps.llm, this.situationModel, this.db);

    this.actionExecutor = new ActionExecutor({
      situationModel: this.situationModel,
      reasoner: this.reasoner,
      config: deps.autonomyConfig,
    });

    this.proactiveAnalyzer = new ProactiveAnalyzer(this.situationModel);

    this.attentionManager.on('housekeeping', () => this.onHousekeeping());
    this.actionExecutor.on('action-executed', (data) => this.onActionExecuted(data));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const resumed = this.restoreState();
    this.attentionManager.start();

    const greeting = resumed
      ? 'Control resumed. Ready for operations.'
      : 'Control standing by.';

    this.addOrchestratorMessage('agent', greeting);
    console.log(`[Orchestrator] Started (session: ${this.sessionId.slice(0, 8)})`);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.attentionManager.stop();
    this.actionExecutor.shutdown();
    this.situationModel.persist();
    this.persistTranscript();
    console.log('[Orchestrator] Stopped');
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    this.actionExecutor.setMainWindow(window);
  }

  // ── Simulation feed ──

  onSimulationTick(data: SimTickData): void {
    if (!this.running || !data.missionActive) return;

    this.situationModel.setMission('sim-mission', true);

    for (const drone of data.drones) {
      const prevDrone = this.situationModel.getDrone(drone.id);

      this.situationModel.updateDrone({
        id: drone.id,
        callsign: drone.callsign,
        kitId: drone.kitId,
        tier: drone.tier as 'tier_1' | 'tier_2',
        position: drone.position
          ? { lat: drone.position.lat, lon: drone.position.lng, alt_m: drone.position.alt ?? 0 }
          : null,
        battery: drone.batteryPercent / 100,
        batteryDrainRate: prevDrone?.batteryDrainRate ?? 0,
        perchState: drone.perchState,
        status: drone.status ?? 'active',
        zoneId: drone.targetZoneId ?? null,
        perchPointId: drone.targetPerchPointId ?? null,
        lastUpdate: new Date().toISOString(),
      });

      if (prevDrone && prevDrone.perchState !== drone.perchState) {
        this.classifyAndSubmit('drone_state_change', {
          droneId: drone.id,
          callsign: drone.callsign,
          fromState: prevDrone.perchState,
          toState: drone.perchState,
        });
      }

      const normalizedBattery = drone.batteryPercent / 100;
      if (normalizedBattery <= 0.1 && (!prevDrone || prevDrone.battery > 0.1)) {
        this.classifyAndSubmit('battery_update', {
          droneId: drone.id,
          callsign: drone.callsign,
          battery: normalizedBattery,
        });
      }
    }

    if (data.principal) {
      const p = data.principal;
      this.situationModel.updatePrincipal({
        id: 'principal',
        currentZoneId: p.currentZoneId ?? null,
        position: p.lastKnownPosition ? { lat: p.lastKnownPosition.lat, lon: p.lastKnownPosition.lng } : null,
        speed: p.speed ?? 0,
        heading: p.heading ?? 0,
        lastUpdate: new Date().toISOString(),
      });

      if (p.currentZoneId && p.currentZoneId !== this.lastPrincipalZone) {
        this.classifyAndSubmit('principal_zone_change', {
          fromZone: this.lastPrincipalZone ?? 'unknown',
          toZone: p.currentZoneId,
          toZoneId: p.currentZoneId,
        });
        this.lastPrincipalZone = p.currentZoneId ?? null;
      }
    }

    if (data.venue?.zones) {
      for (const zone of data.venue.zones) {
        const dronesInZone = data.drones.filter((d) => d.targetZoneId === zone.id).map((d) => d.id);
        const coverage = dronesInZone.length > 0 ? Math.min(1, dronesInZone.length / (zone.perchPoints?.length || 4)) : 0;

        this.situationModel.updateZone({
          id: zone.id,
          name: zone.name,
          coverage,
          activeDrones: dronesInZone,
          threatLevel: (zone.threatLevel ?? 'green') as 'green' | 'amber' | 'red' | 'critical',
        });
      }
    }
  }

  private classifyAndSubmit(eventType: string, payload: Record<string, unknown>): void {
    const classified = this.eventClassifier.classify(eventType, payload);
    const priority = this.significanceToPriority(classified.significance);

    this.attentionManager.submit({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: classified.type.startsWith('principal') ? 'principal' : 'drone',
      priority,
      timestamp: Date.now(),
      type: classified.type,
      payload: classified,
      requiresLlm: classified.requiresLlm,
      zoneId: classified.zoneId,
      droneId: classified.droneId,
    });
  }

  // ── Operator interface ──

  async processUtterance(text: string, forcedMode?: OrchestratorMode, isVoice = false): Promise<ChatMessage> {
    const operatorMsg = this.addMessage('operator', text);
    operatorMsg.voice = isVoice;
    this.sendToRenderer('orchestrator-message', operatorMsg);

    const mode = forcedMode ?? (this.manualModeOverride ? this.currentMode : this.detectMode(text));
    if (mode !== this.currentMode) {
      this.currentMode = mode;
      this.sendToRenderer('orchestrator-mode', mode);
    }
    this.manualModeOverride = false;

    this.addCognitiveEvent('operator', 'operator_utterance', text, 'notable');

    if (!this.deps.llm.isReady()) {
      return this.addOrchestratorMessage('agent', 'Orchestrator LLM is not available. Please ensure Ollama is running.');
    }

    return this.processAgentMode(text);
  }

  async respondToActionCard(
    cardId: string,
    action: 'approve' | 'reject' | 'cancel',
  ): Promise<ChatMessage> {
    const result = await this.actionExecutor.respondToCard(cardId, action === 'cancel' ? 'cancel' : action);
    if (result.success && action === 'approve') {
      return this.addOrchestratorMessage('agent', `Approved. ${result.message}`);
    }
    if (action === 'reject') return this.addOrchestratorMessage('agent', 'Action rejected.');
    return this.addOrchestratorMessage('agent', result.message);
  }

  setMode(mode: OrchestratorMode): void {
    this.currentMode = mode;
    this.manualModeOverride = true;
    this.sendToRenderer('orchestrator-mode', mode);
  }

  getMode(): OrchestratorMode {
    return this.currentMode;
  }

  getTranscript(): ChatMessage[] {
    return [...this.transcript];
  }

  getSituationSnapshot(): unknown {
    return this.situationModel.getSnapshot();
  }

  // ── Attention item processing ──

  private async processAttentionItem(item: AttentionItem): Promise<void> {
    try {
      switch (item.type) {
        case 'strategic_reflection':
          await this.processStrategicReflection();
          break;
        case 'drone_state_change':
        case 'perch_failure': {
          const classified = item.payload as ClassifiedEvent;
          this.addCognitiveEvent('drone', classified.type, classified.summary, classified.significance as CognitiveEvent['significance'], classified.zoneId, classified.droneId);
          if (classified.significance === 'significant' || classified.significance === 'critical') {
            if (classified.requiresLlm && this.deps.llm.isReady()) {
              const assessment = await this.reasoner.assessSituation(classified.summary);
              this.addOrchestratorMessage('agent', assessment.response);
            } else {
              this.addOrchestratorMessage('agent', classified.summary);
            }
          }
          break;
        }
        case 'principal_zone_change': {
          const classified = item.payload as ClassifiedEvent;
          this.addCognitiveEvent('principal', classified.type, classified.summary, 'significant', classified.zoneId);
          if (this.deps.llm.isReady()) {
            const assessment = await this.reasoner.assessSituation(classified.summary);
            this.addOrchestratorMessage('agent', assessment.response);
          } else {
            this.addOrchestratorMessage('agent', classified.summary);
          }
          break;
        }
        case 'coverage_gap': {
          const classified = item.payload as ClassifiedEvent;
          this.addCognitiveEvent('system', 'coverage_gap', classified.summary, classified.significance as CognitiveEvent['significance'], classified.zoneId);
          this.addOrchestratorMessage('agent', classified.summary);
          break;
        }
        case 'battery_critical':
        case 'battery_warning': {
          const classified = item.payload as ClassifiedEvent;
          this.addCognitiveEvent('drone', classified.type, classified.summary, classified.significance as CognitiveEvent['significance'], undefined, classified.droneId);
          this.addOrchestratorMessage('agent', classified.summary);
          break;
        }
        case 'alert_trigger': {
          const classified = item.payload as ClassifiedEvent;
          this.addCognitiveEvent('system', 'alert', classified.summary, classified.significance as CognitiveEvent['significance'], classified.zoneId, classified.droneId);
          this.situationModel.addAlert({
            id: `alert-${Date.now()}`,
            timestamp: new Date().toISOString(),
            severity: classified.significance === 'critical' ? 'critical' : 'warning',
            title: classified.summary.slice(0, 60),
            message: classified.summary,
            source: 'alert_trigger',
            resolved: false,
            zoneId: classified.zoneId,
            droneId: classified.droneId,
          });
          this.addOrchestratorMessage('agent', classified.summary);
          break;
        }
      }
    } catch (err) {
      console.error(`[Orchestrator] Error processing ${item.type}:`, err);
    }
  }

  // ── Agent mode pipeline ──

  private async processAgentMode(utterance: string): Promise<ChatMessage> {
    let result: ReasoningResult;
    try {
      result = await this.reasoner.parseOperatorIntent(utterance);
    } catch (err) {
      console.error('[Orchestrator] Agent mode failed:', err);
      return this.addOrchestratorMessage('agent', 'Unable to process that command right now.');
    }

    const parsed = result.structuredData;
    if (!parsed) {
      return this.addOrchestratorMessage('agent',
        'Unable to parse that. Try "What\'s the coverage?" or "Set threat level to amber".');
    }

    const intentClass = (parsed.intent_class as string) ?? 'unknown';

    if (intentClass === 'query') {
      const answer = await this.reasoner.answerOperatorQuery(utterance);
      return this.addOrchestratorMessage('agent', answer.response, intentClass as IntentClass);
    }

    const commandType = (parsed.command as string) ?? 'unknown';
    const request: ActionRequest = {
      id: `cmd-${Date.now()}`,
      type: commandType,
      tier: this.actionExecutor.getTierForAction(commandType),
      description: utterance,
      parameters: (parsed.parameters as Record<string, unknown>) ?? {},
      zoneId: parsed.target_zone as string | undefined,
      droneId: parsed.target_drone as string | undefined,
    };

    const actionResult = await this.actionExecutor.execute(request);

    if (actionResult.tier === 'auto') {
      const confirmation = await this.reasoner.generateConfirmation(commandType, utterance);
      return this.addOrchestratorMessage('agent', confirmation, intentClass as IntentClass);
    }

    return this.addOrchestratorMessage('agent', actionResult.message, intentClass as IntentClass);
  }

  // ── Strategic reflection ──

  private async processStrategicReflection(): Promise<void> {
    if (!this.running) return;

    const insights = this.proactiveAnalyzer.analyze();
    const noteworthy = insights.filter((i) => i.severity !== 'info');

    for (const insight of noteworthy) {
      const msg = this.addOrchestratorMessage('agent', insight.message);
      msg.significance = insight.severity;
    }

    if (this.deps.llm.isReady()) {
      try {
        const data = this.proactiveAnalyzer.buildAnalysisDataForLlm();
        if (data.length > 50) {
          const strategic = await this.reasoner.generateStrategicInsight(data);
          const parsed = strategic.structuredData as { insights?: ProactiveInsight[] } | null;
          if (parsed?.insights) {
            for (const insight of parsed.insights) {
              if (insight.severity !== 'info' && insight.message) {
                this.addOrchestratorMessage('agent', insight.message);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Orchestrator] Strategic analysis skipped:', err);
      }
    }
  }

  // ── Mode detection ──

  private detectMode(utterance: string): OrchestratorMode {
    const planPatterns = [
      /^(plan|set up|prepare|configure)\b/i,
      /\b(coverage plan|deployment plan|perimeter)\b.*\b(for|around)\b/i,
    ];
    return planPatterns.some((p) => p.test(utterance.trim())) ? 'plan' : 'agent';
  }

  // ── Persistence ──

  private restoreState(): boolean {
    if (this.situationModel.shouldContinueSession()) {
      const ok = this.situationModel.restore();
      if (ok) {
        this.sessionId = this.situationModel.sessionId;
        console.log(`[Orchestrator] Restored session ${this.sessionId.slice(0, 8)}`);
        this.loadTranscript();
        return true;
      }
    }
    return false;
  }

  private loadTranscript(): void {
    try {
      const rows = this.db
        .prepare('SELECT * FROM orchestrator_transcript WHERE session_id = ? ORDER BY timestamp ASC LIMIT 200')
        .all(this.sessionId) as Array<Record<string, unknown>>;

      this.transcript = rows.map((r) => ({
        id: r.id as string,
        timestamp: r.timestamp as string,
        source: r.source as 'operator' | 'orchestrator',
        mode: 'agent' as OrchestratorMode,
        content: r.content as string,
        intentClass: (r.intent_class as IntentClass) || undefined,
        significance: r.significance as string | undefined,
        voice: !!(r.voice as number),
      }));
      this.msgCounter = this.transcript.length;
    } catch {
      this.transcript = [];
    }
  }

  private persistTranscript(): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO orchestrator_transcript
        (id, session_id, timestamp, source, content, intent_class, significance, voice)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((messages: ChatMessage[]) => {
      for (const m of messages) {
        insert.run(m.id, this.sessionId, m.timestamp, m.source, m.content, m.intentClass ?? null, m.significance ?? null, m.voice ? 1 : 0);
      }
    });

    try {
      insertMany(this.transcript);
    } catch (err) {
      console.error('[Orchestrator] Failed to persist transcript:', err);
    }
  }

  private onHousekeeping(): void {
    this.situationModel.persist();
    this.persistTranscript();
    const expired = this.situationModel.getExpiredDecisions(new Date().toISOString());
    for (const d of expired) this.situationModel.resolveDecision(d.id);
  }

  private onActionExecuted(data: { request: ActionRequest; result: unknown; timestamp: string }): void {
    this.addCognitiveEvent('system', 'action_executed', `${data.request.type}: ${data.request.description}`, 'routine');
  }

  // ── Helpers ──

  private addMessage(source: 'operator' | 'orchestrator', content: string, intentClass?: IntentClass): ChatMessage {
    const msg: ChatMessage = {
      id: `msg-${++this.msgCounter}`,
      timestamp: new Date().toISOString(),
      source,
      mode: this.currentMode,
      content,
      intentClass,
    };
    this.transcript.push(msg);
    return msg;
  }

  private addOrchestratorMessage(mode: OrchestratorMode, content: string, intentClass?: IntentClass): ChatMessage {
    const msg = this.addMessage('orchestrator', content, intentClass);
    msg.mode = mode;
    this.sendToRenderer('orchestrator-message', msg);
    return msg;
  }

  private addCognitiveEvent(
    source: CognitiveEvent['source'],
    type: string,
    summary: string,
    significance: CognitiveEvent['significance'],
    zoneId?: string,
    droneId?: string,
  ): void {
    this.situationModel.addEvent({
      id: `ce-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      source,
      type,
      summary,
      significance,
      zoneId,
      droneId,
      resolved: false,
    });
  }

  private significanceToPriority(s: string): 0 | 1 | 2 | 3 {
    switch (s) {
      case 'critical': return 0;
      case 'significant': return 1;
      case 'notable': return 2;
      default: return 3;
    }
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
