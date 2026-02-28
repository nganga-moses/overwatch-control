import type { OverwatchDB } from '../storage/overwatch-db';
import type { KitType } from '../../src/shared/types/kit';

const KIT_COMPOSITIONS: Record<string, { tier_1: number; tier_2: number }> = {
  alpha: { tier_1: 8, tier_2: 0 },
  bravo: { tier_1: 0, tier_2: 6 },
  charlie: { tier_1: 6, tier_2: 4 },
};

export class AssetManager {
  constructor(private db: OverwatchDB) {}

  // --- Kits ---

  createKit(data: {
    name: string;
    type: string;
    serial: string;
    status?: string;
    customerId?: string | null;
    notes?: string | null;
  }): string {
    const comp = KIT_COMPOSITIONS[data.type] ?? { tier_1: 0, tier_2: 0 };
    return this.db.writeKit({
      ...data,
      tier1Count: comp.tier_1,
      tier2Count: comp.tier_2,
    });
  }

  getKit(id: string) {
    return this.db.getKit(id);
  }

  listKits() {
    return this.db.queryKits();
  }

  updateKit(id: string, patch: Record<string, unknown>) {
    this.db.updateKit(id, patch);
  }

  deleteKit(id: string) {
    this.db.deleteKit(id);
  }

  // --- Drones ---

  createDrone(data: {
    kitId: string;
    callsign: string;
    serial: string;
    tier: string;
    status?: string;
  }): string {
    return this.db.writeDroneProfile(data);
  }

  getDrone(id: string) {
    return this.db.getDroneProfile(id);
  }

  listDrones(kitId?: string) {
    return this.db.queryDroneProfiles(kitId);
  }

  updateDrone(id: string, patch: Record<string, unknown>) {
    this.db.updateDroneProfile(id, patch);
  }

  deleteDrone(id: string) {
    this.db.deleteDroneProfile(id);
  }

  /**
   * Mock onboarding: enter a serial, generate a fake kit manifest
   * simulating what the cloud would return for a real onboarding flow.
   */
  onboard(serial: string): {
    kitId: string;
    drones: { id: string; callsign: string; tier: string }[];
  } {
    const typeIdx = Math.floor(Math.random() * 3);
    const kitType = (['alpha', 'bravo', 'charlie'] as const)[typeIdx];
    const comp = KIT_COMPOSITIONS[kitType];

    const kitId = this.createKit({
      name: `Kit ${serial.slice(-4).toUpperCase()}`,
      type: kitType,
      serial,
    });

    const drones: { id: string; callsign: string; tier: string }[] = [];

    for (let i = 0; i < comp.tier_1; i++) {
      const callsign = `T1-${String(i + 1).padStart(2, '0')}`;
      const id = this.createDrone({
        kitId,
        callsign,
        serial: `${serial}-T1-${String(i + 1).padStart(2, '0')}`,
        tier: 'tier_1',
      });
      drones.push({ id, callsign, tier: 'tier_1' });
    }

    for (let i = 0; i < comp.tier_2; i++) {
      const callsign = `T2-${String(i + 1).padStart(2, '0')}`;
      const id = this.createDrone({
        kitId,
        callsign,
        serial: `${serial}-T2-${String(i + 1).padStart(2, '0')}`,
        tier: 'tier_2',
      });
      drones.push({ id, callsign, tier: 'tier_2' });
    }

    return { kitId, drones };
  }
}
