import { createHash } from 'crypto';
import type { OverwatchDB } from '../storage/overwatch-db';

interface ActivateResult {
  api_key: string;
  workstation_id: string;
  customer_id: string;
  customer_name: string;
  operators: {
    id: string;
    name: string;
    role: string;
    pin_digits_json: string;
    is_active: boolean;
    created_at: string;
  }[];
}

export class ActivationService {
  constructor(private db: OverwatchDB) {}

  isActivated(): boolean {
    return this.db.isActivated();
  }

  getCloudUrl(): string {
    return this.db.getConfig('cloud_url') ?? '';
  }

  async activate(cloudUrl: string, code: string): Promise<{
    workstationId: string;
    customerId: string;
    customerName: string;
  }> {
    const serial = this.getHardwareSerial();

    const resp = await fetch(`${cloudUrl}/api/v1/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.replace(/-/g, '').toUpperCase(),
        hardware_serial: serial,
        name: `Workstation-${serial.slice(0, 8)}`,
        software_version: '0.1.0',
      }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(body.detail ?? `Activation failed: ${resp.status}`);
    }

    const data: ActivateResult = await resp.json();

    this.db.setConfig('cloud_url', cloudUrl);
    this.db.setConfig('api_key', data.api_key);
    this.db.setConfig('workstation_id', data.workstation_id);
    this.db.setConfig('customer_id', data.customer_id);
    this.db.setConfig('customer_name', data.customer_name);
    this.db.setConfig('is_activated', 'true');

    for (const op of data.operators) {
      this.db.upsertOperator({
        id: op.id,
        name: op.name,
        role: op.role,
        pinDigitsJson: op.pin_digits_json,
        isActive: op.is_active,
      });
    }

    return {
      workstationId: data.workstation_id,
      customerId: data.customer_id,
      customerName: data.customer_name,
    };
  }

  getOperators(): any[] {
    return this.db.getActiveOperators();
  }

  validatePin(operatorId: string, positions: number[], digits: string[]): boolean {
    const op = this.db.getOperator(operatorId);
    if (!op || !op.is_active) return false;

    let storedHashes: string[];
    try {
      storedHashes = JSON.parse(op.pin_digits_json);
    } catch {
      return false;
    }

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const expectedHash = storedHashes[pos];
      const enteredHash = createHash('sha256')
        .update(`${operatorId}:${digits[i]}`)
        .digest('hex');
      if (enteredHash !== expectedHash) return false;
    }

    return true;
  }

  generateChallengePositions(excludePositions?: number[]): number[] {
    const allPositions = [0, 1, 2, 3, 4, 5];
    const available = excludePositions
      ? allPositions.filter((p) => !excludePositions.includes(p))
      : allPositions;

    const count = 3;
    const selected: number[] = [];
    const pool = [...available];

    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push(pool[idx]);
      pool.splice(idx, 1);
    }

    return selected.sort((a, b) => a - b);
  }

  getCredentials(): { cloudUrl: string; apiKey: string; workstationId: string } | null {
    const cloudUrl = this.db.getConfig('cloud_url');
    const apiKey = this.db.getConfig('api_key');
    const workstationId = this.db.getConfig('workstation_id');
    if (!cloudUrl || !apiKey || !workstationId) return null;
    return { cloudUrl, apiKey, workstationId };
  }

  private getHardwareSerial(): string {
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'darwin') {
        return execSync('system_profiler SPHardwareDataType | grep UUID', { encoding: 'utf8' })
          .trim()
          .split(':')
          .pop()
          ?.trim() ?? crypto.randomUUID();
      }
    } catch { /* fall through */ }
    return crypto.randomUUID();
  }
}
