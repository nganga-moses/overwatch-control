import { useState, useEffect } from 'react';
import { Target, Trash2, Save, X, BarChart3 } from 'lucide-react';

interface PerchPointEditorProps {
  zoneId: string;
  point?: {
    id: string;
    name: string;
    surface_type: string;
    position_lat: number;
    position_lng: number;
    position_alt: number;
    heading_deg: number | null;
    fov_coverage_deg: number;
    suitability_score: number;
  };
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const SURFACE_TYPES = ['wall', 'ledge', 'beam', 'ceiling', 'pipe', 'railing', 'post', 'custom'];

export function PerchPointEditor({ zoneId, point, onSave, onCancel, onDelete }: PerchPointEditorProps) {
  const [name, setName] = useState(point?.name ?? '');
  const [surfaceType, setSurfaceType] = useState(point?.surface_type ?? 'wall');
  const [lat, setLat] = useState(point?.position_lat ?? 0);
  const [lng, setLng] = useState(point?.position_lng ?? 0);
  const [alt, setAlt] = useState(point?.position_alt ?? 3);
  const [heading, setHeading] = useState(point?.heading_deg ?? 0);
  const [fov, setFov] = useState(point?.fov_coverage_deg ?? 120);
  const [suitability, setSuitability] = useState(point?.suitability_score ?? 0.5);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{
    totalAttempts: number;
    successRate: number;
    avgHoldDurationS: number | null;
    failureModes: Record<string, number>;
  } | null>(null);

  const isNew = !point || !point.id;

  useEffect(() => {
    if (point?.id) {
      window.electronAPI.venues.getPerchPointStats(point.id).then(setStats).catch(() => {});
    }
  }, [point?.id]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        await window.electronAPI.venues.createPerchPoint({
          zoneId,
          name: name.trim(),
          surfaceType,
          position: { lat, lng, alt },
          headingDeg: heading,
          fovCoverageDeg: fov,
          suitabilityScore: suitability,
        });
      } else {
        await window.electronAPI.venues.updatePerchPoint(point!.id, {
          name: name.trim(),
          surfaceType,
          positionLat: lat,
          positionLng: lng,
          positionAlt: alt,
          headingDeg: heading,
          fovCoverageDeg: fov,
          suitabilityScore: suitability,
        });
      }
      onSave();
    } catch (err) {
      console.error('Failed to save perch point:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!point) return;
    try {
      await window.electronAPI.venues.deletePerchPoint(point.id);
      onDelete?.();
    } catch (err) {
      console.error('Failed to delete perch point:', err);
    }
  }

  return (
    <div className="rounded border border-ow-border bg-ow-surface p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1.5">
          <Target size={10} />
          {isNew ? 'New Perch Point' : 'Edit Perch Point'}
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
            placeholder="e.g. East wall mid"
          />
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Surface</label>
          <select
            value={surfaceType}
            onChange={(e) => setSurfaceType(e.target.value)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          >
            {SURFACE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Height (m)</label>
          <input
            type="number"
            step="0.1"
            value={alt}
            onChange={(e) => setAlt(parseFloat(e.target.value) || 0)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          />
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Heading (deg)</label>
          <input
            type="number"
            min="0"
            max="360"
            value={heading}
            onChange={(e) => setHeading(parseInt(e.target.value, 10) || 0)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          />
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">FOV (deg)</label>
          <input
            type="number"
            min="30"
            max="360"
            value={fov}
            onChange={(e) => setFov(parseInt(e.target.value, 10) || 120)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          />
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Suitability</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={suitability}
            onChange={(e) => setSuitability(parseFloat(e.target.value))}
            className="w-full"
          />
          <span className="text-[8px] text-ow-text-dim font-mono">{Math.round(suitability * 100)}%</span>
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Latitude</label>
          <input
            type="number"
            step="0.000001"
            value={lat}
            onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          />
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-0.5">Longitude</label>
          <input
            type="number"
            step="0.000001"
            value={lng}
            onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
            className="w-full bg-ow-bg border border-ow-border rounded px-2 py-1 text-[10px] text-ow-text focus:outline-none focus:border-ow-accent"
          />
        </div>
      </div>

      {/* Assessment history */}
      {stats && stats.totalAttempts > 0 && (
        <div className="rounded border border-ow-border bg-ow-bg p-2 space-y-1">
          <h5 className="text-[9px] font-bold uppercase tracking-wider text-ow-text-dim flex items-center gap-1">
            <BarChart3 size={9} /> Assessment History
          </h5>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-semibold text-ow-text">{stats.totalAttempts}</p>
              <p className="text-[8px] text-ow-text-dim">attempts</p>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{
                color: stats.successRate > 0.8 ? '#3fb950' : stats.successRate > 0.5 ? '#d29922' : '#f85149',
              }}>
                {Math.round(stats.successRate * 100)}%
              </p>
              <p className="text-[8px] text-ow-text-dim">success</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ow-text">
                {stats.avgHoldDurationS != null ? `${stats.avgHoldDurationS.toFixed(0)}s` : '--'}
              </p>
              <p className="text-[8px] text-ow-text-dim">avg hold</p>
            </div>
          </div>
          {Object.keys(stats.failureModes).length > 0 && (
            <div className="text-[8px] text-ow-text-dim mt-1">
              <span className="font-bold">Failures:</span>{' '}
              {Object.entries(stats.failureModes).map(([mode, count]) => `${mode}(${count})`).join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div>
          {!isNew && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-[9px] text-ow-text-dim hover:text-ow-danger transition-colors"
            >
              <Trash2 size={9} /> Delete
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
