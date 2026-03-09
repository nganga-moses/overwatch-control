import type { SituationModel, PrincipalSnapshot, ZoneSnapshot } from './situation-model';

/**
 * Principal Tracker — monitors the principal's location, predicts movement,
 * and triggers zone-change events for the leapfrog planner.
 *
 * In production, fuses BLE beacon, drone camera ReID, and GPS signals.
 * In simulation, consumes the SimPrincipal data directly.
 */

export interface PrincipalState {
  currentZoneId: string | null;
  previousZoneId: string | null;
  predictedNextZoneId: string | null;
  position: { lat: number; lon: number } | null;
  speed: number;
  heading: number;
  dwellTimeMs: number;
  lastZoneChangeAt: number;
  confidence: number;
}

export interface ZoneTransition {
  fromZoneId: string | null;
  toZoneId: string;
  timestamp: number;
  speed: number;
  heading: number;
}

export interface MovementPrediction {
  nextZoneId: string | null;
  eta_s: number | null;
  confidence: number;
}

export class PrincipalTracker {
  private situationModel: SituationModel;
  private state: PrincipalState;
  private transitions: ZoneTransition[] = [];
  private zoneGraph: Map<string, string[]> = new Map();
  private onTransition: ((t: ZoneTransition) => void) | null = null;

  constructor(situationModel: SituationModel) {
    this.situationModel = situationModel;
    this.state = {
      currentZoneId: null,
      previousZoneId: null,
      predictedNextZoneId: null,
      position: null,
      speed: 0,
      heading: 0,
      dwellTimeMs: 0,
      lastZoneChangeAt: Date.now(),
      confidence: 0,
    };
  }

  setSituationModel(model: SituationModel): void {
    this.situationModel = model;
  }

  setTransitionCallback(cb: (t: ZoneTransition) => void): void {
    this.onTransition = cb;
  }

  /**
   * Build zone adjacency graph from venue data for movement prediction.
   */
  setZoneConnections(connections: Array<{ from: string; to: string }>): void {
    this.zoneGraph.clear();
    for (const c of connections) {
      if (!this.zoneGraph.has(c.from)) this.zoneGraph.set(c.from, []);
      this.zoneGraph.get(c.from)!.push(c.to);
      if (!this.zoneGraph.has(c.to)) this.zoneGraph.set(c.to, []);
      this.zoneGraph.get(c.to)!.push(c.from);
    }
  }

  /**
   * Update from simulation data or real sensor fusion.
   */
  update(data: {
    zoneId: string | null;
    position?: { lat: number; lon: number };
    speed?: number;
    heading?: number;
  }): void {
    const now = Date.now();

    if (data.position) this.state.position = data.position;
    if (data.speed !== undefined) this.state.speed = data.speed;
    if (data.heading !== undefined) this.state.heading = data.heading;
    this.state.confidence = 0.9;

    if (data.zoneId && data.zoneId !== this.state.currentZoneId) {
      const transition: ZoneTransition = {
        fromZoneId: this.state.currentZoneId,
        toZoneId: data.zoneId,
        timestamp: now,
        speed: this.state.speed,
        heading: this.state.heading,
      };

      this.state.previousZoneId = this.state.currentZoneId;
      this.state.currentZoneId = data.zoneId;
      this.state.lastZoneChangeAt = now;
      this.state.dwellTimeMs = 0;

      this.transitions.push(transition);
      if (this.transitions.length > 50) this.transitions.shift();

      this.state.predictedNextZoneId = this.predictNextZone();
      this.onTransition?.(transition);
    } else {
      this.state.dwellTimeMs = now - this.state.lastZoneChangeAt;
    }
  }

  getState(): PrincipalState {
    return { ...this.state };
  }

  getRecentTransitions(count = 10): ZoneTransition[] {
    return this.transitions.slice(-count);
  }

  getMovementPrediction(): MovementPrediction {
    const nextZone = this.state.predictedNextZoneId;
    if (!nextZone) return { nextZoneId: null, eta_s: null, confidence: 0 };

    const avgDwell = this.computeAverageDwellTime();
    const elapsed = this.state.dwellTimeMs / 1000;
    const eta = Math.max(0, avgDwell - elapsed);

    return { nextZoneId: nextZone, eta_s: eta, confidence: 0.6 };
  }

  /**
   * Predict next zone based on transition history and zone adjacency.
   */
  private predictNextZone(): string | null {
    if (!this.state.currentZoneId) return null;

    const neighbors = this.zoneGraph.get(this.state.currentZoneId) ?? [];
    if (neighbors.length === 0) return null;

    const historyCounts = new Map<string, number>();
    for (const t of this.transitions) {
      if (t.fromZoneId === this.state.currentZoneId) {
        historyCounts.set(t.toZoneId, (historyCounts.get(t.toZoneId) ?? 0) + 1);
      }
    }

    let best: string | null = null;
    let bestCount = 0;
    for (const n of neighbors) {
      const count = historyCounts.get(n) ?? 0;
      if (count > bestCount) {
        bestCount = count;
        best = n;
      }
    }

    return best ?? neighbors[0];
  }

  private computeAverageDwellTime(): number {
    if (this.transitions.length < 2) return 60;
    let totalDwell = 0;
    let count = 0;
    for (let i = 1; i < this.transitions.length; i++) {
      const dwell = (this.transitions[i].timestamp - this.transitions[i - 1].timestamp) / 1000;
      if (dwell > 0 && dwell < 600) {
        totalDwell += dwell;
        count++;
      }
    }
    return count > 0 ? totalDwell / count : 60;
  }
}
