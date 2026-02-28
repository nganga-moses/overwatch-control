import { createDefaultVenue, type SimVenue } from './venue-sim';
import { createSimDrones, tickDrone, type SimDrone } from './drone-sim';
import { createSimPrincipal, tickPrincipal, type SimPrincipal } from './principal-sim';

export type SimTickData = {
  drones: SimDrone[];
  venue: SimVenue;
  principal: SimPrincipal;
  tickCount: number;
  elapsedMs: number;
};

type SimListener = (data: SimTickData) => void;

export class SimulationEngine {
  private static instance: SimulationEngine | null = null;

  private venue: SimVenue;
  private drones: SimDrone[];
  private principal: SimPrincipal;

  private tickIntervalMs: number;
  private tickCount = 0;
  private elapsedMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private listeners = new Set<SimListener>();

  private constructor(tickIntervalMs = 500) {
    this.tickIntervalMs = tickIntervalMs;
    this.venue = createDefaultVenue();
    this.drones = createSimDrones('sim-kit', 6, 4);
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
      tickCount: this.tickCount,
      elapsedMs: this.elapsedMs,
    };
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  reset(): void {
    this.stop();
    this.venue = createDefaultVenue();
    this.drones = createSimDrones('sim-kit', 6, 4);
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

    this.drones = this.drones.map((d) => tickDrone(d, this.venue, dtMs));
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
