import { useState, useEffect } from 'react';
import { TacticalView } from './views/TacticalView';
import SetupWizard from './views/SetupWizard';
import OperatorLogin from './views/OperatorLogin';
import { SimulationEngine } from './data/simulation/engine';
import { createSimulationProvider } from './data/simulation-provider';
import { createIPCProvider } from './data/ipc-provider';
import { useOverwatchStore } from './shared/store/overwatch-store';

type DataMode = 'simulation' | 'live';
type AppScreen = 'loading' | 'setup' | 'login' | 'tactical';

interface AppProps {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  isElectron: boolean;
}

const api = (window as any).electronAPI;

export default function App({ mode, onModeChange, isElectron }: AppProps) {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const setActiveOperator = useOverwatchStore((s) => s.setActiveOperator);

  useEffect(() => {
    if (!isElectron || !api?.auth) {
      setScreen('tactical');
      return;
    }

    api.auth.isActivated().then((activated: boolean) => {
      setScreen(activated ? 'login' : 'setup');
    });
  }, [isElectron]);

  useEffect(() => {
    if (screen !== 'tactical') return;
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
  }, [mode, isElectron, screen]);

  if (screen === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d1117]">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (screen === 'setup') {
    return <SetupWizard onComplete={() => setScreen('login')} />;
  }

  if (screen === 'login') {
    return (
      <OperatorLogin
        onLogin={(op) => {
          setActiveOperator(op);
          setScreen('tactical');
        }}
      />
    );
  }

  return (
    <div className="h-full">
      <TacticalView mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
