/**
 * Manages the MediaMTX sidecar process for RTSP-to-WHEP video relay.
 *
 * Adapted from Mission Control's MediaRelayManager for Overwatch indoor ops.
 * Uses offset ports (9554/9889/9997) to avoid collision with MC on the same host.
 *
 * Architecture:
 *   Drone → RTSP push → MediaMTX (port 9554) → WHEP serve (port 9889) → Browser
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as net from 'net';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type MediaRelayStatus = 'stopped' | 'starting' | 'ready' | 'error' | 'shutting_down';

export interface MediaRelayConfig {
  binaryPath: string;
  rtspPort: number;
  whepPort: number;
  apiPort: number;
  maxReaders: number;
  recordPath: string;
  maxRestarts: number;
  healthCheckIntervalMs: number;
  shutdownTimeoutMs: number;
}

export interface MediaRelayStatusInfo {
  status: MediaRelayStatus;
  streams: number;
  error: string | null;
  restartCount: number;
  uptime_s: number;
}

export interface MediaStreamInfo {
  name: string;
  ready: boolean;
  readers: number;
  bytesReceived: number;
}

const DEFAULT_CONFIG: MediaRelayConfig = {
  binaryPath: 'mediamtx',
  rtspPort: 9554,
  whepPort: 9889,
  apiPort: 9998,
  maxReaders: 10,
  recordPath: path.join(os.homedir(), 'overwatch-recordings'),
  maxRestarts: 5,
  healthCheckIntervalMs: 5000,
  shutdownTimeoutMs: 10_000,
};

export class MediaRelayManager extends EventEmitter {
  private config: MediaRelayConfig;
  private process: ChildProcess | null = null;
  private status: MediaRelayStatus = 'stopped';
  private error: string | null = null;
  private restartCount = 0;
  private startedAt: number | null = null;
  private activeStreamCount = 0;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private configFilePath: string | null = null;

  constructor(config: Partial<MediaRelayConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.status !== 'stopped' && this.status !== 'error') return;

    this.setStatus('starting');
    this.error = null;

    const portInUse = await this.isPortInUse(this.config.rtspPort);
    if (portInUse) {
      const healthy = await this.checkHealth();
      if (healthy) {
        console.log('[OW-MediaRelay] Server already running, attaching');
        this.startedAt = Date.now();
        this.setStatus('ready');
        this.startHealthPolling();
        return;
      }
      this.setStatus('error', `Port ${this.config.rtspPort} is in use but not responding as MediaMTX`);
      return;
    }

    this.writeConfig();
    this.spawnServer();
  }

  async stop(): Promise<void> {
    this.setStatus('shutting_down');
    this.stopHealthPolling();

    if (!this.process) {
      this.cleanup();
      this.setStatus('stopped');
      return;
    }

    const proc = this.process;
    this.process = null;

    return new Promise<void>((resolve) => {
      let killed = false;
      const timer = setTimeout(() => {
        if (!killed) {
          console.warn('[OW-MediaRelay] Graceful shutdown timed out, sending SIGKILL');
          proc.kill('SIGKILL');
        }
        resolve();
      }, this.config.shutdownTimeoutMs);

      proc.once('exit', () => {
        killed = true;
        clearTimeout(timer);
        this.cleanup();
        this.setStatus('stopped');
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    this.restartCount = 0;
    await this.start();
  }

  getStatus(): MediaRelayStatusInfo {
    return {
      status: this.status,
      streams: this.activeStreamCount,
      error: this.error,
      restartCount: this.restartCount,
      uptime_s: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    };
  }

  async getStreams(): Promise<MediaStreamInfo[]> {
    if (this.status !== 'ready') return [];

    try {
      const data = await this.apiGet('/v3/paths/list');
      const parsed = JSON.parse(data);
      return (parsed.items ?? []).map((item: Record<string, unknown>) => ({
        name: item.name as string,
        ready: item.ready as boolean,
        readers: (item.readers as { count: number })?.count ?? 0,
        bytesReceived: (item.bytesReceived as number) ?? 0,
      }));
    } catch {
      return [];
    }
  }

  async startRecording(streamPath: string): Promise<boolean> {
    if (this.status !== 'ready') return false;
    try {
      await this.apiPost(`/v3/recordings/start/${streamPath}`);
      return true;
    } catch {
      return false;
    }
  }

  async stopRecording(streamPath: string): Promise<boolean> {
    if (this.status !== 'ready') return false;
    try {
      await this.apiPost(`/v3/recordings/stop/${streamPath}`);
      return true;
    } catch {
      return false;
    }
  }

  private writeConfig(): void {
    const configDir = path.join(os.tmpdir(), 'overwatch-mediamtx');
    fs.mkdirSync(configDir, { recursive: true });
    this.configFilePath = path.join(configDir, 'mediamtx.yml');

    const publishUser = process.env.MEDIAMTX_PUBLISH_USER ?? 'fireflyos';
    const publishPass = process.env.MEDIAMTX_PUBLISH_PASS ?? '';
    const publishAuthLines = publishPass
      ? [`    publishUser: ${publishUser}`, `    publishPass: ${publishPass}`]
      : [];

    const yaml = [
      `rtspAddress: :${this.config.rtspPort}`,
      `webrtcAddress: :${this.config.whepPort}`,
      `apiAddress: 127.0.0.1:${this.config.apiPort}`,
      `readBufferCount: ${this.config.maxReaders}`,
      `record: no`,
      `recordPath: ${this.config.recordPath}/%path/%Y-%m-%d_%H-%M-%S`,
      `paths:`,
      `  all_others:`,
      ...publishAuthLines,
    ].join('\n');

    fs.writeFileSync(this.configFilePath, yaml, 'utf8');
  }

  private spawnServer(): void {
    if (!this.configFilePath) {
      this.setStatus('error', 'Config file not written');
      return;
    }

    try {
      this.process = spawn(this.config.binaryPath, [this.configFilePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
    } catch (err) {
      this.setStatus(
        'error',
        `Failed to spawn MediaMTX: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    this.process.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.log(`[OW-MediaMTX] ${line}`);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.error(`[OW-MediaMTX] ${line}`);
    });

    this.process.on('error', (err) => {
      console.error('[OW-MediaRelay] Process error:', err.message);
      this.setStatus('error', err.message);
      this.attemptRestart();
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[OW-MediaRelay] Server exited (code=${code}, signal=${signal})`);
      if (this.status !== 'shutting_down' && this.status !== 'stopped') {
        this.setStatus('error', `MediaMTX exited unexpectedly (code=${code})`);
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
        console.log('[OW-MediaRelay] Server ready');
        this.startHealthPolling();
        return;
      }

      if (attempt >= maxAttempts) {
        this.setStatus('error', 'MediaMTX failed to start within timeout');
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
    this.restartCount++;

    if (this.restartCount > this.config.maxRestarts) {
      console.error(`[OW-MediaRelay] Max restarts (${this.config.maxRestarts}) exceeded`);
      this.setStatus('error', `Exceeded max restart attempts (${this.config.maxRestarts})`);
      return;
    }

    console.log(`[OW-MediaRelay] Restarting (${this.restartCount}/${this.config.maxRestarts})...`);
    const delay = 2000 * this.restartCount;
    setTimeout(() => {
      if (this.status === 'error') {
        this.writeConfig();
        this.spawnServer();
      }
    }, delay);
  }

  private startHealthPolling(): void {
    this.stopHealthPolling();
    this.healthCheckTimer = setInterval(async () => {
      const healthy = await this.checkHealth();
      if (!healthy && this.status === 'ready') {
        console.warn('[OW-MediaRelay] Health check failed');
        this.setStatus('error', 'MediaMTX stopped responding');
        this.attemptRestart();
      }

      if (healthy) {
        const streams = await this.getStreams();
        this.activeStreamCount = streams.filter((s) => s.ready).length;
        this.emit('status-change', this.getStatus());
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
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port: this.config.apiPort,
          path: '/v3/paths/list',
          timeout: 3000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(res.statusCode === 200));
        },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private apiGet(apiPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        { hostname: '127.0.0.1', port: this.config.apiPort, path: apiPath, timeout: 5000 },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            if (res.statusCode === 200) resolve(data);
            else reject(new Error(`API returned ${res.statusCode}`));
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
    });
  }

  private apiPost(apiPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.config.apiPort,
          path: apiPath,
          method: 'POST',
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 300) resolve(data);
            else reject(new Error(`API returned ${res.statusCode}`));
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
      req.end();
    });
  }

  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(true));
      server.once('listening', () => { server.close(); resolve(false); });
      server.listen(port, '127.0.0.1');
    });
  }

  private cleanup(): void {
    if (this.configFilePath) {
      try { fs.unlinkSync(this.configFilePath); } catch { /* ignore */ }
      this.configFilePath = null;
    }
  }

  private setStatus(status: MediaRelayStatus, errorMsg?: string): void {
    this.status = status;
    if (errorMsg !== undefined) this.error = errorMsg;
    if (status !== 'error') this.error = null;
    this.emit('status-change', this.getStatus());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
