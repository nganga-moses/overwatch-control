import { create } from 'zustand';
import type { DroneProfile, Venue, VenueZone, PerchPoint, Principal, Kit, Operation, PerchState } from '@/shared/types';

export interface OverwatchState {
  drones: DroneProfile[];
  venue: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    zones: VenueZone[];
    perchPoints: PerchPoint[];
  } | null;
  principal: Principal | null;
  kits: Kit[];
  operations: Operation[];
  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: number;
    acknowledged: boolean;
  }>;
  simTickCount: number;
  simElapsedMs: number;

  setDrones: (drones: DroneProfile[]) => void;
  setVenue: (venue: OverwatchState['venue']) => void;
  setPrincipal: (principal: Principal | null) => void;
  setKits: (kits: Kit[]) => void;
  setOperations: (operations: Operation[]) => void;
  addAlert: (alert: OverwatchState['alerts'][0]) => void;
  acknowledgeAlert: (id: string) => void;
  setSimTick: (tickCount: number, elapsedMs: number) => void;

  getDronesByTier: (tier: 'tier_1' | 'tier_2') => DroneProfile[];
  getDronesByState: (state: PerchState) => DroneProfile[];
  getActiveDroneCount: () => number;
  getUnacknowledgedAlerts: () => OverwatchState['alerts'];
}

export const useOverwatchStore = create<OverwatchState>((set, get) => ({
  drones: [],
  venue: null,
  principal: null,
  kits: [],
  operations: [],
  alerts: [],
  simTickCount: 0,
  simElapsedMs: 0,

  setDrones: (drones) => set({ drones }),
  setVenue: (venue) => set({ venue }),
  setPrincipal: (principal) => set({ principal }),
  setKits: (kits) => set({ kits }),
  setOperations: (operations) => set({ operations }),
  addAlert: (alert) =>
    set((state) => ({ alerts: [alert, ...state.alerts].slice(0, 100) })),
  acknowledgeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a,
      ),
    })),
  setSimTick: (tickCount, elapsedMs) => set({ simTickCount: tickCount, simElapsedMs: elapsedMs }),

  getDronesByTier: (tier) => get().drones.filter((d) => d.tier === tier),
  getDronesByState: (state) => get().drones.filter((d) => d.perchState === state),
  getActiveDroneCount: () =>
    get().drones.filter((d) => d.perchState !== 'sleeping').length,
  getUnacknowledgedAlerts: () =>
    get().alerts.filter((a) => !a.acknowledged),
}));
