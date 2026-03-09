import type { LLMManager, GenerateOptions } from '../../sidecar/llm-manager';
import type { SituationModel } from './situation-model';
import type { Database as DatabaseType } from 'better-sqlite3';

export interface ReasoningResult {
  response: string;
  confidence: number;
  intentClass?: string;
  structuredData?: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You are the Orchestrator — the cognitive agent of Overwatch, a protective security drone system.

You reason about the operational situation: principal location and movement, drone coverage, zone security, and threats. Your job is to ensure the principal remains protected at all times through optimal drone positioning and threat awareness.

Key concepts:
- T1 (Tier 1) drones: indoor perching drones that attach to walls/ceilings for persistent coverage
- T2 (Tier 2) drones: outdoor perching drones for perimeter and overwatch
- Leapfrog: drones reposition ahead of the principal's predicted path
- Perch points: pre-surveyed attachment locations for drones
- Zones: defined areas within the venue with threat levels
- Coverage: percentage of a zone under drone surveillance

Your responses must be:
- Concise and operational (no filler)
- Protection-focused (always prioritize principal safety)
- Actionable (recommend specific drone movements when relevant)
- Honest about uncertainty`;

const INTENT_PARSE_PROMPT = `Parse the operator's command for a protective security drone system.

Current situation:
{situation}

Command types: hold_all, resume_all, recall_all, relocate_drone, set_threat_level, query_status, query_coverage, query_principal, reposition_coverage, emergency_lockdown, clear_zone, boost_zone_coverage

Respond with JSON:
{
  "intent_class": "command" | "query" | "adjustment",
  "command": "<command_type>",
  "target_zone": "<zone name if applicable>",
  "target_drone": "<drone callsign if applicable>",
  "parameters": {},
  "confidence": <0.0-1.0>
}

Operator: {utterance}`;

const SITUATION_ASSESSMENT_PROMPT = `Assess this protection operation event.

Current situation:
{situation}

Event: {event}

Respond with JSON:
{
  "assessment": "<1-3 sentence operational assessment>",
  "threat_impact": "none" | "low" | "moderate" | "high",
  "recommended_action": "<specific protection action or null>",
  "urgency": "routine" | "prompt" | "immediate"
}`;

const OPERATOR_RESPONSE_PROMPT = `Answer the operator's question about the protection operation.

Current situation:
{situation}

Operator: {question}

Respond concisely with operational data — drone positions, battery levels, coverage percentages, zone threat levels, principal location.`;

export class GroundedReasoner {
  private llm: LLMManager;
  private situationModel: SituationModel;
  private db: DatabaseType | null;

  constructor(llm: LLMManager, situationModel: SituationModel, db?: DatabaseType) {
    this.llm = llm;
    this.situationModel = situationModel;
    this.db = db ?? null;
  }

  setSituationModel(model: SituationModel): void {
    this.situationModel = model;
  }

  async parseOperatorIntent(utterance: string): Promise<ReasoningResult> {
    const situation = this.buildSituationSummary();
    const prompt = INTENT_PARSE_PROMPT
      .replace('{situation}', situation)
      .replace('{utterance}', utterance);

    try {
      const raw = await this.llm.generate(prompt, {
        system: SYSTEM_PROMPT,
        temperature: 0.1,
        max_tokens: 400,
        format: 'json',
      });

      const parsed = this.safeParseJson(raw);
      return {
        response: raw,
        confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : 0.5,
        intentClass: typeof parsed?.intent_class === 'string' ? parsed.intent_class : undefined,
        structuredData: parsed ?? undefined,
      };
    } catch (err) {
      console.error('[GroundedReasoner] Intent parse failed:', err);
      return { response: '{}', confidence: 0, intentClass: 'unknown' };
    }
  }

  async answerOperatorQuery(question: string): Promise<ReasoningResult> {
    const situation = this.buildSituationSummary();
    const prompt = OPERATOR_RESPONSE_PROMPT
      .replace('{situation}', situation)
      .replace('{question}', question);

    try {
      const response = await this.llm.generate(prompt, {
        system: SYSTEM_PROMPT,
        temperature: 0.3,
        max_tokens: 500,
      });
      return { response: response.trim(), confidence: 0.7 };
    } catch {
      return { response: 'Unable to answer — LLM is unavailable.', confidence: 0 };
    }
  }

  async assessSituation(event: string): Promise<ReasoningResult> {
    const situation = this.buildSituationSummary();
    const prompt = SITUATION_ASSESSMENT_PROMPT
      .replace('{situation}', situation)
      .replace('{event}', event);

    try {
      const raw = await this.llm.generate(prompt, {
        system: SYSTEM_PROMPT,
        temperature: 0.2,
        max_tokens: 600,
        format: 'json',
      });
      const parsed = this.safeParseJson(raw);
      return {
        response: typeof parsed?.assessment === 'string' ? parsed.assessment : raw,
        confidence: 0.7,
        structuredData: parsed ?? undefined,
      };
    } catch {
      return { response: 'Unable to assess — LLM unavailable.', confidence: 0 };
    }
  }

  async generateConfirmation(action: string, context: string): Promise<string> {
    const prompt = `Confirm this protective security action concisely and professionally. Under 2 sentences.\n\nAction: ${action}\nContext: ${context}`;
    try {
      const r = await this.llm.generate(prompt, {
        system: SYSTEM_PROMPT,
        temperature: 0.3,
        max_tokens: 100,
      });
      return r.trim();
    } catch {
      return `${action.replace(/_/g, ' ')} executed.`;
    }
  }

  async generateStrategicInsight(analysisData: string): Promise<ReasoningResult> {
    const situation = this.buildSituationSummary();
    const prompt = `Analyze the protection operation and provide proactive insights.

Current situation:
${situation}

Analysis data:
${analysisData}

Respond with JSON:
{
  "insights": [
    {
      "category": "battery" | "coverage" | "weather" | "threat" | "principal",
      "message": "<proactive message>",
      "severity": "info" | "warning" | "critical",
      "recommended_action": "<specific action or null>"
    }
  ]
}`;

    try {
      const raw = await this.llm.generate(prompt, {
        system: SYSTEM_PROMPT,
        temperature: 0.3,
        max_tokens: 800,
        format: 'json',
      });
      const parsed = this.safeParseJson(raw);
      return { response: raw, confidence: 0.6, structuredData: parsed ?? undefined };
    } catch {
      return { response: 'Strategic analysis unavailable.', confidence: 0 };
    }
  }

  private buildSituationSummary(): string {
    const summary = this.situationModel.getSummary();
    const drones = this.situationModel.getAllDrones();
    const zones = this.situationModel.getAllZones();
    const principal = this.situationModel.getPrincipal();
    const weather = this.situationModel.getWeather();
    const alerts = this.situationModel.getActiveAlerts();

    const lines: string[] = [
      `Threat level: ${summary.threatLevel.toUpperCase()}`,
      `Fleet: ${summary.droneCount} drones (${summary.t1Count} T1 indoor, ${summary.t2Count} T2 outdoor)`,
    ];

    if (principal) {
      lines.push(
        `Principal: zone ${principal.currentZoneId ?? 'unknown'}, speed ${principal.speed.toFixed(1)} m/s`,
      );
    }

    if (drones.length > 0) {
      const droneLines = drones.slice(0, 15).map(
        (d) =>
          `  ${d.callsign} (${d.tier}): ${d.perchState}, battery ${Math.round(d.battery * 100)}%` +
          (d.zoneId ? `, zone ${d.zoneId}` : ''),
      );
      lines.push(`Drones:\n${droneLines.join('\n')}`);
    }

    if (zones.length > 0) {
      const zoneLines = zones.map(
        (z) =>
          `  ${z.name}: coverage ${Math.round(z.coverage * 100)}%, threat ${z.threatLevel}, ${z.activeDrones.length} drones`,
      );
      lines.push(`Zones:\n${zoneLines.join('\n')}`);
    }

    lines.push(
      `Weather: wind ${weather.wind_speed_m_s} m/s, vis ${weather.visibility_m}m, ${weather.precipitation}`,
    );

    if (alerts.length > 0) {
      lines.push(`Active alerts: ${alerts.length} (${alerts.map((a) => a.severity).join(', ')})`);
    }

    const priorKnowledge = this.queryWorldModelObservations();
    if (priorKnowledge.length > 0) {
      lines.push(`Relevant prior knowledge:\n${priorKnowledge.map((o) => `  - ${o}`).join('\n')}`);
    }

    return lines.join('\n');
  }

  private queryWorldModelObservations(): string[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(
        `SELECT description FROM world_model_observations
         WHERE level IN ('pattern', 'principle')
         ORDER BY confidence DESC, timestamp DESC
         LIMIT 5`,
      ).all() as Array<{ description: string }>;
      return rows.map((r) => r.description);
    } catch {
      return [];
    }
  }

  private safeParseJson(raw: string): Record<string, unknown> | null {
    try {
      return JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { return null; }
      }
      return null;
    }
  }
}
