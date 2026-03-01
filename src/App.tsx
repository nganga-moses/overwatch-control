import { useState, useEffect } from 'react';
import { TacticalView } from './views/TacticalView';
import { SimulationEngine } from './data/simulation/engine';
import { createSimulationProvider } from './data/simulation-provider';
import { createIPCProvider } from './data/ipc-provider';

type DataMode = 'simulation' | 'live';

interface AppProps {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  isElectron: boolean;
}

export default function App({ mode, onModeChange, isElectron }: AppProps) {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (mode === 'simulation') {
      const engine = SimulationEngine.getInstance();
      const provider = createSimulationProvider(engine);
      cleanup = provider.start();
    } else if (isElectron) {
      const provider = createIPCProvider();
      cleanup = provider.start();
    }

    return () => cleanup?.();
  }, [mode, isElectron]);

  return (
    <div className="h-full">
      <TacticalView mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
