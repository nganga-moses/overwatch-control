import type { SituationModel, DroneSnapshot, ZoneSnapshot } from './situation-model';
import type { PrincipalTracker, MovementPrediction } from './principal-tracker';

/**
 * Leapfrog Planner — positions drones ahead of the principal's path
 * to maintain continuous coverage as they move through the venue.
 *
 * Core concept: when the principal is predicted to move to zone B,
 * pre-stage drones at perch points in zone B before they arrive.
 * Meanwhile, drones in the current zone provide active coverage.
 *
 * Two tiers operate differently:
 * - T1 (indoor): short-range, fast reposition, perch on walls/ceilings
 * - T2 (outdoor): longer-range, perimeter overwatch, perch on external surfaces
 */

export interface RepositionCommand {
  droneId: string;
  targetZoneId: string;
  targetPerchPointId?: string;
  reason: string;
  priority: 'normal' | 'high' | 'immediate';
}

export interface CoveragePlan {
  zoneId: string;
  requiredDrones: number;
  assignedDrones: string[];
  coverage: number;
  deficit: number;
}

export interface LeapfrogConfig {
  minCoverageRatio: number;
  preStageAheadS: number;
  maxSimultaneousRepositions: number;
  t1PerZone: number;
  t2PerZone: number;
}

const DEFAULT_CONFIG: LeapfrogConfig = {
  minCoverageRatio: 0.6,
  preStageAheadS: 30,
  maxSimultaneousRepositions: 3,
  t1PerZone: 2,
  t2PerZone: 1,
};

export class LeapfrogPlanner {
  private situationModel: SituationModel;
  private principalTracker: PrincipalTracker;
  private config: LeapfrogConfig;
  private pendingRepositions = new Map<string, RepositionCommand>();

  constructor(
    situationModel: SituationModel,
    principalTracker: PrincipalTracker,
    config: Partial<LeapfrogConfig> = {},
  ) {
    this.situationModel = situationModel;
    this.principalTracker = principalTracker;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setSituationModel(model: SituationModel): void {
    this.situationModel = model;
  }

  /**
   * Run a planning cycle: assess current coverage, predict principal movement,
   * and generate reposition commands to maintain optimal coverage.
   */
  plan(): RepositionCommand[] {
    const principal = this.principalTracker.getState();
    const prediction = this.principalTracker.getMovementPrediction();
    const allDrones = this.situationModel.getAllDrones();
    const zones = this.situationModel.getAllZones();

    if (!principal.currentZoneId || zones.length === 0) return [];

    const commands: RepositionCommand[] = [];

    const currentCoverage = this.assessCoverage(principal.currentZoneId, allDrones);
    if (currentCoverage.deficit > 0) {
      const fills = this.fillCoverageGap(currentCoverage, allDrones, 'high');
      commands.push(...fills);
    }

    if (prediction.nextZoneId && prediction.confidence > 0.4 && prediction.eta_s !== null && prediction.eta_s < this.config.preStageAheadS) {
      const nextCoverage = this.assessCoverage(prediction.nextZoneId, allDrones);
      if (nextCoverage.deficit > 0) {
        const prestage = this.fillCoverageGap(nextCoverage, allDrones, 'normal');
        for (const cmd of prestage) {
          cmd.reason = `Pre-staging for predicted principal movement to ${prediction.nextZoneId}`;
        }
        commands.push(...prestage);
      }
    }

    const activeCount = commands.filter((c) => c.priority === 'immediate' || c.priority === 'high').length;
    if (activeCount > this.config.maxSimultaneousRepositions) {
      return commands
        .sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority))
        .slice(0, this.config.maxSimultaneousRepositions);
    }

    return commands;
  }

  /**
   * Handle an emergency reposition when the principal enters
   * a zone with no coverage.
   */
  emergencyReposition(zoneId: string): RepositionCommand[] {
    const allDrones = this.situationModel.getAllDrones();
    const coverage = this.assessCoverage(zoneId, allDrones);

    if (coverage.assignedDrones.length > 0) return [];

    const available = allDrones
      .filter((d) => d.perchState !== 'fault' && d.status !== 'offline' && d.zoneId !== zoneId)
      .sort((a, b) => b.battery - a.battery);

    const commands: RepositionCommand[] = [];
    const needed = Math.max(this.config.t1PerZone, 1);

    for (let i = 0; i < Math.min(needed, available.length); i++) {
      commands.push({
        droneId: available[i].id,
        targetZoneId: zoneId,
        reason: `Emergency: principal entered ${zoneId} with zero coverage`,
        priority: 'immediate',
      });
    }

    return commands;
  }

  /**
   * Compute a coverage heat map showing which zones need more drones.
   */
  getCoverageHeatMap(): CoveragePlan[] {
    const zones = this.situationModel.getAllZones();
    const drones = this.situationModel.getAllDrones();
    return zones.map((z) => this.assessCoverage(z.id, drones));
  }

  private assessCoverage(zoneId: string, allDrones: DroneSnapshot[]): CoveragePlan {
    const zone = this.situationModel.getZone(zoneId);
    const assigned = allDrones.filter((d) => d.zoneId === zoneId && d.status !== 'offline' && d.perchState !== 'fault');
    const t1Count = assigned.filter((d) => d.tier === 'tier_1').length;
    const t2Count = assigned.filter((d) => d.tier === 'tier_2').length;

    const required = this.config.t1PerZone + this.config.t2PerZone;
    const total = t1Count + t2Count;
    const coverage = required > 0 ? Math.min(1, total / required) : 1;
    const deficit = Math.max(0, required - total);

    return {
      zoneId,
      requiredDrones: required,
      assignedDrones: assigned.map((d) => d.id),
      coverage,
      deficit,
    };
  }

  private fillCoverageGap(plan: CoveragePlan, allDrones: DroneSnapshot[], priority: RepositionCommand['priority']): RepositionCommand[] {
    const commands: RepositionCommand[] = [];
    const available = allDrones
      .filter((d) => d.zoneId !== plan.zoneId && d.perchState !== 'fault' && d.status !== 'offline' && d.battery > 0.15)
      .sort((a, b) => b.battery - a.battery);

    for (let i = 0; i < Math.min(plan.deficit, available.length); i++) {
      commands.push({
        droneId: available[i].id,
        targetZoneId: plan.zoneId,
        reason: `Coverage gap in ${plan.zoneId}: ${Math.round(plan.coverage * 100)}%`,
        priority,
      });
    }

    return commands;
  }

  private priorityWeight(p: RepositionCommand['priority']): number {
    return p === 'immediate' ? 3 : p === 'high' ? 2 : 1;
  }
}
