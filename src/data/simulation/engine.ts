import { createDefaultVenue, type SimVenue } from './venue-sim';
import { createSimDrones, tickDrone, type SimDrone } from './drone-sim';
import { createSimPrincipal, tickPrincipal, type SimPrincipal } from './principal-sim';
import type { Kit } from '@/shared/types';

const SIM_KIT_ID = 'sim-kit-charlie';

function createSimKit(): Kit {
  const now = new Date().toISOString();
  return {
    id: SIM_KIT_ID,
    name: 'Charlie-1',
    type: 'charlie',
    status: 'deployed',
    serial: 'SIM-CK-001',
    customerId: null,
    tier1Count: 6,
    tier2Count: 4,
    totalDrones: 10,
    notes: 'Simulation kit',
    createdAt: now,
    updatedAt: now,
  };
}

export type SimTickData = {
  drones: SimDrone[];
  venue: SimVenue;
  principal: SimPrincipal;
  kits: Kit[];
  tickCount: number;
  elapsedMs: number;
  missionActive: boolean;
};

type SimListener = (data: SimTickData) => void;

export class SimulationEngine {
  private static instance: SimulationEngine | null = null;

  private venue: SimVenue;
  private drones: SimDrone[];
  private principal: SimPrincipal;
  private kits: Kit[];
  private missionActive = false;

  private tickIntervalMs: number;
  private tickCount = 0;
  private elapsedMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private listeners = new Set<SimListener>();

  private constructor(tickIntervalMs = 500) {
    this.tickIntervalMs = tickIntervalMs;
    this.venue = createDefaultVenue();
    this.kits = [createSimKit()];
    this.drones = createSimDrones(SIM_KIT_ID, 6, 4);
    this.principal = createSimPrincipal(this.venue);
  }

  static getInstance(): SimulationEngine {
    if (!SimulationEngine.instance) {
      SimulationEngine.instance = new SimulationEngine();
    }
    return SimulationEngine.instance;
  }

  start(): void {
    if (this.timer) return;
    this.lastTickAt = Date.now();

    this.timer = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);

    this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribe(listener: SimListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SimTickData {
    return {
      drones: this.drones,
      venue: this.venue,
      principal: this.principal,
      kits: this.kits,
      tickCount: this.tickCount,
      elapsedMs: this.elapsedMs,
      missionActive: this.missionActive,
    };
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  isMissionActive(): boolean {
    return this.missionActive;
  }

  startMission(): void {
    this.missionActive = true;
    this.elapsedMs = 0;
    this.tickCount = 0;
    this.notify();
  }

  endMission(): void {
    this.missionActive = false;
    for (let i = 0; i < this.drones.length; i++) {
      this.drones[i] = {
        ...this.drones[i],
        perchState: 'returning',
        transitProgress: 0,
        targetPerchPointId: null,
        targetZoneId: null,
      };
    }
    this.notify();
  }

  reset(): void {
    this.stop();
    this.missionActive = false;
    this.venue = createDefaultVenue();
    this.kits = [createSimKit()];
    this.drones = createSimDrones(SIM_KIT_ID, 6, 4);
    this.principal = createSimPrincipal(this.venue);
    this.tickCount = 0;
    this.elapsedMs = 0;
    this.notify();
  }

  private tick(): void {
    const now = Date.now();
    const dtMs = now - this.lastTickAt;
    this.lastTickAt = now;
    this.tickCount++;
    this.elapsedMs += dtMs;

    this.drones = this.drones.map((d) => tickDrone(d, this.venue, dtMs, this.missionActive));
    this.principal = tickPrincipal(this.principal, this.venue, dtMs);

    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
