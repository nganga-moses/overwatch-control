import type { SituationModel, BatteryProjection, DroneSnapshot } from './situation-model';

export interface ProactiveInsight {
  category: 'battery' | 'coverage' | 'weather' | 'threat' | 'principal';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  recommendedAction?: string;
  zoneId?: string;
  droneId?: string;
}

const BATTERY_WARNING = 0.2;
const BATTERY_CRITICAL = 0.1;
const BATTERY_WARNING_MINUTES = 15;
const WIND_LIMIT_M_S = 15;
const WIND_WARNING_M_S = 12;
const COVERAGE_WARNING = 0.5;
const COVERAGE_CRITICAL = 0.3;

export class ProactiveAnalyzer {
  private situationModel: SituationModel;
  private tickCount = 0;
  private lastBatteryAlerts = new Map<string, number>();

  constructor(situationModel: SituationModel) {
    this.situationModel = situationModel;
  }

  setSituationModel(model: SituationModel): void {
    this.situationModel = model;
  }

  analyze(): ProactiveInsight[] {
    this.tickCount++;
    const insights: ProactiveInsight[] = [];

    insights.push(...this.analyzeBatteries());
    insights.push(...this.analyzeCoverage());
    insights.push(...this.analyzeWeather());
    insights.push(...this.analyzePrincipalExposure());

    for (const insight of insights) {
      if (insight.severity !== 'info') {
        this.situationModel.addAlert({
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          severity: insight.severity,
          title: `${insight.category}: ${insight.message.slice(0, 60)}`,
          message: insight.message,
          source: 'proactive_analyzer',
          resolved: false,
          zoneId: insight.zoneId,
          droneId: insight.droneId,
        });
      }
    }

    return insights;
  }

  buildAnalysisDataForLlm(): string {
    const lines: string[] = [];

    const projections = this.situationModel.getAllBatteryProjections();
    if (projections.length > 0) {
      lines.push('Battery projections:');
      for (const p of projections) {
        const drone = this.situationModel.getDrone(p.droneId);
        const cs = drone?.callsign ?? p.droneId.slice(0, 8);
        lines.push(
          `  ${cs}: ${Math.round(p.currentLevel * 100)}%, drain ${(p.drainRatePerMin * 100).toFixed(1)}%/min, ~${Math.round(p.estimatedMinutesRemaining)} min left`,
        );
      }
    }

    const zones = this.situationModel.getAllZones();
    if (zones.length > 0) {
      lines.push('Zone coverage:');
      for (const z of zones) {
        lines.push(`  ${z.name}: ${Math.round(z.coverage * 100)}%, threat ${z.threatLevel}, ${z.activeDrones.length} drones`);
      }
    }

    const principal = this.situationModel.getPrincipal();
    if (principal) {
      lines.push(`Principal: zone ${principal.currentZoneId ?? 'unknown'}, speed ${principal.speed.toFixed(1)} m/s`);
    }

    const weather = this.situationModel.getWeather();
    lines.push(`Weather: wind ${weather.wind_speed_m_s} m/s, gust ${weather.gust_speed_m_s} m/s, ${weather.precipitation}`);

    return lines.join('\n');
  }

  private analyzeBatteries(): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const drones = this.situationModel.getAllDrones();

    for (const drone of drones) {
      if (drone.battery <= 0) continue;

      const projection = this.computeProjection(drone);
      this.situationModel.updateBatteryProjection(projection);

      const lastTick = this.lastBatteryAlerts.get(drone.id) ?? 0;
      if (this.tickCount - lastTick < 3) continue;

      if (projection.currentLevel <= BATTERY_CRITICAL) {
        insights.push({
          category: 'battery',
          message: `${drone.callsign} battery CRITICAL at ${Math.round(projection.currentLevel * 100)}%. Immediate recall recommended.`,
          severity: 'critical',
          recommendedAction: `Recall ${drone.callsign}`,
          droneId: drone.id,
        });
        this.lastBatteryAlerts.set(drone.id, this.tickCount);
      } else if (projection.warningEtaMinutes !== null && projection.warningEtaMinutes <= BATTERY_WARNING_MINUTES) {
        insights.push({
          category: 'battery',
          message: `${drone.callsign} battery at ${Math.round(projection.currentLevel * 100)}%, reaching ${Math.round(BATTERY_WARNING * 100)}% in ~${Math.round(projection.warningEtaMinutes)} min.`,
          severity: 'warning',
          droneId: drone.id,
        });
        this.lastBatteryAlerts.set(drone.id, this.tickCount);
      }
    }

    return insights;
  }

  private computeProjection(drone: DroneSnapshot): BatteryProjection {
    const drainRate = drone.batteryDrainRate > 0 ? drone.batteryDrainRate : 0.003;
    const minutesRemaining = drainRate > 0 ? drone.battery / drainRate : Infinity;
    const minutesToWarning = drainRate > 0 ? (drone.battery - BATTERY_WARNING) / drainRate : null;

    return {
      droneId: drone.id,
      currentLevel: drone.battery,
      drainRatePerMin: drainRate,
      estimatedMinutesRemaining: isFinite(minutesRemaining) ? minutesRemaining : 999,
      warningEtaMinutes:
        minutesToWarning !== null && minutesToWarning > 0 && isFinite(minutesToWarning) ? minutesToWarning : null,
    };
  }

  private analyzeCoverage(): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const zones = this.situationModel.getAllZones();
    const principal = this.situationModel.getPrincipal();

    for (const zone of zones) {
      const isPrincipalZone = principal?.currentZoneId === zone.id;

      if (zone.coverage < COVERAGE_CRITICAL) {
        insights.push({
          category: 'coverage',
          message: `${zone.name} coverage critically low at ${Math.round(zone.coverage * 100)}%${isPrincipalZone ? ' — PRINCIPAL PRESENT' : ''}.`,
          severity: isPrincipalZone ? 'critical' : 'warning',
          recommendedAction: `Boost coverage in ${zone.name}`,
          zoneId: zone.id,
        });
      } else if (zone.coverage < COVERAGE_WARNING && isPrincipalZone) {
        insights.push({
          category: 'coverage',
          message: `${zone.name} coverage at ${Math.round(zone.coverage * 100)}% with principal present.`,
          severity: 'warning',
          zoneId: zone.id,
        });
      }
    }

    return insights;
  }

  private analyzeWeather(): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const weather = this.situationModel.getWeather();

    if (weather.wind_speed_m_s >= WIND_LIMIT_M_S || weather.gust_speed_m_s >= WIND_LIMIT_M_S) {
      insights.push({
        category: 'weather',
        message: `Wind at ${weather.wind_speed_m_s} m/s (gusts ${weather.gust_speed_m_s} m/s) exceeds T2 flight limits. Recommend recalling outdoor drones.`,
        severity: 'critical',
        recommendedAction: 'Recall T2 outdoor drones',
      });
    } else if (weather.wind_speed_m_s >= WIND_WARNING_M_S) {
      insights.push({
        category: 'weather',
        message: `Wind increasing to ${weather.wind_speed_m_s} m/s. Approaching T2 limits.`,
        severity: 'warning',
      });
    }

    return insights;
  }

  private analyzePrincipalExposure(): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const principal = this.situationModel.getPrincipal();
    if (!principal || !principal.currentZoneId) return insights;

    const zone = this.situationModel.getZone(principal.currentZoneId);
    if (!zone) return insights;

    if (zone.activeDrones.length === 0) {
      insights.push({
        category: 'principal',
        message: `Principal is in ${zone.name} with NO drone coverage. Immediate repositioning needed.`,
        severity: 'critical',
        recommendedAction: `Deploy drones to ${zone.name}`,
        zoneId: zone.id,
      });
    }

    if (zone.threatLevel === 'red' || zone.threatLevel === 'critical') {
      insights.push({
        category: 'threat',
        message: `Principal is in ${zone.name} which has ${zone.threatLevel.toUpperCase()} threat level.`,
        severity: 'critical',
        zoneId: zone.id,
      });
    }

    return insights;
  }
}
