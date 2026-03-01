import { useOverwatchStore } from '@/shared/store/overwatch-store';
import type { DataProvider } from './simulation-provider';

declare global {
  interface Window {
    electronAPI: {
      subscribe: (callback: (data: unknown) => void) => () => void;
      disconnect: () => void;
      worldModel: Record<string, (...args: any[]) => Promise<any>>;
      venues: Record<string, (...args: any[]) => Promise<any>>;
      assets: Record<string, (...args: any[]) => Promise<any>>;
      comms: Record<string, (...args: any[]) => any>;
      sync: {
        getStatus: () => Promise<any>;
        triggerSync: () => Promise<any>;
        bootstrap: () => Promise<any>;
        fetchKit: (serial: string) => Promise<any>;
        onStatusUpdate: (callback: (status: unknown) => void) => () => void;
        onBootstrapped: (callback: () => void) => () => void;
      };
    };
  }
}

export function createIPCProvider(): DataProvider {
  return {
    start: () => {
      if (!window.electronAPI) {
        console.warn('[IPC Provider] electronAPI not available');
        return () => {};
      }

      const unsubscribe = window.electronAPI.subscribe((data: any) => {
        const store = useOverwatchStore.getState();

        if (data?.type === 'drones') {
          store.setDrones(data.payload);
        } else if (data?.type === 'venue') {
          store.setVenue(data.payload);
        } else if (data?.type === 'principal') {
          store.setPrincipal(data.payload);
        } else if (data?.type === 'alert') {
          store.addAlert(data.payload);
        }
      });

      let unsubSyncStatus: (() => void) | undefined;

      if (window.electronAPI.sync) {
        window.electronAPI.sync.getStatus().then((status: any) => {
          if (status) useOverwatchStore.getState().setSyncStatus(status);
        });

        unsubSyncStatus = window.electronAPI.sync.onStatusUpdate((status: any) => {
          useOverwatchStore.getState().setSyncStatus(status);
        });
      }

      return () => {
        unsubscribe();
        unsubSyncStatus?.();
        window.electronAPI.disconnect();
      };
    },
  };
}
