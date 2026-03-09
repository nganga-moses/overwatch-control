import { useState, useCallback } from 'react';
import { VenueMap } from '@/components/map/VenueMap';
import { OverwatchDock, type DockPanel } from '@/components/dock/OverwatchDock';
import { CameraPanel } from '@/components/camera/CameraPanel';
import { VenueLibraryView } from '@/views/VenueLibraryView';
import { MissionsView } from '@/views/MissionsView';
import { AssetManagementView } from '@/views/AssetManagementView';
import { SettingsView } from '@/views/SettingsView';
import { BriefingWizard } from '@/components/briefing/BriefingWizard';
import { IntelligencePanel } from '@/components/intelligence/IntelligencePanel';
import { VoiceButton } from '@/components/intelligence/VoiceButton';
import { AlertToasts } from '@/components/intelligence/AlertToasts';
import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { useIntelligenceStore } from '@/shared/store/intelligence-store';
import { SimulationEngine } from '@/data/simulation/engine';
import { Crosshair, Rocket } from 'lucide-react';

interface TacticalViewProps {
  mode: 'simulation' | 'live';
  onModeChange: (mode: 'simulation' | 'live') => void;
  onLogout: () => void;
}

export function TacticalView({ mode, onModeChange, onLogout }: TacticalViewProps) {
  const [activePanel, setActivePanel] = useState<DockPanel>('map');
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [briefingOpId, setBriefingOpId] = useState<string | null>(null);
  const activeMission = useOverwatchStore((s) => s.activeMission);

  const handlePanelSelect = useCallback((panel: DockPanel) => {
    setActivePanel(panel);
  }, []);

  const handleStartMission = useCallback((opId: string) => {
    if (mode === 'simulation') {
      const engine = SimulationEngine.getInstance();
      engine.startMission();
    }
    useOverwatchStore.getState().setActiveMission({
      id: opId,
      name: 'Active Mission',
      status: 'active',
      venueId: '',
      environment: null,
    });
    setActivePanel('map');
  }, [mode]);

  const handleEndMission = useCallback(() => {
    if (mode === 'simulation') {
      const engine = SimulationEngine.getInstance();
      engine.endMission();
    }
    useOverwatchStore.getState().setActiveMission(null);
  }, [mode]);

  const handleOpenBriefing = useCallback((opId: string) => {
    setBriefingOpId(opId);
  }, []);

  const showMap = activePanel === 'map' && activeMission;

  const panelOpen = useIntelligenceStore((s) => s.panelOpen);

  return (
    <div className="relative h-full bg-ow-bg overflow-hidden flex">
      {/* Main area (map + panels + dock) */}
      <div className="relative flex-1 min-w-0 h-full overflow-hidden">
        <div className="absolute top-0 left-0 right-0 z-50 titlebar-drag h-8" />

        {showMap ? (
          <VenueMap />
        ) : activePanel === 'map' ? (
          <NoMissionState onGoToMissions={() => setActivePanel('missions')} />
        ) : null}

        {activePanel === 'feed' && (
          <div className="absolute inset-0 z-30 flex flex-col pt-8 pb-[188px] min-h-0">
            <CameraPanel
              selectedDroneId={selectedDroneId}
              onSelectDrone={setSelectedDroneId}
              className="flex-1 min-h-0 w-full"
            />
          </div>
        )}

        {activePanel !== 'map' && activePanel !== 'feed' && (
          <div className="absolute inset-0 z-30 flex flex-col pt-8 pb-[188px]">
            {activePanel === 'assets' && <VenueLibraryView />}
            {activePanel === 'kit_mgmt' && <AssetManagementView />}
            {activePanel === 'missions' && (
              <MissionsView
                onStartMission={handleStartMission}
                onEndMission={handleEndMission}
                onOpenBriefing={handleOpenBriefing}
              />
            )}
            {activePanel === 'settings' && <SettingsView />}
            {activePanel === 'coverage' && (
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
          onLogout={onLogout}
          selectedDroneId={selectedDroneId}
          onSelectDrone={setSelectedDroneId}
        />
      </div>

      {/* Right side: Control panel + camera (camera hidden when Feed is main — feed shown in main area) */}
      <div className="flex shrink-0 h-full">
        {panelOpen && <IntelligencePanel />}
        {activePanel !== 'feed' && (
          <CameraPanel selectedDroneId={selectedDroneId} onSelectDrone={setSelectedDroneId} />
        )}
      </div>

      {/* Floating Voice Button (bottom center) */}
      <VoiceButton />

      {/* Alert popups (visible on screen; Intel panel Alerts tab is for history) */}
      <AlertToasts />

      {briefingOpId && (
        <BriefingWizard
          operationId={briefingOpId}
          onClose={() => { setBriefingOpId(null); setActivePanel('missions'); }}
          onDeployed={() => {
            setBriefingOpId(null);
            handleStartMission(briefingOpId);
          }}
        />
      )}
    </div>
  );
}

function NoMissionState({ onGoToMissions }: { onGoToMissions: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pb-[188px]">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-ow-surface border border-ow-border flex items-center justify-center">
          <Crosshair size={36} className="text-ow-text-dim" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ow-text">No Active Mission</h2>
          <p className="text-xs text-ow-text-dim mt-1 max-w-xs mx-auto">
            Plan a mission briefing and deploy to activate the tactical view with live drone feeds and map overlays.
          </p>
        </div>
        <button
          onClick={onGoToMissions}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 transition-all"
        >
          <Rocket size={14} />
          Missions
        </button>
      </div>
    </div>
  );
}
