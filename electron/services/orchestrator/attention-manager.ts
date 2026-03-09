import { EventEmitter } from 'events';

export type AttentionPriority = 0 | 1 | 2 | 3;

export interface AttentionItem {
  id: string;
  source: 'operator' | 'drone' | 'system' | 'principal';
  priority: AttentionPriority;
  timestamp: number;
  type: string;
  payload: unknown;
  requiresLlm: boolean;
  zoneId?: string;
  droneId?: string;
}

export type AttentionHandler = (item: AttentionItem) => Promise<void>;

const MAX_QUEUE_SIZE = 200;
const MAX_LLM_QUEUE = 10;
const LLM_TIMEOUT_MS = 30_000;

export class AttentionManager extends EventEmitter {
  private queue: AttentionItem[] = [];
  private handler: AttentionHandler;
  private llmBusy = false;
  private llmQueue: AttentionItem[] = [];
  private running = false;

  private tacticalTimer: ReturnType<typeof setInterval> | null = null;
  private strategicTimer: ReturnType<typeof setInterval> | null = null;
  private housekeepingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(handler: AttentionHandler) {
    super();
    this.handler = handler;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tacticalTimer = setInterval(() => this.drainTactical(), 5_000);
    this.strategicTimer = setInterval(() => this.drainStrategic(), 60_000);
    this.housekeepingTimer = setInterval(() => this.housekeeping(), 5 * 60_000);
  }

  stop(): void {
    this.running = false;
    for (const t of [this.tacticalTimer, this.strategicTimer, this.housekeepingTimer]) {
      if (t) clearInterval(t);
    }
    this.tacticalTimer = this.strategicTimer = this.housekeepingTimer = null;
  }

  submit(item: AttentionItem): void {
    if (item.priority === 0) {
      this.processImmediate(item);
      return;
    }

    if (this.queue.length >= MAX_QUEUE_SIZE) this.dropLowest();

    if (item.requiresLlm) {
      this.enqueueLlm(item);
    } else {
      this.queue.push(item);
    }

    if (item.priority === 1) this.processHighPriority();
  }

  get queueDepth(): number {
    return this.queue.length + this.llmQueue.length;
  }

  get isLlmBusy(): boolean {
    return this.llmBusy;
  }

  private async processImmediate(item: AttentionItem): Promise<void> {
    try {
      await this.handler(item);
    } catch (err) {
      console.error(`[AttentionManager] Immediate item ${item.id} failed:`, err);
    }
  }

  private async processHighPriority(): Promise<void> {
    const items = this.drainByPriority(1);
    for (const item of items) {
      if (item.requiresLlm) continue;
      try {
        await this.handler(item);
      } catch (err) {
        console.error(`[AttentionManager] High-priority item ${item.id} failed:`, err);
      }
    }
  }

  private async drainTactical(): Promise<void> {
    if (!this.running) return;
    const items = this.drainByPriority(2);
    for (const item of items) {
      try { await this.handler(item); } catch (err) {
        console.error(`[AttentionManager] Tactical item ${item.id} failed:`, err);
      }
    }
    await this.drainLlmQueue();
  }

  private async drainStrategic(): Promise<void> {
    if (!this.running) return;
    this.submit({
      id: `strategic-${Date.now()}`,
      source: 'system',
      priority: 3,
      timestamp: Date.now(),
      type: 'strategic_reflection',
      payload: null,
      requiresLlm: true,
    });
    const items = this.drainByPriority(3);
    for (const item of items) {
      try { await this.handler(item); } catch (err) {
        console.error(`[AttentionManager] Strategic item ${item.id} failed:`, err);
      }
    }
    await this.drainLlmQueue();
  }

  private enqueueLlm(item: AttentionItem): void {
    if (this.llmQueue.length >= MAX_LLM_QUEUE) {
      const lowestIdx = this.findLowestIdx(this.llmQueue);
      if (lowestIdx >= 0 && this.llmQueue[lowestIdx].priority > item.priority) {
        this.llmQueue.splice(lowestIdx, 1);
      } else {
        return;
      }
    }
    this.llmQueue.push(item);
    this.llmQueue.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
  }

  private async drainLlmQueue(): Promise<void> {
    if (this.llmBusy || this.llmQueue.length === 0) return;
    this.llmBusy = true;
    while (this.llmQueue.length > 0) {
      const item = this.llmQueue.shift()!;
      try {
        await Promise.race([
          this.handler(item),
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error('LLM timeout')), LLM_TIMEOUT_MS)),
        ]);
      } catch (err) {
        console.error(`[AttentionManager] LLM item ${item.id} failed:`, err);
        this.emit('llm-timeout', item);
      }
    }
    this.llmBusy = false;
  }

  private drainByPriority(priority: AttentionPriority): AttentionItem[] {
    const items = this.queue.filter((i) => i.priority === priority);
    this.queue = this.queue.filter((i) => i.priority !== priority);
    return items;
  }

  private dropLowest(): void {
    const idx = this.findLowestIdx(this.queue);
    if (idx >= 0) this.queue.splice(idx, 1);
  }

  private findLowestIdx(arr: AttentionItem[]): number {
    if (arr.length === 0) return -1;
    let idx = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].priority > arr[idx].priority) idx = i;
      else if (arr[i].priority === arr[idx].priority && arr[i].timestamp < arr[idx].timestamp) idx = i;
    }
    return idx;
  }

  private housekeeping(): void {
    this.emit('housekeeping');
  }
}
