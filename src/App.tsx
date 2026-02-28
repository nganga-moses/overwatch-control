import { useState, useEffect } from 'react';
import { Shield, Map, Box, Radio } from 'lucide-react';
import { TacticalView } from './views/TacticalView';
import { useOverwatchStore } from './shared/store/overwatch-store';
import { SimulationEngine } from './data/simulation/engine';
import { createSimulationProvider } from './data/simulation-provider';
import { createIPCProvider } from './data/ipc-provider';

type View = 'tactical' | 'venues' | 'assets';
type DataMode = 'simulation' | 'live';

interface AppProps {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  isElectron: boolean;
}

const NAV_ITEMS: { id: View; label: string; icon: typeof Shield }[] = [
  { id: 'tactical', label: 'Tactical', icon: Shield },
  { id: 'venues', label: 'Venues', icon: Map },
  { id: 'assets', label: 'Assets', icon: Box },
];

export default function App({ mode, onModeChange, isElectron }: AppProps) {
  const [activeView, setActiveView] = useState<View>('tactical');

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
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="flex flex-col w-14 bg-ow-surface border-r border-ow-border">
        <div className="titlebar-drag h-10" />

        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={`titlebar-no-drag flex flex-col items-center justify-center py-3 text-[10px] transition-colors ${
                active
                  ? 'text-ow-accent bg-ow-accent-bg'
                  : 'text-ow-text-muted hover:text-ow-text hover:bg-ow-surface-2'
              }`}
              title={label}
            >
              <Icon size={20} />
              <span className="mt-1">{label}</span>
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Mode toggle */}
        <button
          onClick={() =>
            onModeChange(mode === 'simulation' ? 'live' : 'simulation')
          }
          className={`titlebar-no-drag flex flex-col items-center justify-center py-3 text-[10px] transition-colors ${
            mode === 'simulation'
              ? 'text-ow-warning'
              : 'text-ow-safe'
          } hover:bg-ow-surface-2`}
          title={mode === 'simulation' ? 'Simulation Mode' : 'Live Mode'}
        >
          <Radio size={20} />
          <span className="mt-1">{mode === 'simulation' ? 'SIM' : 'LIVE'}</span>
        </button>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {activeView === 'tactical' && <TacticalView />}
        {activeView === 'venues' && (
          <div className="flex items-center justify-center h-full text-ow-text-muted">
            Venue Management — Coming Soon
          </div>
        )}
        {activeView === 'assets' && (
          <div className="flex items-center justify-center h-full text-ow-text-muted">
            Asset Management — Coming Soon
          </div>
        )}
      </main>
    </div>
  );
}
