/**
 * Classifies simulation events for the protection-domain orchestrator.
 *
 * Unlike mission-control which classifies inbound swarm messages,
 * Overwatch classifies local simulation events: drone state changes,
 * principal movements, zone transitions, and alert triggers.
 */

export type Significance = 'routine' | 'notable' | 'significant' | 'critical';

export interface ClassifiedEvent {
  significance: Significance;
  type: string;
  summary: string;
  requiresLlm: boolean;
  zoneId?: string;
  droneId?: string;
  payload: unknown;
}

const BATTERY_WARNING = 0.2;
const BATTERY_CRITICAL = 0.1;

export class EventClassifier {
  classify(eventType: string, payload: Record<string, unknown>): ClassifiedEvent {
    switch (eventType) {
      case 'drone_state_change':
        return this.classifyDroneStateChange(payload);
      case 'principal_zone_change':
        return this.classifyPrincipalZoneChange(payload);
      case 'coverage_gap':
        return this.classifyCoverageGap(payload);
      case 'battery_update':
        return this.classifyBatteryUpdate(payload);
      case 'alert_trigger':
        return this.classifyAlertTrigger(payload);
      case 'perch_failure':
        return this.classifyPerchFailure(payload);
      case 'zone_threat_change':
        return this.classifyZoneThreatChange(payload);
      default:
        return {
          significance: 'routine',
          type: eventType,
          summary: `${eventType} event`,
          requiresLlm: false,
          payload,
        };
    }
  }

  private classifyDroneStateChange(payload: Record<string, unknown>): ClassifiedEvent {
    const callsign = (payload.callsign as string) ?? 'unknown';
    const fromState = payload.fromState as string;
    const toState = payload.toState as string;

    if (toState === 'fault' || toState === 'offline') {
      return {
        significance: 'significant',
        type: 'drone_state_change',
        summary: `${callsign} entered ${toState} state (was ${fromState})`,
        requiresLlm: true,
        droneId: payload.droneId as string,
        payload,
      };
    }

    return {
      significance: 'routine',
      type: 'drone_state_change',
      summary: `${callsign}: ${fromState} → ${toState}`,
      requiresLlm: false,
      droneId: payload.droneId as string,
      payload,
    };
  }

  private classifyPrincipalZoneChange(payload: Record<string, unknown>): ClassifiedEvent {
    const fromZone = (payload.fromZone as string) ?? 'unknown';
    const toZone = (payload.toZone as string) ?? 'unknown';

    return {
      significance: 'significant',
      type: 'principal_zone_change',
      summary: `Principal moved from ${fromZone} to ${toZone}`,
      requiresLlm: true,
      zoneId: payload.toZoneId as string,
      payload,
    };
  }

  private classifyCoverageGap(payload: Record<string, unknown>): ClassifiedEvent {
    const zone = (payload.zoneName as string) ?? 'zone';
    const coverage = (payload.coverage as number) ?? 0;

    return {
      significance: coverage < 0.3 ? 'critical' : 'significant',
      type: 'coverage_gap',
      summary: `Coverage gap in ${zone}: ${Math.round(coverage * 100)}%`,
      requiresLlm: coverage < 0.3,
      zoneId: payload.zoneId as string,
      payload,
    };
  }

  private classifyBatteryUpdate(payload: Record<string, unknown>): ClassifiedEvent {
    const callsign = (payload.callsign as string) ?? 'drone';
    const level = (payload.battery as number) ?? 1;

    if (level <= BATTERY_CRITICAL) {
      return {
        significance: 'critical',
        type: 'battery_critical',
        summary: `${callsign} battery CRITICAL at ${Math.round(level * 100)}%`,
        requiresLlm: false,
        droneId: payload.droneId as string,
        payload,
      };
    }
    if (level <= BATTERY_WARNING) {
      return {
        significance: 'notable',
        type: 'battery_warning',
        summary: `${callsign} battery low at ${Math.round(level * 100)}%`,
        requiresLlm: false,
        droneId: payload.droneId as string,
        payload,
      };
    }

    return {
      significance: 'routine',
      type: 'battery_update',
      summary: `${callsign} battery ${Math.round(level * 100)}%`,
      requiresLlm: false,
      droneId: payload.droneId as string,
      payload,
    };
  }

  private classifyAlertTrigger(payload: Record<string, unknown>): ClassifiedEvent {
    const severity = (payload.severity as string) ?? 'warning';
    const message = (payload.message as string) ?? 'Alert triggered';

    return {
      significance: severity === 'critical' ? 'critical' : 'significant',
      type: 'alert_trigger',
      summary: message,
      requiresLlm: severity === 'critical',
      zoneId: payload.zoneId as string,
      droneId: payload.droneId as string,
      payload,
    };
  }

  private classifyPerchFailure(payload: Record<string, unknown>): ClassifiedEvent {
    const callsign = (payload.callsign as string) ?? 'drone';
    return {
      significance: 'significant',
      type: 'perch_failure',
      summary: `${callsign} failed to attach at perch point`,
      requiresLlm: true,
      droneId: payload.droneId as string,
      payload,
    };
  }

  private classifyZoneThreatChange(payload: Record<string, unknown>): ClassifiedEvent {
    const zone = (payload.zoneName as string) ?? 'zone';
    const level = (payload.threatLevel as string) ?? 'amber';

    const significance: Significance = level === 'critical' || level === 'red' ? 'critical' : 'notable';

    return {
      significance,
      type: 'zone_threat_change',
      summary: `Threat level in ${zone} changed to ${level.toUpperCase()}`,
      requiresLlm: significance === 'critical',
      zoneId: payload.zoneId as string,
      payload,
    };
  }
}
