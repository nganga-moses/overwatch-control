import { useState, useCallback } from 'react';
import { VenueMap } from '@/components/map/VenueMap';
import { OverwatchDock, type DockPanel } from '@/components/dock/OverwatchDock';
import { VenueLibraryView } from '@/views/VenueLibraryView';

interface TacticalViewProps {
  mode: 'simulation' | 'live';
  onModeChange: (mode: 'simulation' | 'live') => void;
}

export function TacticalView({ mode, onModeChange }: TacticalViewProps) {
  const [activePanel, setActivePanel] = useState<DockPanel>('map');
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);

  const handlePanelSelect = useCallback((panel: DockPanel) => {
    setActivePanel(panel);
  }, []);

  return (
    <div className="relative h-full bg-ow-bg overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-50 titlebar-drag h-8" />

      <VenueMap />

      {activePanel !== 'map' && (
        <div className="absolute inset-0 z-30 flex flex-col pt-8 pb-[188px]">
          {activePanel === 'assets' && <VenueLibraryView />}
          {activePanel !== 'assets' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <span className="text-ow-text-dim text-sm font-mono uppercase tracking-widest">
                  {activePanel}
                </span>
                <p className="text-ow-text-muted text-xs mt-1">Coming soon</p>
              </div>
            </div>
          )}
        </div>
      )}

      <OverwatchDock
        activePanel={activePanel}
        onPanelSelect={handlePanelSelect}
        mode={mode}
        onModeChange={onModeChange}
        selectedDroneId={selectedDroneId}
        onSelectDrone={setSelectedDroneId}
      />
    </div>
  );
}
