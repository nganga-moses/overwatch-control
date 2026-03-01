import { useState, useCallback } from 'react';
import { VenueMap } from '@/components/map/VenueMap';
import { OverwatchDock, type DockPanel } from '@/components/dock/OverwatchDock';

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
      {/* Titlebar drag region */}
      <div className="absolute top-0 left-0 right-0 z-50 titlebar-drag h-8" />

      {/* Full-bleed map */}
      <VenueMap />

      {/* Status strip + Dock — anchored to bottom */}
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
