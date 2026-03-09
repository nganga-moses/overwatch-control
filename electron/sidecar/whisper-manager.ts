/**
 * Manages the whisper.cpp server sidecar process.
 *
 * Copied from Mission Control's sidecar layer (domain-agnostic).
 * Same lifecycle pattern as LLMManager: spawn, health check, crash recovery,
 * graceful shutdown.
 */

import { ChildProcess, spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as net from 'net';
import * as http from 'http';
import * as path from 'path';

export type WhisperStatus = 'stopped' | 'starting' | 'ready' | 'processing' | 'error' | 'shutting_down';

export interface WhisperConfig {
  serverPath: string;
  modelPath: string;
  host: string;
  port: number;
  maxRestarts: number;
  healthCheckIntervalMs: number;
  shutdownTimeoutMs: number;
  threads: number;
  language: string;
}

export interface WhisperStatusInfo {
  status: WhisperStatus;
  model: string;
  error: string | null;
  restartCount: number;
  uptime_s: number;
}

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration_ms: number;
}

const DEFAULT_CONFIG: WhisperConfig = {
  serverPath: 'whisper-server',
  modelPath: '',
  host: '127.0.0.1',
  port: 8178,
  maxRestarts: 3,
  healthCheckIntervalMs: 5000,
  shutdownTimeoutMs: 10_000,
  threads: 4,
  language: 'en',
};

export class WhisperManager extends EventEmitter {
  private config: WhisperConfig;
  private process: ChildProcess | null = null;
  private status: WhisperStatus = 'stopped';
  private error: string | null = null;
  private restartCount = 0;
  private startedAt: number | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private externalServer = false;
  private _available = true;

  get available(): boolean { return this._available; }

  constructor(config: Partial<WhisperConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private checkBinaryExists(): boolean {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    try {
      execSync(`${cmd} ${this.config.serverPath}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.status !== 'stopped' && this.status !== 'error') return;

    this.setStatus('starting');
    this.error = null;

    if (!this.config.modelPath) {
      this.setStatus('error', 'No whisper model path configured');
      return;
    }

    const portInUse = await this.isPortInUse();
    if (portInUse) {
      const healthy = await this.checkHealth();
      if (healthy) {
        console.log('[WhisperManager] Server already running, attaching');
        this.externalServer = true;
        this.startedAt = Date.now();
        this.setStatus('ready');
        this.startHealthPolling();
        return;
      }
      this.setStatus('error', `Port ${this.config.port} is in use but not responding as Whisper`);
      return;
    }

    if (!this.checkBinaryExists()) {
      this._available = false;
      console.warn(`[WhisperManager] '${this.config.serverPath}' not found on PATH. Install whisper.cpp or set WHISPER_SERVER_PATH.`);
      this.setStatus('error', `Whisper binary not found: ${this.config.serverPath}`);
      return;
    }

    this.spawnServer();
  }

  async stop(): Promise<void> {
    this.setStatus('shutting_down');
    this.stopHealthPolling();

    if (this.externalServer) {
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
          console.warn('[WhisperManager] Graceful shutdown timed out, sending SIGKILL');
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

  async transcribe(pcmBuffer: Buffer): Promise<TranscriptionResult> {
    if (!pcmBuffer || pcmBuffer.length === 0) {
      throw new Error('Audio buffer is empty');
    }
    if (this.status !== 'ready' && this.status !== 'processing') {
      throw new Error(`Whisper not ready (status: ${this.status})`);
    }

    this.setStatus('processing');
    const startTime = Date.now();

    try {
      const wavBuffer = pcmToWav(pcmBuffer, 16000, 1, 16);
      const result = await this.whisperRequest(wavBuffer);
      return {
        ...result,
        duration_ms: Date.now() - startTime,
      };
    } finally {
      if (this.status === 'processing') {
        this.setStatus('ready');
      }
    }
  }

  isReady(): boolean {
    return this.status === 'ready' || this.status === 'processing';
  }

  getStatus(): WhisperStatusInfo {
    return {
      status: this.status,
      model: path.basename(this.config.modelPath),
      error: this.error,
      restartCount: this.restartCount,
      uptime_s: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Process lifecycle
  // ---------------------------------------------------------------------------

  private spawnServer(): void {
    const args = [
      '--model', this.config.modelPath,
      '--host', this.config.host,
      '--port', String(this.config.port),
      '--threads', String(this.config.threads),
      '--language', this.config.language,
    ];

    try {
      this.process = spawn(this.config.serverPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
    } catch (err) {
      this.setStatus('error', `Failed to spawn whisper server: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    this.process.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.log(`[Whisper] ${line}`);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.error(`[Whisper] ${line}`);
    });

    this.process.on('error', (err) => {
      console.error('[WhisperManager] Process error:', err.message);
      this.setStatus('error', err.message);
      this.attemptRestart();
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[WhisperManager] Server exited (code=${code}, signal=${signal})`);
      if (this.status !== 'shutting_down' && this.status !== 'stopped') {
        this.setStatus('error', `Whisper server exited unexpectedly (code=${code})`);
        this.attemptRestart();
      }
    });

    this.startedAt = Date.now();
    this.waitForReady();
  }

  private async waitForReady(): Promise<void> {
    const maxAttempts = 20;
    let attempt = 0;

    const check = async (): Promise<void> => {
      if (this.status === 'stopped' || this.status === 'shutting_down') return;

      attempt++;
      const healthy = await this.checkHealth();

      if (healthy) {
        this.setStatus('ready');
        console.log('[WhisperManager] Server ready');
        this.startHealthPolling();
        return;
      }

      if (attempt >= maxAttempts) {
        this.setStatus('error', 'Whisper server failed to start within timeout');
        return;
      }

      const delay = Math.min(500 * Math.pow(1.5, Math.min(attempt, 8)), 5000);
      await sleep(delay);
      return check();
    };

    await check();
  }

  private attemptRestart(): void {
    this.process = null;

    if (!this._available) return;

    this.restartCount++;

    if (this.restartCount > this.config.maxRestarts) {
      console.error(`[WhisperManager] Max restarts (${this.config.maxRestarts}) exceeded`);
      this.setStatus('error', `Exceeded max restart attempts (${this.config.maxRestarts})`);
      return;
    }

    console.log(`[WhisperManager] Restarting (${this.restartCount}/${this.config.maxRestarts})...`);
    const delay = 2000 * this.restartCount;
    setTimeout(() => {
      if (this.status === 'error') {
        this.spawnServer();
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
        console.warn('[WhisperManager] Health check failed');
        if (!this.externalServer) {
          this.setStatus('error', 'Whisper server stopped responding');
          this.attemptRestart();
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  private stopHealthPolling(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get({
        hostname: this.config.host,
        port: this.config.port,
        path: '/health',
        timeout: 3000,
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  // ---------------------------------------------------------------------------
  // Whisper API
  // ---------------------------------------------------------------------------

  private whisperRequest(wavBuffer: Buffer): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      const boundary = `----FormBoundary${Date.now()}`;
      const header = Buffer.from(
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n' +
        'Content-Type: audio/wav\r\n\r\n',
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([header, wavBuffer, footer]);

      const options: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path: '/inference',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        timeout: 60_000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              resolve({
                text: parsed.text?.trim() ?? '',
                segments: parsed.segments ?? [],
                language: parsed.language ?? this.config.language,
                duration_ms: 0,
              });
            } catch {
              resolve({ text: data.trim(), segments: [], language: this.config.language, duration_ms: 0 });
            }
          } else {
            reject(new Error(`Whisper returned ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Whisper request timed out')); });
      req.write(body);
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
      server.once('listening', () => { server.close(); resolve(false); });
      server.listen(this.config.port, this.config.host);
    });
  }

  private setStatus(status: WhisperStatus, errorMsg?: string): void {
    this.status = status;
    if (errorMsg !== undefined) this.error = errorMsg;
    if (status !== 'error') this.error = null;
    this.emit('status-change', this.getStatus());
  }
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;
  const wav = Buffer.alloc(headerSize + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  pcm.copy(wav, headerSize);

  return wav;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
