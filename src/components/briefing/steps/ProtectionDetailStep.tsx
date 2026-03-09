import { useState } from 'react';
import { UserPlus, X, Shield } from 'lucide-react';
import type { BriefingData } from '../BriefingWizard';

const ROLES = ['point', 'advance', 'rear', 'overwatch', 'driver', 'medic'] as const;

interface Props {
  data: BriefingData;
  onChange: (patch: Partial<BriefingData>) => void;
}

export function ProtectionDetailStep({ data, onChange }: Props) {
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [role, setRole] = useState<string>('point');

  async function addAgent() {
    if (!callsign.trim()) return;
    try {
      const agent = await window.electronAPI.agents.create({
        name: name.trim() || callsign.trim(),
        callsign: callsign.trim(),
        role,
      });
      onChange({
        agents: [...data.agents, { id: agent.id, name: agent.name, callsign: agent.callsign, role: agent.role ?? role }],
      });
      setName('');
      setCallsign('');
      setRole('point');
    } catch (err) {
      console.error('Failed to create agent:', err);
    }
  }

  function removeAgent(id: string) {
    onChange({ agents: data.agents.filter((a) => a.id !== id) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ow-text mb-1">Step 4: Protection Detail</h2>
        <p className="text-[11px] text-ow-text-dim">Register security team members for this operation.</p>
      </div>

      {data.agents.length > 0 && (
        <div className="space-y-1.5">
          {data.agents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-ow-surface border border-ow-border">
              <Shield size={14} className="text-ow-accent shrink-0" />
              <span className="text-[11px] font-medium text-ow-text flex-1">{agent.callsign}</span>
              <span className="text-[9px] font-mono text-ow-text-dim uppercase px-1.5 py-0.5 rounded bg-ow-bg">{agent.role}</span>
              <button onClick={() => removeAgent(agent.id)} className="text-ow-text-dim hover:text-ow-danger transition-colors">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
          <UserPlus size={12} /> Add Team Member
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[9px] text-ow-text-dim mb-0.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
            />
          </div>
          <div>
            <label className="block text-[9px] text-ow-text-dim mb-0.5">Callsign</label>
            <input
              type="text"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="e.g., ALPHA-1"
              className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
            />
          </div>
          <div>
            <label className="block text-[9px] text-ow-text-dim mb-0.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={addAgent}
          disabled={!callsign.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 disabled:opacity-30 transition-all"
        >
          <UserPlus size={12} /> Add
        </button>
      </div>

      {data.agents.length === 0 && (
        <p className="text-[10px] text-ow-text-dim text-center py-4">
          No agents added yet. You can skip this step if the protection detail is not finalized.
        </p>
      )}
    </div>
  );
}
