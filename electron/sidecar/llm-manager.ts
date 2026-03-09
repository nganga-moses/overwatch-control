/**
 * Manages the Ollama LLM sidecar process.
 *
 * Copied from Mission Control's sidecar layer (domain-agnostic).
 * Handles process lifecycle, health checks, crash recovery, and request queuing.
 *
 * Responsibilities:
 *  - Spawn Ollama as a child process on app launch
 *  - Attach to an already-running Ollama instance
 *  - Health check with exponential backoff
 *  - Graceful shutdown (SIGTERM → timeout → SIGKILL)
 *  - Crash recovery with restart limit
 *  - Sequential request queuing (no concurrent generation)
 *  - Port validation before spawning
 *  - GPU/VRAM monitoring
 */

import { ChildProcess, spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as net from 'net';
import * as http from 'http';

export type LLMStatus = 'stopped' | 'starting' | 'loading_model' | 'ready' | 'processing' | 'error' | 'shutting_down';

export interface LLMConfig {
  model: string;
  host: string;
  port: number;
  ollamaPath: string;
  maxRestarts: number;
  healthCheckIntervalMs: number;
  shutdownTimeoutMs: number;
  gpuLayers?: number;
}

export interface LLMStatusInfo {
  status: LLMStatus;
  model: string;
  error: string | null;
  restartCount: number;
  uptime_s: number;
  gpu: GPUInfo | null;
  queueDepth: number;
}

export interface GPUInfo {
  vram_total_mb: number;
  vram_used_mb: number;
  vram_free_mb: number;
}

export interface GenerateOptions {
  system?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  format?: 'json';
  stop?: string[];
}

interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

const DEFAULT_CONFIG: LLMConfig = {
  model: 'qwen3:32b',
  host: '127.0.0.1',
  port: 11434,
  ollamaPath: 'ollama',
  maxRestarts: 3,
  healthCheckIntervalMs: 2000,
  shutdownTimeoutMs: 10_000,
};

export class LLMManager extends EventEmitter {
  private config: LLMConfig;
  private process: ChildProcess | null = null;
  private status: LLMStatus = 'stopped';
  private error: string | null = null;
  private restartCount = 0;
  private startedAt: number | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private gpuInfo: GPUInfo | null = null;
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;
  private externalOllama = false;
  private _available = true;

  get available(): boolean { return this._available; }

  constructor(config: Partial<LLMConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private checkBinaryExists(): boolean {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    try {
      execSync(`${cmd} ${this.config.ollamaPath}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.status !== 'stopped' && this.status !== 'error') return;

    this.setStatus('starting');
    this.error = null;

    const portInUse = await this.isPortInUse();
    if (portInUse) {
      const healthy = await this.checkHealth();
      if (healthy) {
        console.log('[LLMManager] Ollama already running on port, attaching');
        this.externalOllama = true;
        this.startedAt = Date.now();
        await this.ensureModelLoaded();
        this.startHealthPolling();
        return;
      }
      this.setStatus('error', `Port ${this.config.port} is in use but not responding as Ollama`);
      return;
    }

    if (!this.checkBinaryExists()) {
      this._available = false;
      console.warn(`[LLMManager] '${this.config.ollamaPath}' not found on PATH. Install Ollama (https://ollama.com) or set OLLAMA_PATH.`);
      this.setStatus('error', `Ollama binary not found: ${this.config.ollamaPath}`);
      return;
    }

    this.spawnOllama();
  }

  async stop(): Promise<void> {
    this.setStatus('shutting_down');
    this.stopHealthPolling();

    if (this.externalOllama) {
      this.setStatus('stopped');
      return;
    }

    if (!this.process) {
      this.setStatus('stopped');
      return;
    }

    const proc = this.process;
    this.process = null;

    return new Promise<void>((resolve) => {
      let killed = false;
      const timer = setTimeout(() => {
        if (!killed) {
          console.warn('[LLMManager] Graceful shutdown timed out, sending SIGKILL');
          proc.kill('SIGKILL');
        }
        resolve();
      }, this.config.shutdownTimeoutMs);

      proc.once('exit', () => {
        killed = true;
        clearTimeout(timer);
        this.setStatus('stopped');
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    if (!prompt || prompt.trim().length === 0) {
      return Promise.reject(new Error('Prompt must not be empty'));
    }
    return this.enqueue(() => this.doGenerate(prompt, options));
  }

  async chat(messages: Array<{ role: string; content: string }>, options: GenerateOptions = {}): Promise<string> {
    if (!messages || messages.length === 0) {
      return Promise.reject(new Error('Messages must not be empty'));
    }
    return this.enqueue(() => this.doChat(messages, options));
  }

  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return Promise.reject(new Error('Text must not be empty'));
    }
    return this.enqueue(() => this.doEmbed(text));
  }

  isReady(): boolean {
    return this.status === 'ready' || this.status === 'processing';
  }

  getStatus(): LLMStatusInfo {
    return {
      status: this.status,
      model: this.config.model,
      error: this.error,
      restartCount: this.restartCount,
      uptime_s: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      gpu: this.gpuInfo,
      queueDepth: this.queue.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Process lifecycle
  // ---------------------------------------------------------------------------

  private spawnOllama(): void {
    const env = { ...process.env };
    env.OLLAMA_HOST = `${this.config.host}:${this.config.port}`;
    if (this.config.gpuLayers !== undefined) {
      env.OLLAMA_GPU_LAYERS = String(this.config.gpuLayers);
    }

    try {
      this.process = spawn(this.config.ollamaPath, ['serve'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
    } catch (err) {
      this.setStatus('error', `Failed to spawn Ollama: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    this.process.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.log(`[Ollama] ${line}`);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.error(`[Ollama] ${line}`);
    });

    this.process.on('error', (err) => {
      console.error('[LLMManager] Process error:', err.message);
      this.setStatus('error', err.message);
      this.attemptRestart();
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[LLMManager] Ollama exited (code=${code}, signal=${signal})`);
      if (this.status !== 'shutting_down' && this.status !== 'stopped') {
        this.setStatus('error', `Ollama exited unexpectedly (code=${code})`);
        this.attemptRestart();
      }
    });

    this.startedAt = Date.now();
    this.waitForReady();
  }

  private async waitForReady(): Promise<void> {
    const maxAttempts = 30;
    let attempt = 0;

    const check = async (): Promise<void> => {
      if (this.status === 'stopped' || this.status === 'shutting_down') return;

      attempt++;
      const healthy = await this.checkHealth();

      if (healthy) {
        await this.ensureModelLoaded();
        this.startHealthPolling();
        return;
      }

      if (attempt >= maxAttempts) {
        this.setStatus('error', 'Ollama failed to start within timeout');
        return;
      }

      const delay = Math.min(500 * Math.pow(1.5, Math.min(attempt, 10)), 5000);
      await sleep(delay);
      return check();
    };

    await check();
  }

  private async ensureModelLoaded(): Promise<void> {
    this.setStatus('loading_model');

    try {
      const models = await this.ollamaRequest<{ models: Array<{ name: string }> }>('GET', '/api/tags');
      const loaded = models.models?.some(m => m.name === this.config.model || m.name.startsWith(this.config.model.split(':')[0]));

      if (!loaded) {
        console.log(`[LLMManager] Model ${this.config.model} not found locally, pulling...`);
        await this.ollamaRequest('POST', '/api/pull', { name: this.config.model });
      }

      await this.ollamaRequest('POST', '/api/generate', {
        model: this.config.model,
        prompt: 'ping',
        stream: false,
        options: { num_predict: 1 },
      });

      this.setStatus('ready');
      console.log(`[LLMManager] Model ${this.config.model} ready`);
    } catch (err) {
      this.setStatus('error', `Failed to load model: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private attemptRestart(): void {
    this.process = null;

    if (!this._available) return;

    this.restartCount++;

    if (this.restartCount > this.config.maxRestarts) {
      console.error(`[LLMManager] Max restarts (${this.config.maxRestarts}) exceeded, giving up`);
      this.setStatus('error', `Exceeded max restart attempts (${this.config.maxRestarts})`);
      return;
    }

    console.log(`[LLMManager] Restarting (attempt ${this.restartCount}/${this.config.maxRestarts})...`);
    const delay = 2000 * this.restartCount;
    setTimeout(() => {
      if (this.status === 'error') {
        this.spawnOllama();
      }
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Health monitoring
  // ---------------------------------------------------------------------------

  private startHealthPolling(): void {
    this.stopHealthPolling();
    this.healthCheckTimer = setInterval(async () => {
      const healthy = await this.checkHealth();
      if (!healthy && this.status === 'ready') {
        console.warn('[LLMManager] Health check failed');
        if (!this.externalOllama) {
          this.setStatus('error', 'Ollama stopped responding');
          this.attemptRestart();
        }
      }
      await this.updateGPUInfo();
    }, this.config.healthCheckIntervalMs);
  }

  private stopHealthPolling(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async checkHealth(): Promise<boolean> {
    try {
      await this.ollamaRequest('GET', '/');
      return true;
    } catch {
      return false;
    }
  }

  private async updateGPUInfo(): Promise<void> {
    try {
      const ps = await this.ollamaRequest<{ models?: Array<{ size_vram?: number; size?: number }> }>('GET', '/api/ps');
      if (ps.models && ps.models.length > 0) {
        const model = ps.models[0];
        const sizeVram = model.size_vram ?? 0;
        const sizeTotal = model.size ?? 0;
        if (sizeTotal > 0) {
          const vramUsed = Math.round(sizeVram / (1024 * 1024));
          const totalSize = Math.round(sizeTotal / (1024 * 1024));
          this.gpuInfo = {
            vram_used_mb: vramUsed,
            vram_total_mb: totalSize,
            vram_free_mb: Math.max(0, totalSize - vramUsed),
          };
        }
      }
    } catch {
      // GPU info is best-effort
    }
  }

  // ---------------------------------------------------------------------------
  // Request queue — ensures sequential LLM access
  // ---------------------------------------------------------------------------

  private enqueue<T>(execute: () => Promise<T>): Promise<T> {
    if (this.status !== 'ready' && this.status !== 'processing') {
      return Promise.reject(new Error(`LLM not ready (status: ${this.status})`));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drainQueue();
    });
  }

  private async drainQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    this.setStatus('processing');

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (err) {
        request.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
    if (this.status === 'processing') {
      this.setStatus('ready');
    }
  }

  // ---------------------------------------------------------------------------
  // Ollama API calls
  // ---------------------------------------------------------------------------

  private async doGenerate(prompt: string, options: GenerateOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt,
      stream: false,
    };

    if (options.system) body.system = options.system;
    if (options.format) body.format = options.format;

    const ollamaOptions: Record<string, unknown> = {};
    if (options.temperature !== undefined) ollamaOptions.temperature = options.temperature;
    if (options.top_p !== undefined) ollamaOptions.top_p = options.top_p;
    if (options.max_tokens !== undefined) ollamaOptions.num_predict = options.max_tokens;
    if (options.stop) ollamaOptions.stop = options.stop;
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

    const result = await this.ollamaRequest<{ response: string }>('POST', '/api/generate', body);
    return result.response;
  }

  private async doChat(
    messages: Array<{ role: string; content: string }>,
    options: GenerateOptions,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: false,
    };
    if (options.format) body.format = options.format;

    const ollamaOptions: Record<string, unknown> = {};
    if (options.temperature !== undefined) ollamaOptions.temperature = options.temperature;
    if (options.top_p !== undefined) ollamaOptions.top_p = options.top_p;
    if (options.max_tokens !== undefined) ollamaOptions.num_predict = options.max_tokens;
    if (options.stop) ollamaOptions.stop = options.stop;
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

    const result = await this.ollamaRequest<{ message: { content: string } }>('POST', '/api/chat', body);
    return result.message.content;
  }

  private async doEmbed(text: string): Promise<number[]> {
    const result = await this.ollamaRequest<{ embeddings: number[][] }>(
      'POST', '/api/embed',
      { model: this.config.model, input: text },
    );
    return result.embeddings[0];
  }

  private ollamaRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 300_000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve({ raw: data } as unknown as T);
            }
          } else {
            reject(new Error(`Ollama ${method} ${path} returned ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Ollama ${method} ${path} timed out`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private isPortInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(true));
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      server.listen(this.config.port, this.config.host);
    });
  }

  private setStatus(status: LLMStatus, errorMsg?: string): void {
    this.status = status;
    if (errorMsg !== undefined) this.error = errorMsg;
    if (status !== 'error') this.error = null;
    this.emit('status-change', this.getStatus());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
