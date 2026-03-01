import { useState } from 'react';
import { Plus, Trash2, Save, X, Layers } from 'lucide-react';

interface ZoneEditorProps {
  venueId: string;
  zone?: {
    id: string;
    name: string;
    type: string;
    environment: string;
    tier_requirement: string;
    floor: number;
    priority: number;
    polygon_json: string | null;
    notes: string | null;
  };
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const ZONE_TYPES = ['room', 'corridor', 'lobby', 'stairwell', 'entrance', 'closet', 'custom'];
const ENVIRONMENTS = ['indoor', 'outdoor', 'covered', 'transition'];
const TIERS = ['tier_1', 'tier_2', 'either'];
const PRIORITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function ZoneEditor({ venueId, zone, onSave, onCancel, onDelete }: ZoneEditorProps) {
  const [name, setName] = useState(zone?.name ?? '');
  const [type, setType] = useState(zone?.type ?? 'room');
  const [environment, setEnvironment] = useState(zone?.environment ?? 'indoor');
  const [tier, setTier] = useState(zone?.tier_requirement ?? 'tier_1');
  const [floor, setFloor] = useState(zone?.floor ?? 0);
  const [priority, setPriority] = useState(zone?.priority ?? 5);
  const [notes, setNotes] = useState(zone?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const isNew = !zone;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        await window.electronAPI.venues.createZone({
          venueId,
          name: name.trim(),
          type,
          environment,
          tierRequirement: tier,
          floor,
          priority,
          notes: notes.trim() || null,
        });
      } else {
        await window.electronAPI.venues.updateZone(zone.id, {
          name: name.trim(),
          type,
          environment,
          tier_requirement: tier,
          floor,
          priority,
          notes: notes.trim() || null,
        });
      }
      onSave();
    } catch (err) {
      console.error('Failed to save zone:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!zone) return;
    try {
      await window.electronAPI.venues.deleteZone(zone.id);
      onDelete?.();
    } catch (err) {
      console.error('Failed to delete zone:', err);
    }
  }

  return (
    <div className="rounded border border-ow-border bg-ow-surface p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
          <Layers size={10} />
          {isNew ? 'New Zone' : 'Edit Zone'}
        </h4>
        <button onClick={onCancel} className="text-ow-text-dim hover:text-ow-text">
          <X size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
            placeholder="Zone name"
          />
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          >
            {ZONE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Environment</label>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          >
            {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Tier</label>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          >
            {TIERS.map((t) => <option key={t} value={t}>{t === 'either' ? 'Either' : t === 'tier_1' ? 'Tier 1' : 'Tier 2'}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Floor</label>
          <input
            type="number"
            value={floor}
            onChange={(e) => setFloor(parseInt(e.target.value, 10) || 0)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          />
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10))}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div>
          {!isNew && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-[9px] text-ow-text-dim hover:text-ow-danger transition-colors"
            >
              <Trash2 size={9} /> Delete zone
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-2 py-1 rounded text-[10px] text-ow-text-dim hover:text-ow-text border border-ow-border"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-ow-accent text-ow-bg hover:brightness-110 transition-all disabled:opacity-50"
          >
            <Save size={9} /> {saving ? 'Saving...' : isNew ? 'Create' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );
}
