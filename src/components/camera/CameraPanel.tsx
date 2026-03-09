import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { useOverwatchStore } from '@/shared/store/overwatch-store';
import { useWhepStream, type StreamStatus } from '@/shared/hooks/useWhepStream';
import {
  Video, VideoOff, Maximize2, Minimize2, ChevronDown,
  Battery, Clock, Wifi, WifiOff, Loader2,
} from 'lucide-react';
import { TierBadge } from '@/components/common/TierBadge';
import { PerchStateIcon } from '@/components/common/PerchStateIcon';
import type { DroneProfile } from '@/shared/types';

const PANEL_BG = '#0a0f14';
const HEADER_BG = '#0c1219';
const CELL_BG = '#111920';
const CELL_BORDER = '#1a2228';
const TEXT_LIGHT = '#a7b3b7';
const TEXT_DIM = '#5a6a70';
const ACCENT = '#2dd4bf';

interface CameraPanelProps {
  selectedDroneId: string | null;
  onSelectDrone: (id: string | null) => void;
  className?: string;
}

function statusColor(state: string): string {
  switch (state) {
    case 'perched': return '#3fb950';
    case 'transit': case 'repositioning': return '#58a6ff';
    case 'launching': case 'perching': return '#d29922';
    case 'returning': return '#79c0ff';
    case 'sleeping': return '#6e7681';
    default: return TEXT_DIM;
  }
}

function streamStatusIndicator(status: StreamStatus) {
  switch (status) {
    case 'connecting':
      return <Loader2 size={10} className="animate-spin" style={{ color: '#d29922' }} />;
    case 'streaming':
      return <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />;
    case 'degraded':
      return <Wifi size={10} style={{ color: '#d29922' }} />;
    case 'error':
      return <WifiOff size={10} style={{ color: '#f85149' }} />;
    default:
      return null;
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return '--';
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function CameraFeedCell({ drone, isSelected, onClick }: {
  drone: DroneProfile;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isActive = drone.perchState !== 'sleeping' && drone.status !== 'offline';
  const borderColor = isSelected ? ACCENT : CELL_BORDER;

  const { canvasRef, status, isSimulation } = useWhepStream(
    isActive && isSelected ? drone.id : null,
  );

  return (
    <button
      onClick={onClick}
      className="relative aspect-[4/3] rounded-md overflow-hidden transition-all hover:brightness-110 group"
      style={{ background: CELL_BG, border: `2px solid ${borderColor}` }}
    >
      {isActive ? (
        isSimulation && isSelected ? (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0d1a20] to-[#0a1015] flex items-center justify-center">
            <Video size={20} style={{ color: TEXT_DIM }} className="opacity-30" />
          </div>
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <VideoOff size={18} style={{ color: TEXT_DIM }} className="opacity-20" />
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/60 to-transparent">
        <span
          className="text-[9px] font-bold tracking-wider uppercase"
          style={{ color: TEXT_LIGHT }}
        >
          {drone.callsign}
        </span>
        <div className="flex items-center gap-1.5">
          {isSelected && streamStatusIndicator(status)}
          {isActive && !isSelected && (
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
          <span className="text-[8px] font-mono capitalize" style={{ color: statusColor(drone.perchState) }}>
            {drone.perchState.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-[8px] font-mono flex items-center gap-0.5"
          style={{ color: drone.batteryPercent > 50 ? '#3fb950' : drone.batteryPercent > 20 ? '#d29922' : '#f85149' }}>
          <Battery size={8} /> {Math.round(drone.batteryPercent)}%
        </span>
        <Maximize2 size={10} style={{ color: TEXT_DIM }} className="opacity-0 group-hover:opacity-70 transition-opacity" />
      </div>
    </button>
  );
}

function ExpandedFeedView({ drone, onClose }: { drone: DroneProfile; onClose: () => void }) {
  const isActive = drone.perchState !== 'sleeping' && drone.status !== 'offline';
  const color = statusColor(drone.perchState);
  const batteryColor = drone.batteryPercent > 50 ? '#3fb950' : drone.batteryPercent > 20 ? '#d29922' : '#f85149';

  const { videoRef, canvasRef, status, quality, error, isSimulation } = useWhepStream(
    isActive ? drone.id : null,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ background: HEADER_BG, borderBottom: `1px solid ${CELL_BORDER}` }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXT_LIGHT }}>
            {drone.callsign}
          </span>
          <TierBadge tier={drone.tier} />
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color, background: `${color}20` }}>
            {drone.perchState.replace('_', ' ')}
          </span>
          <div className="flex items-center gap-1 ml-2">
            {streamStatusIndicator(status)}
            <span className="text-[8px] font-mono capitalize" style={{
              color: status === 'streaming' ? '#3fb950'
                   : status === 'connecting' ? '#d29922'
                   : status === 'error' ? '#f85149'
                   : TEXT_DIM,
            }}>
              {status}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-[#1a2530] transition-colors">
          <Minimize2 size={14} style={{ color: TEXT_DIM }} />
        </button>
      </div>

      <div className="flex-1 relative" style={{ background: CELL_BG }}>
        {isActive ? (
          isSimulation ? (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : status === 'streaming' ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : status === 'connecting' ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Loader2 size={32} className="mx-auto animate-spin mb-2" style={{ color: '#d29922' }} />
                <span className="text-[10px] font-mono" style={{ color: TEXT_DIM }}>Connecting...</span>
              </div>
            </div>
          ) : status === 'error' ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <WifiOff size={32} style={{ color: '#f85149' }} className="mx-auto mb-2 opacity-50" />
                <span className="text-[10px] font-mono" style={{ color: '#f85149' }}>{error ?? 'Stream error'}</span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#0d1a20] to-[#0a1015] flex items-center justify-center">
              <div className="text-center">
                <Video size={40} style={{ color: TEXT_DIM }} className="mx-auto opacity-30 mb-2" />
                <span className="text-[10px] font-mono" style={{ color: TEXT_DIM }}>Waiting for stream</span>
              </div>
            </div>
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <VideoOff size={40} style={{ color: TEXT_DIM }} className="mx-auto opacity-20 mb-2" />
              <span className="text-[10px] font-mono" style={{ color: TEXT_DIM }}>Offline</span>
            </div>
          </div>
        )}

        {status === 'streaming' && (
          <div className="absolute top-2 right-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </div>
        )}

        {status === 'streaming' && quality.resolution && (
          <div className="absolute bottom-2 right-2 flex items-center gap-2 px-2 py-1 rounded bg-black/50">
            <span className="text-[8px] font-mono" style={{ color: TEXT_DIM }}>
              {quality.resolution}
            </span>
            {quality.bitrate_kbps > 0 && (
              <span className="text-[8px] font-mono" style={{ color: TEXT_DIM }}>
                {quality.bitrate_kbps}kbps
              </span>
            )}
            {quality.latency_ms > 0 && (
              <span className="text-[8px] font-mono" style={{ color: quality.latency_ms > 100 ? '#d29922' : TEXT_DIM }}>
                {quality.latency_ms}ms
              </span>
            )}
          </div>
        )}
      </div>

      <div
        className="shrink-0 flex items-center justify-between px-3 py-2 text-[9px] font-mono"
        style={{ background: HEADER_BG, borderTop: `1px solid ${CELL_BORDER}` }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1" style={{ color: batteryColor }}>
            <Battery size={10} /> {Math.round(drone.batteryPercent)}%
          </span>
          <span style={{ color: TEXT_DIM }}>
            <PerchStateIcon state={drone.perchState} size={10} />
          </span>
          {drone.perchStartedAt && (
            <span className="flex items-center gap-1" style={{ color: TEXT_DIM }}>
              <Clock size={9} /> {formatDuration(drone.perchStartedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3" style={{ color: TEXT_DIM }}>
          <span>{drone.flightHours.toFixed(1)}h flown</span>
          <span>{drone.totalPerches} perches</span>
        </div>
      </div>
    </div>
  );
}

export function CameraPanel({ selectedDroneId, onSelectDrone, className }: CameraPanelProps) {
  const isExpanded = className != null && className.length > 0;
  const kits = useOverwatchStore((s) => s.kits);
  const drones = useOverwatchStore((s) => s.drones);
  const [selectedKitId, setSelectedKitId] = useState<string | 'all'>('all');
  const [expandedDroneId, setExpandedDroneId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeKit = useMemo(() => {
    if (selectedKitId === 'all') return null;
    return kits.find((k) => k.id === selectedKitId) ?? null;
  }, [kits, selectedKitId]);

  const kitDrones = useMemo(() => {
    if (!activeKit) return drones;
    const filtered = drones.filter((d) => d.kitId === activeKit.id);
    return filtered.length > 0 ? filtered : drones;
  }, [drones, activeKit]);

  const activeDrones = kitDrones.filter((d) => d.perchState !== 'sleeping');

  const expandedDrone = useMemo(
    () => expandedDroneId ? drones.find((d) => d.id === expandedDroneId) ?? null : null,
    [drones, expandedDroneId],
  );

  const handleCellClick = (droneId: string) => {
    if (droneId === selectedDroneId) {
      onSelectDrone(null);
      setExpandedDroneId(null);
    } else {
      onSelectDrone(droneId);
      setExpandedDroneId(droneId);
    }
  };

  return (
    <div
      className={clsx('flex flex-col h-full', className ?? 'w-[480px] shrink-0')}
      style={{ background: PANEL_BG, borderLeft: className ? undefined : `1px solid ${CELL_BORDER}` }}
    >
      <div className="h-8 shrink-0 titlebar-drag" />

      {expandedDrone ? (
        <ExpandedFeedView drone={expandedDrone} onClose={() => setExpandedDroneId(null)} />
      ) : (
        <>
          <div className="relative shrink-0 px-3 pb-2">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded transition-all hover:brightness-110"
              style={{ background: HEADER_BG, border: `1px solid ${CELL_BORDER}` }}
            >
              <div className="flex items-center gap-2">
                <Video size={12} style={{ color: ACCENT }} />
                <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: TEXT_LIGHT }}>
                  {activeKit ? activeKit.name : 'All Drones'}
                </span>
                {activeKit && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ color: TEXT_DIM, background: '#141e25' }}>
                    {activeKit.type.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono" style={{ color: TEXT_DIM }}>
                  {activeDrones.length}/{kitDrones.length}
                </span>
                <ChevronDown
                  size={12}
                  style={{ color: TEXT_DIM, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                />
              </div>
            </button>

            {dropdownOpen && (
              <div
                className="absolute left-3 right-3 mt-1 rounded overflow-hidden z-20 shadow-xl"
                style={{ background: HEADER_BG, border: `1px solid ${CELL_BORDER}` }}
              >
                <button
                  onClick={() => { setSelectedKitId('all'); setDropdownOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover:brightness-125"
                  style={{ background: selectedKitId === 'all' ? '#1a252e' : 'transparent' }}
                >
                  <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: TEXT_LIGHT }}>
                    All Drones
                  </span>
                  <span className="text-[8px] font-mono ml-auto" style={{ color: TEXT_DIM }}>
                    {drones.length}
                  </span>
                </button>
                {kits.map((kit) => {
                  const count = drones.filter((d) => d.kitId === kit.id).length;
                  return (
                    <button
                      key={kit.id}
                      onClick={() => { setSelectedKitId(kit.id); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover:brightness-125"
                      style={{ background: selectedKitId === kit.id ? '#1a252e' : 'transparent', borderTop: `1px solid ${CELL_BORDER}` }}
                    >
                      <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: TEXT_LIGHT }}>
                        {kit.name}
                      </span>
                      <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ color: TEXT_DIM, background: '#141e25' }}>
                        {kit.type.toUpperCase()}
                      </span>
                      <span className="text-[8px] font-mono ml-auto" style={{ color: TEXT_DIM }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className={clsx('grid gap-2', isExpanded ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2')}>
              {kitDrones.length > 0
                ? kitDrones.map((drone) => (
                    <CameraFeedCell
                      key={drone.id}
                      drone={drone}
                      isSelected={drone.id === selectedDroneId}
                      onClick={() => handleCellClick(drone.id)}
                    />
                  ))
                : Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="relative aspect-[4/3] rounded-md overflow-hidden flex items-center justify-center"
                      style={{ background: CELL_BG, border: `2px solid ${CELL_BORDER}` }}
                    >
                      <VideoOff size={18} style={{ color: TEXT_DIM }} className="opacity-15" />
                    </div>
                  ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
