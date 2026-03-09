import type { SituationModel, Alert, DroneSnapshot } from './situation-model';

/**
 * Alert Engine for Overwatch — generates, classifies, correlates, and
 * escalates alerts from drone detections, coverage gaps, and threat changes.
 *
 * In simulation mode, synthesizes realistic alert patterns:
 * - Perimeter breach detections (T2 outdoor drones)
 * - Unrecognized person in restricted zone (T1 indoor drones)
 * - Loitering detection (person lingering near principal)
 * - Coverage gap alerts
 * - Drone fault escalations
 */

export type AlertCategory = 'detection' | 'coverage' | 'system' | 'threat' | 'principal';

export interface AlertConfig {
  correlationWindowMs: number;
  escalationThresholds: {
    detectionCount: number;
    coverageGapDurationS: number;
    faultChainLength: number;
  };
}

interface ActiveCorrelation {
  id: string;
  alertIds: string[];
  zoneId: string;
  category: AlertCategory;
  firstSeen: number;
  lastSeen: number;
  count: number;
  escalated: boolean;
}

const DEFAULT_CONFIG: AlertConfig = {
  correlationWindowMs: 30_000,
  escalationThresholds: {
    detectionCount: 3,
    coverageGapDurationS: 60,
    faultChainLength: 2,
  },
};

const SIM_ALERT_TEMPLATES = [
  { category: 'detection' as AlertCategory, severity: 'warning' as const, title: 'Unrecognized individual', message: 'Unrecognized individual detected in {zone} by {drone}. Confidence: {confidence}%.' },
  { category: 'detection' as AlertCategory, severity: 'warning' as const, title: 'Loitering detected', message: 'Person loitering near principal\'s position in {zone}. Duration: {duration}s.' },
  { category: 'detection' as AlertCategory, severity: 'critical' as const, title: 'Perimeter breach', message: 'Perimeter breach detected at {zone} by {drone}. Unauthorized entry.' },
  { category: 'detection' as AlertCategory, severity: 'info' as const, title: 'Vehicle approach', message: 'Vehicle approaching venue from {zone}. Speed: {speed} km/h.' },
  { category: 'threat' as AlertCategory, severity: 'warning' as const, title: 'Unusual movement', message: 'Unusual movement pattern detected in {zone}. Multiple individuals converging.' },
];

export class AlertEngine {
  private situationModel: SituationModel;
  private config: AlertConfig;
  private correlations = new Map<string, ActiveCorrelation>();
  private simTickCount = 0;
  private lastSimAlert = 0;

  constructor(situationModel: SituationModel, config: Partial<AlertConfig> = {}) {
    this.situationModel = situationModel;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setSituationModel(model: SituationModel): void {
    this.situationModel = model;
  }

  /**
   * Process a raw detection from a drone and create/correlate an alert.
   */
  ingestDetection(detection: {
    droneId: string;
    droneTier: 'tier_1' | 'tier_2';
    zoneId: string;
    type: string;
    confidence: number;
    data?: Record<string, unknown>;
  }): Alert | null {
    const drone = this.situationModel.getDrone(detection.droneId);
    if (!drone) return null;

    const severity = detection.confidence > 0.8 ? 'critical' : detection.confidence > 0.5 ? 'warning' : 'info';

    const alert: Alert = {
      id: `alert-det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      severity,
      title: detection.type,
      message: `${detection.type} detected by ${drone.callsign} in zone. Confidence: ${Math.round(detection.confidence * 100)}%.`,
      source: `drone:${drone.callsign}`,
      resolved: false,
      zoneId: detection.zoneId,
      droneId: detection.droneId,
      confidence: detection.confidence,
    };

    this.situationModel.addAlert(alert);
    this.correlate(alert, 'detection');
    return alert;
  }

  /**
   * Generate synthetic alerts during simulation for testing the UI.
   */
  simulationTick(): Alert | null {
    this.simTickCount++;

    const interval = 80 + Math.floor(Math.random() * 120);
    if (this.simTickCount - this.lastSimAlert < interval) return null;

    if (!this.situationModel.isMissionActive()) return null;

    const drones = this.situationModel.getAllDrones();
    const zones = this.situationModel.getAllZones();
    if (drones.length === 0 || zones.length === 0) return null;

    const template = SIM_ALERT_TEMPLATES[Math.floor(Math.random() * SIM_ALERT_TEMPLATES.length)];
    const drone = drones[Math.floor(Math.random() * drones.length)];
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const confidence = 50 + Math.floor(Math.random() * 45);

    const message = template.message
      .replace('{zone}', zone.name)
      .replace('{drone}', drone.callsign)
      .replace('{confidence}', String(confidence))
      .replace('{duration}', String(30 + Math.floor(Math.random() * 120)))
      .replace('{speed}', String(20 + Math.floor(Math.random() * 60)));

    const alert: Alert = {
      id: `alert-sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      severity: template.severity,
      title: template.title,
      message,
      source: `sim:${drone.callsign}`,
      resolved: false,
      zoneId: zone.id,
      droneId: drone.id,
      confidence: confidence / 100,
    };

    this.situationModel.addAlert(alert);
    this.lastSimAlert = this.simTickCount;
    return alert;
  }

  /**
   * Correlate an alert with existing active correlations.
   * If a threshold is exceeded, escalate.
   */
  private correlate(alert: Alert, category: AlertCategory): void {
    const zoneId = alert.zoneId ?? 'global';
    const key = `${category}:${zoneId}`;
    const now = Date.now();

    let corr = this.correlations.get(key);
    if (corr && now - corr.lastSeen > this.config.correlationWindowMs) {
      this.correlations.delete(key);
      corr = undefined;
    }

    if (!corr) {
      corr = {
        id: `corr-${Date.now()}`,
        alertIds: [alert.id],
        zoneId,
        category,
        firstSeen: now,
        lastSeen: now,
        count: 1,
        escalated: false,
      };
      this.correlations.set(key, corr);
      return;
    }

    corr.alertIds.push(alert.id);
    corr.lastSeen = now;
    corr.count++;

    if (!corr.escalated && corr.count >= this.config.escalationThresholds.detectionCount) {
      corr.escalated = true;
      const escalationAlert: Alert = {
        id: `alert-esc-${Date.now()}`,
        timestamp: new Date().toISOString(),
        severity: 'critical',
        title: `ESCALATION: ${corr.count} ${category} alerts in ${zoneId}`,
        message: `${corr.count} correlated ${category} alerts in ${zoneId} within ${Math.round(this.config.correlationWindowMs / 1000)}s. Possible coordinated activity.`,
        source: 'alert_engine:correlation',
        resolved: false,
        zoneId: zoneId === 'global' ? undefined : zoneId,
      };
      this.situationModel.addAlert(escalationAlert);
    }
  }

  /**
   * Operator validates or dismisses an alert — feeds back into confidence.
   */
  operatorFeedback(alertId: string, validated: boolean): void {
    if (validated) return;
    this.situationModel.resolveAlert(alertId);
  }

  pruneStaleCorrelations(): void {
    const now = Date.now();
    for (const [key, corr] of this.correlations) {
      if (now - corr.lastSeen > this.config.correlationWindowMs * 2) {
        this.correlations.delete(key);
      }
    }
  }
}
