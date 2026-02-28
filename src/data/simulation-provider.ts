import type { SimulationEngine } from './simulation/engine';
import { useOverwatchStore } from '@/shared/store/overwatch-store';

export interface DataProvider {
  start: () => () => void;
}

export function createSimulationProvider(engine: SimulationEngine): DataProvider {
  return {
    start: () => {
      const store = useOverwatchStore.getState();

      const unsubscribe = engine.subscribe((data) => {
        const storeActions = useOverwatchStore.getState();

        storeActions.setDrones(data.drones);
        storeActions.setVenue({
          id: data.venue.id,
          name: data.venue.name,
          lat: data.venue.lat,
          lng: data.venue.lng,
          zones: data.venue.zones,
          perchPoints: data.venue.perchPoints,
        });
        storeActions.setPrincipal(data.principal);
        storeActions.setSimTick(data.tickCount, data.elapsedMs);
      });

      engine.start();

      return () => {
        engine.stop();
        unsubscribe();
      };
    },
  };
}
