import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Mic, RefreshCw, Loader2, ExternalLink, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { useIntelligenceStore } from '@/shared/store/intelligence-store';

const api = (window as any).electronAPI;

const VOICE_DEVICE_KEY = 'voice_device_id';

type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'not-determined';

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: string;
}

export function SettingsView() {
  const [voiceDeviceId, setVoiceDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState<PermissionStatus>('unknown');

  const loadDevices = useCallback(async (): Promise<AudioDevice[]> => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          kind: d.kind,
        }));
      setDevices(inputs);
      return inputs;
    } catch (e) {
      console.warn('[SettingsView] enumerateDevices failed:', e);
      setDevices([]);
      return [];
    }
  }, []);

  const loadSaved = useCallback(async () => {
    if (!api.settings?.get) return;
    try {
      const id = await api.settings.get(VOICE_DEVICE_KEY);
      setVoiceDeviceId(typeof id === 'string' ? id : null);
    } catch {
      setVoiceDeviceId(null);
    }
  }, []);

  const updatePermission = useCallback(async () => {
    const perm = await api.voice?.checkPermission?.();
    if (perm === 'granted') setPermission('granted');
    else if (perm === 'denied' || perm === 'restricted') setPermission('denied');
    else if (perm === 'not-determined') setPermission('not-determined');
    else setPermission('unknown');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadSaved();
      if (cancelled) return;
      await updatePermission();
      if (cancelled) return;
      await loadDevices();
      if (cancelled) return;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadSaved, loadDevices, updatePermission]);

  const requestAccess = async () => {
    setRequesting(true);
    try {
      if (api.voice?.requestPermission) {
        await api.voice.requestPermission();
      }
      await updatePermission();
      await loadDevices();
    } finally {
      setRequesting(false);
    }
  };

  const refreshDevices = async () => {
    setRefreshing(true);
    await updatePermission();
    if (permission === 'not-determined' && api.voice?.requestPermission) {
      await api.voice.requestPermission();
      await updatePermission();
    }
    const list = await loadDevices();
    if (list.length > 0) {
      useIntelligenceStore.getState().setVoiceState({ error: null });
    }
    setRefreshing(false);
  };

  const openSystemMicrophoneSettings = () => {
    api.settings?.openSystemMicrophoneSettings?.();
  };

  const handleVoiceDeviceChange = (deviceId: string) => {
    const value = deviceId === '' ? null : deviceId;
    setVoiceDeviceId(value);
    if (api.settings?.set) {
      api.settings.set(VOICE_DEVICE_KEY, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  const noDevices = devices.length === 0 && !loading;
  const showRequestAccess = noDevices && (permission === 'not-determined' || permission === 'unknown');

  return (
    <div className="h-full flex flex-col bg-ow-bg overflow-auto">
      <div className="shrink-0 flex items-center gap-2 px-6 py-4 border-b border-ow-border/30">
        <SettingsIcon size={20} className="text-ow-accent" />
        <h1 className="text-lg font-semibold text-ow-text tracking-tight">Settings</h1>
      </div>

      <div className="flex-1 p-6 max-w-xl space-y-8">
        {/* Voice / Microphone */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-ow-text-dim" />
            <h2 className="text-sm font-bold text-ow-text uppercase tracking-wider">
              Voice input
            </h2>
          </div>
          <p className="text-xs text-ow-text-dim">
            Choose the microphone used for voice commands. The list appears after this app is allowed to use the microphone.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-ow-text-dim text-sm">
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={voiceDeviceId ?? ''}
                  onChange={(e) => handleVoiceDeviceChange(e.target.value)}
                  className={clsx(
                    'min-w-[220px] px-3 py-2 rounded-lg text-sm bg-ow-surface border border-ow-border',
                    'text-ow-text focus:outline-none focus:ring-2 focus:ring-ow-accent/50 focus:border-ow-accent/50',
                  )}
                  disabled={devices.length === 0}
                >
                  <option value="">System default</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={refreshDevices}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-ow-surface border border-ow-border text-ow-text hover:bg-ow-surface/80 transition-colors disabled:opacity-50"
                >
                  {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Refresh
                </button>
                {saved && (
                  <span className="text-[10px] text-green-400 font-medium">Saved</span>
                )}
              </div>

              {/* No devices yet — prompt to allow access */}
              {showRequestAccess && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
                  <p className="text-sm text-ow-text">
                    Microphone access is required to list and select a device. Click the button below; your system may show a permission prompt.
                  </p>
                  <button
                    type="button"
                    onClick={requestAccess}
                    disabled={requesting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-ow-accent text-ow-bg hover:brightness-110 transition-colors disabled:opacity-60"
                  >
                    {requesting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    {requesting ? 'Requesting…' : 'Allow microphone access'}
                  </button>
                </div>
              )}

              {/* Access denied — direct to system settings */}
              {permission === 'denied' && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 space-y-3">
                  <p className="text-sm text-ow-text">
                    Microphone access was denied. To use voice commands, allow this app in your system privacy settings, then return here and click Refresh.
                  </p>
                  <button
                    type="button"
                    onClick={openSystemMicrophoneSettings}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-ow-surface border border-ow-border text-ow-text hover:bg-ow-surface/80 transition-colors"
                  >
                    <ExternalLink size={14} />
                    Open system settings
                  </button>
                  <p className="text-[11px] text-ow-text-dim">
                    After enabling the app, click Refresh above to see your microphones.
                  </p>
                </div>
              )}

              {/* Empty list but not denied (e.g. no mics plugged in) */}
              {noDevices && permission === 'granted' && (
                <div className="rounded-lg border border-ow-border/50 bg-ow-surface/30 p-4 space-y-2">
                  <p className="text-sm text-ow-text">
                    No microphones were found. Connect a microphone or headset, then click Refresh.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
