import { useState, useEffect } from 'react';
import { Shield, Plus, Check, Bluetooth, Clock } from 'lucide-react';
import type { BriefingData } from '../BriefingWizard';

interface PrincipalRecord {
  id: string;
  codename: string;
  ble_beacon_id: string | null;
  operation_count: number;
  notes: string | null;
}

interface Props {
  data: BriefingData;
  onChange: (patch: Partial<BriefingData>) => void;
}

export function PrincipalStep({ data, onChange }: Props) {
  const [principals, setPrincipals] = useState<PrincipalRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [newCodename, setNewCodename] = useState('');
  const [bleId, setBleId] = useState(data.principalBleBeaconId ?? '');

  useEffect(() => {
    window.electronAPI?.principals?.list().then((p: PrincipalRecord[]) => setPrincipals(p ?? []));
  }, []);

  function selectPrincipal(p: PrincipalRecord) {
    onChange({
      principalId: p.id,
      principalCodename: p.codename,
      principalBleBeaconId: p.ble_beacon_id,
    });
    setBleId(p.ble_beacon_id ?? '');
  }

  async function createPrincipal() {
    if (!newCodename.trim()) return;
    try {
      const p = await window.electronAPI.principals.create({
        name: newCodename.trim(),
        codename: newCodename.trim(),
      });
      setPrincipals((prev) => [...prev, p]);
      selectPrincipal(p);
      setCreating(false);
      setNewCodename('');
    } catch (err) {
      console.error('Failed to create principal:', err);
    }
  }

  useEffect(() => {
    if (data.principalId) {
      onChange({ principalBleBeaconId: bleId || null });
    }
  }, [bleId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ow-text mb-1">Step 3: Principal Configuration</h2>
        <p className="text-[11px] text-ow-text-dim">Select or create the person under protection. Only codenames — no PII stored.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {principals.map((p) => {
          const selected = data.principalId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => selectPrincipal(p)}
              className="text-left rounded-lg p-3 transition-all"
              style={{
                background: selected ? '#2dd4bf10' : '#0d1117',
                border: `1px solid ${selected ? '#2dd4bf40' : '#30363d'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <Shield size={14} className={selected ? 'text-ow-accent' : 'text-ow-text-dim'} />
                <span className="text-[11px] font-medium text-ow-text flex-1">{p.codename}</span>
                {selected && <Check size={14} className="text-ow-accent" />}
              </div>
              <div className="text-[9px] text-ow-text-dim mt-1 font-mono">
                {p.operation_count} prior ops
                {p.ble_beacon_id && <span className="ml-2 text-blue-400">BLE paired</span>}
              </div>
            </button>
          );
        })}

        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg p-3 border border-dashed border-ow-border text-ow-text-dim hover:text-ow-accent hover:border-ow-accent/30 transition-colors flex flex-col items-center justify-center gap-1"
          >
            <Plus size={16} />
            <span className="text-[10px]">New Principal</span>
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim">Codename</label>
          <input
            type="text"
            value={newCodename}
            onChange={(e) => setNewCodename(e.target.value)}
            placeholder="e.g., EAGLE, PHOENIX"
            className="w-full bg-ow-bg border border-ow-border rounded px-3 py-2 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={createPrincipal} className="px-3 py-1.5 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110">Create</button>
            <button onClick={() => { setCreating(false); setNewCodename(''); }} className="px-3 py-1.5 rounded text-xs text-ow-text-dim border border-ow-border hover:text-ow-text">Cancel</button>
          </div>
        </div>
      )}

      {data.principalId && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
            <Bluetooth size={12} className="text-blue-400" /> BLE Beacon Pairing
          </h3>
          <input
            type="text"
            value={bleId}
            onChange={(e) => setBleId(e.target.value)}
            placeholder="Enter BLE beacon ID or scan..."
            className="w-full bg-ow-bg border border-ow-border rounded px-3 py-2 text-xs text-ow-text font-mono placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
          />
          <p className="text-[9px] text-ow-text-dim">The BLE beacon allows passive tracking of the principal's location across zones.</p>
        </div>
      )}

      {data.principalId && (
        <div className="bg-ow-surface rounded-lg border border-ow-border p-4 space-y-3">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
            <Clock size={12} /> Arrival / Departure Plan
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] text-ow-text-dim mb-0.5">Expected Arrival</label>
              <input
                type="datetime-local"
                value={data.arrivalTime}
                onChange={(e) => onChange({ arrivalTime: e.target.value })}
                className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
              />
            </div>
            <div>
              <label className="block text-[9px] text-ow-text-dim mb-0.5">Expected Departure</label>
              <input
                type="datetime-local"
                value={data.departureTime}
                onChange={(e) => onChange({ departureTime: e.target.value })}
                className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
