import { useState, useEffect } from 'react';
import { Search, Building2, TreePine, Layers, MapPin, Check } from 'lucide-react';
import type { BriefingData } from '../BriefingWizard';

interface VenueRecord {
  id: string;
  name: string;
  type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  operation_count: number;
}

interface Props {
  data: BriefingData;
  onChange: (patch: Partial<BriefingData>) => void;
}

const TYPE_ICONS = { indoor: Building2, outdoor: TreePine, mixed: Layers };

export function VenueStep({ data, onChange }: Props) {
  const [venues, setVenues] = useState<VenueRecord[]>([]);
  const [search, setSearch] = useState('');
  const [opName, setOpName] = useState(data.operationName);
  const [opType, setOpType] = useState(data.operationType);

  useEffect(() => {
    window.electronAPI?.venues.list({ search }).then((v: VenueRecord[]) => setVenues(v ?? []));
  }, [search]);

  function selectVenue(v: VenueRecord) {
    onChange({
      venueId: v.id,
      venueName: v.name,
      venueType: v.type,
      venueLat: v.lat,
      venueLng: v.lng,
      environment: v.type,
    });
  }

  useEffect(() => {
    onChange({ operationName: opName, operationType: opType });
  }, [opName, opType]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ow-text mb-1">Step 1: Operation & Venue</h2>
        <p className="text-[11px] text-ow-text-dim">Name your operation and select the venue.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-1">Operation Name</label>
          <input
            type="text"
            value={opName}
            onChange={(e) => setOpName(e.target.value)}
            placeholder="e.g., CEO Dinner Security"
            className="w-full bg-ow-surface border border-ow-border rounded px-3 py-2 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-1">Operation Type</label>
          <select
            value={opType}
            onChange={(e) => setOpType(e.target.value)}
            className="w-full bg-ow-surface border border-ow-border rounded px-3 py-2 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
          >
            <option value="static_venue">Static Venue</option>
            <option value="mobile_principal">Mobile Principal</option>
            <option value="perimeter">Perimeter</option>
            <option value="outdoor_event">Outdoor Event</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[9px] uppercase tracking-wider text-ow-text-dim mb-2">Select Venue</label>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ow-text-dim" />
          <input
            type="text"
            placeholder="Search venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-ow-surface border border-ow-border rounded pl-8 pr-3 py-2 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
          {venues.map((v) => {
            const Icon = TYPE_ICONS[v.type as keyof typeof TYPE_ICONS] ?? Building2;
            const selected = data.venueId === v.id;
            return (
              <button
                key={v.id}
                onClick={() => selectVenue(v)}
                className="text-left rounded-lg p-3 transition-all"
                style={{
                  background: selected ? '#2dd4bf10' : '#0d1117',
                  border: `1px solid ${selected ? '#2dd4bf40' : '#30363d'}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className={selected ? 'text-ow-accent' : 'text-ow-text-dim'} />
                  <span className="text-[11px] font-medium text-ow-text flex-1 truncate">{v.name}</span>
                  {selected && <Check size={14} className="text-ow-accent" />}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-ow-text-dim">
                  <span className="uppercase">{v.type}</span>
                  {v.address && <span className="flex items-center gap-0.5 truncate"><MapPin size={8} />{v.address}</span>}
                  <span>{v.operation_count} ops</span>
                </div>
              </button>
            );
          })}
          {venues.length === 0 && (
            <p className="col-span-2 text-center text-[10px] text-ow-text-dim py-6">No venues found. Create one in the Venue Library first.</p>
          )}
        </div>
      </div>
    </div>
  );
}
