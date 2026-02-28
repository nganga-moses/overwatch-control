import type { Tier } from './drone';

export type KitType = 'alpha' | 'bravo' | 'charlie';

export type KitStatus = 'ready' | 'deployed' | 'maintenance' | 'transit';

export interface Kit {
  id: string;
  name: string;
  type: KitType;
  status: KitStatus;
  serial: string;
  customerId: string | null;
  tier1Count: number;
  tier2Count: number;
  totalDrones: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const KIT_COMPOSITIONS: Record<KitType, { tier_1: number; tier_2: number }> = {
  alpha: { tier_1: 8, tier_2: 0 },
  bravo: { tier_1: 0, tier_2: 6 },
  charlie: { tier_1: 6, tier_2: 4 },
};
