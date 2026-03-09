import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Rocket } from 'lucide-react';
import { VenueStep } from './steps/VenueStep';
import { KitStep } from './steps/KitStep';
import { PrincipalStep } from './steps/PrincipalStep';
import { ProtectionDetailStep } from './steps/ProtectionDetailStep';
import { CoverageStep } from './steps/CoverageStep';
import { OperationalParamsStep } from './steps/OperationalParamsStep';
import { ReviewStep } from './steps/ReviewStep';

const STEPS = [
  { id: 'venue', label: 'Venue', number: 1 },
  { id: 'kit', label: 'Kit Assignment', number: 2 },
  { id: 'principal', label: 'Principal', number: 3 },
  { id: 'detail', label: 'Protection Detail', number: 4 },
  { id: 'coverage', label: 'Coverage', number: 5 },
  { id: 'params', label: 'Parameters', number: 6 },
  { id: 'review', label: 'Review & Save', number: 7 },
] as const;

export interface BriefingData {
  venueId: string | null;
  venueName: string;
  venueType: string;
  venueLat: number | null;
  venueLng: number | null;
  assignedKitIds: string[];
  kitSummary: { tier1: number; tier2: number; total: number };
  principalId: string | null;
  principalCodename: string;
  principalBleBeaconId: string | null;
  arrivalTime: string;
  departureTime: string;
  entryZoneId: string | null;
  agents: { id: string; name: string; callsign: string; role: string }[];
  zonePriorities: Record<string, string>;
  zoneAlertSensitivity: Record<string, string>;
  restrictedZoneIds: string[];
  plannedStart: string;
  plannedEnd: string;
  environment: string;
  autonomyLevel: string;
  hitlRules: { critical: boolean; warning: boolean; info: boolean };
  operationName: string;
  operationType: string;
}

const DEFAULT_BRIEFING: BriefingData = {
  venueId: null,
  venueName: '',
  venueType: 'indoor',
  venueLat: null,
  venueLng: null,
  assignedKitIds: [],
  kitSummary: { tier1: 0, tier2: 0, total: 0 },
  principalId: null,
  principalCodename: '',
  principalBleBeaconId: null,
  arrivalTime: '',
  departureTime: '',
  entryZoneId: null,
  agents: [],
  zonePriorities: {},
  zoneAlertSensitivity: {},
  restrictedZoneIds: [],
  plannedStart: '',
  plannedEnd: '',
  environment: 'indoor',
  autonomyLevel: 'recommend',
  hitlRules: { critical: true, warning: true, info: false },
  operationName: '',
  operationType: 'static_venue',
};

interface BriefingWizardProps {
  operationId: string;
  onClose: () => void;
  onDeployed: () => void;
}

export function BriefingWizard({ operationId, onClose, onDeployed }: BriefingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<BriefingData>({ ...DEFAULT_BRIEFING });
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    window.electronAPI?.operations.get(operationId).then((op: any) => {
      if (op) {
        setData((prev) => ({
          ...prev,
          operationName: op.name || prev.operationName,
          operationType: op.type || prev.operationType,
          venueId: op.venue_id || prev.venueId,
          environment: op.environment || prev.environment,
          plannedStart: op.planned_start || prev.plannedStart,
          plannedEnd: op.planned_end || prev.plannedEnd,
        }));
      }
    });
  }, [operationId]);

  function updateData(patch: Partial<BriefingData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 0: return !!data.venueId;
      case 1: return data.assignedKitIds.length > 0;
      case 2: return true;
      case 3: return true;
      case 4: return true;
      case 5: return !!data.plannedStart;
      case 6: return true;
      default: return true;
    }
  }

  async function handleSaveBriefing() {
    setDeploying(true);
    try {
      await window.electronAPI.operations.update(operationId, {
        venueId: data.venueId,
        name: data.operationName || `Mission ${new Date().toLocaleDateString()}`,
        type: data.operationType,
        environment: data.environment,
        principalId: data.principalId,
        assignedKitIds: data.assignedKitIds,
        plannedStart: data.plannedStart,
        plannedEnd: data.plannedEnd,
        briefingJson: data,
      });

      await window.electronAPI.operations.startBriefing(operationId);
      onDeployed();
    } catch (err) {
      console.error('Save briefing failed:', err);
    } finally {
      setDeploying(false);
    }
  }

  const StepComponent = [
    VenueStep, KitStep, PrincipalStep, ProtectionDetailStep,
    CoverageStep, OperationalParamsStep, ReviewStep,
  ][currentStep];

  return (
    <div className="fixed inset-0 z-[100] bg-ow-bg flex flex-col">
      {/* Titlebar drag region */}
      <div className="shrink-0 h-8 titlebar-drag" />
      {/* Header with step indicator */}
      <div className="shrink-0 border-b border-ow-border bg-ow-surface/50 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <Rocket size={16} className="text-ow-accent" />
            <h1 className="text-sm font-semibold text-ow-text">Pre-Deployment Briefing</h1>
            <span className="text-[10px] text-ow-text-dim font-mono">
              {data.operationName || 'New Operation'}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-ow-surface text-ow-text-dim hover:text-ow-text transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex px-4 pb-2 gap-1">
          {STEPS.map((step, i) => (
            <button
              key={step.id}
              onClick={() => i <= currentStep && setCurrentStep(i)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: i === currentStep ? '#2dd4bf15' : i < currentStep ? '#3fb95010' : 'transparent',
                color: i === currentStep ? '#2dd4bf' : i < currentStep ? '#3fb950' : '#6e7681',
                border: `1px solid ${i === currentStep ? '#2dd4bf30' : 'transparent'}`,
                cursor: i <= currentStep ? 'pointer' : 'default',
                opacity: i > currentStep ? 0.5 : 1,
              }}
            >
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
                style={{
                  background: i < currentStep ? '#3fb950' : i === currentStep ? '#2dd4bf' : '#30363d',
                  color: i <= currentStep ? '#0d1117' : '#6e7681',
                }}
              >
                {i < currentStep ? '✓' : step.number}
              </span>
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {StepComponent && <StepComponent data={data} onChange={updateData} />}
        </div>
      </div>

      {/* Footer navigation */}
      <div className="shrink-0 border-t border-ow-border bg-ow-surface/50 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-ow-text-dim border border-ow-border hover:text-ow-text hover:bg-ow-surface disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={14} /> Back
        </button>

        <span className="text-[10px] text-ow-text-dim font-mono">
          Step {currentStep + 1} of {STEPS.length}
        </span>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={() => setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canProceed()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 disabled:opacity-30 transition-all"
          >
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleSaveBriefing}
            disabled={deploying || !data.venueId}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold bg-ow-accent text-ow-bg hover:brightness-110 disabled:opacity-30 transition-all"
          >
            <Rocket size={14} /> {deploying ? 'Saving...' : 'Save Briefing'}
          </button>
        )}
      </div>
    </div>
  );
}
