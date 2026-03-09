import { useState, useEffect, useCallback } from 'react';
import { VenueDetail } from '@/components/venues/VenueDetail';
import {
  Search, Plus, Building2, TreePine, Layers, X,
  Cloud, CloudOff, HardDrive,
} from 'lucide-react';

interface VenueRecord {
  id: string;
  name: string;
  type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  floor_plan_path: string | null;
  floor_plan_blob_key: string | null;
  floor_plan_cached: number;
  floor_plan_local_path: string | null;
  floor_count: number;
  operation_count: number;
  notes: string | null;
}

type TypeFilter = 'all' | 'indoor' | 'outdoor' | 'mixed';

const TYPE_ICONS: Record<string, typeof Building2> = {
  indoor: Building2,
  outdoor: TreePine,
  mixed: Layers,
};

export function VenueLibraryView() {
  const [venues, setVenues] = useState<VenueRecord[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadVenues = useCallback(async () => {
    if (!window.electronAPI?.venues) return;
    const filters: Record<string, string> = {};
    if (typeFilter !== 'all') filters.type = typeFilter;
    if (search) filters.search = search;
    const list = await window.electronAPI.venues.list(filters);
    setVenues(list ?? []);
  }, [search, typeFilter]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  const selectedVenue = venues.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="flex-1 flex bg-ow-bg/95 backdrop-blur-sm overflow-hidden">
      {/* Left: venue list */}
      <div className="w-[320px] shrink-0 flex flex-col border-r border-ow-border">
        <div className="p-3 space-y-2 border-b border-ow-border">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ow-text-dim" />
              <input
                type="text"
                placeholder="Search venues..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-ow-surface border border-ow-border rounded pl-8 pr-3 py-1.5 text-xs text-ow-text placeholder:text-ow-text-dim focus:outline-none focus:border-ow-accent"
              />
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1.5 rounded bg-ow-accent/10 border border-ow-accent/30 text-ow-accent hover:bg-ow-accent/20 transition-colors"
              title="Add venue"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex gap-1">
            {(['all', 'indoor', 'outdoor', 'mixed'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                style={{
                  background: typeFilter === t ? '#2dd4bf15' : 'transparent',
                  color: typeFilter === t ? '#2dd4bf' : '#6e7681',
                  border: `1px solid ${typeFilter === t ? '#2dd4bf30' : 'transparent'}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {venues.length === 0 && (
            <div className="text-center py-8 text-ow-text-dim text-xs">
              No venues found
            </div>
          )}
          {venues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              selected={venue.id === selectedId}
              onClick={() => setSelectedId(venue.id === selectedId ? null : venue.id)}
            />
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 min-w-0 relative">
        {selectedVenue ? (
          <VenueDetail venue={selectedVenue} onUpdate={loadVenues} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-ow-text-dim">
              <Building2 size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs">Select a venue to view details</p>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateVenueModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadVenues();
          }}
        />
      )}
    </div>
  );
}

function VenueCard({
  venue,
  selected,
  onClick,
}: {
  venue: VenueRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = TYPE_ICONS[venue.type] ?? Building2;
  const zoneCount = 0; // Would need a DB query; shown as a placeholder

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2.5 rounded transition-all hover:brightness-110"
      style={{
        background: selected
          ? 'linear-gradient(180deg, #243038 0%, #1c2830 100%)'
          : 'linear-gradient(180deg, #1a2530 0%, #141e25 100%)',
        border: `1px solid ${selected ? '#2a3a3a' : '#1a2228'}`,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon size={14} className="mt-0.5 shrink-0" style={{ color: selected ? '#2dd4bf' : '#5a6a70' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-ow-text truncate">
              {venue.name}
            </span>
            <FloorPlanBadge venue={venue} />
          </div>
          {venue.address && (
            <p className="text-[9px] text-ow-text-dim truncate mt-0.5">{venue.address}</p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[9px] text-ow-text-dim font-mono">
            <span className="uppercase">{venue.type}</span>
            <span>{venue.operation_count} ops</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function FloorPlanBadge({ venue }: { venue: VenueRecord }) {
  if (venue.floor_plan_cached) {
    return <span title="Floor plan cached locally"><HardDrive size={9} style={{ color: '#3fb950' }} /></span>;
  }
  if (venue.floor_plan_blob_key) {
    return <span title="Floor plan available in cloud"><Cloud size={9} style={{ color: '#58a6ff' }} /></span>;
  }
  return <span title="No floor plan"><CloudOff size={9} style={{ color: '#6e7681' }} /></span>;
}

function CreateVenueModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('indoor');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await window.electronAPI.venues.create({
        name: name.trim(),
        type,
        address: address.trim() || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create venue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="bg-ow-surface border border-ow-border rounded-lg w-[400px] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ow-border">
          <h2 className="text-sm font-semibold text-ow-text">New Venue</h2>
          <button onClick={onClose} className="text-ow-text-dim hover:text-ow-text">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ow-text-dim mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
              placeholder="e.g. Embassy Compound Alpha"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ow-text-dim mb-1">Type</label>
            <div className="flex gap-2">
              {['indoor', 'outdoor', 'mixed'].map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{
                    background: type === t ? '#2dd4bf15' : '#0d1117',
                    color: type === t ? '#2dd4bf' : '#6e7681',
                    border: `1px solid ${type === t ? '#2dd4bf30' : '#30363d'}`,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ow-text-dim mb-1">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-ow-bg border border-ow-border rounded px-3 py-1.5 text-xs text-ow-text focus:outline-none focus:border-ow-accent"
              placeholder="Optional"
            />
          </div>

          {error && (
            <p className="text-[10px] text-ow-danger">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-ow-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-ow-text-muted hover:text-ow-text border border-ow-border hover:bg-ow-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-3 py-1.5 rounded text-xs font-medium bg-ow-accent text-ow-bg hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Venue'}
          </button>
        </div>
      </div>
    </div>
  );
}
