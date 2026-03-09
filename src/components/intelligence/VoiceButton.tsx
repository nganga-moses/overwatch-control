import { useState, useRef, useCallback, useEffect } from 'react';
import { useIntelligenceStore } from '@/shared/store/intelligence-store';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const api = (window as any).electronAPI;
const VOICE_DEVICE_KEY = 'voice_device_id';
const ERROR_DISMISS_MS = 5000;

function voiceErrorMessage(codeOrMessage: string | undefined): string {
  const t = codeOrMessage?.toLowerCase() ?? '';
  switch (t) {
    case 'microphone_denied':
      return 'Microphone access was denied. Open Settings → Voice input to allow access.';
    case 'no_audio_captured':
      return 'Nothing was recorded. Hold the button down while you speak, then release.';
    case 'recording_too_short':
      return 'That was too short. Hold the button for at least half a second while you speak.';
    case 'whisper_not_ready':
      return 'Voice recognition isn’t ready yet. Please try again in a moment.';
    case 'transcription_failed':
      return 'We couldn’t make out what you said. Try again and speak clearly.';
    case 'no_active_session':
      return 'Nothing was recorded. Hold the button down while you speak, then release.';
    default:
      if (!codeOrMessage || codeOrMessage.length < 3) return 'Something went wrong. Try again.';
      return codeOrMessage;
  }
}

/**
 * Floating voice button — positioned bottom-center above the dock.
 *
 * Push-to-talk: hold to record, release to transcribe and send to orchestrator.
 * Opens the Intelligence panel (chat tab) when pressed so the conversation continues there.
 * Uses the voice device selected in Settings when set; otherwise system default.
 */
export function VoiceButton() {
  const voiceState = useIntelligenceStore((s) => s.voiceState);
  const setVoiceState = useIntelligenceStore((s) => s.setVoiceState);
  const setPanelOpen = useIntelligenceStore((s) => s.setPanelOpen);
  const setActiveTab = useIntelligenceStore((s) => s.setActiveTab);
  const panelOpen = useIntelligenceStore((s) => s.panelOpen);

  const [holding, setHolding] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const errorDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setVoiceError = useCallback(
    (message: string | null) => {
      if (errorDismissRef.current) {
        clearTimeout(errorDismissRef.current);
        errorDismissRef.current = null;
      }
      setVoiceState({ error: message });
      if (message) {
        errorDismissRef.current = setTimeout(() => {
          errorDismissRef.current = null;
          setVoiceState({ error: null });
        }, ERROR_DISMISS_MS);
      }
    },
    [setVoiceState],
  );

  useEffect(() => {
    return () => {
      if (errorDismissRef.current) clearTimeout(errorDismissRef.current);
    };
  }, []);

  const startCapture = useCallback(async () => {
    setPanelOpen(true);
    setActiveTab('chat');

    try {
      const perm = await api.voice.checkPermission();
      if (perm === 'denied') {
        setVoiceError(voiceErrorMessage('microphone_denied'));
        return;
      }
      if (perm === 'not-determined') {
        await api.voice.requestPermission();
      }

      const result = await api.voice.startCapture();
      if (!result.success) {
        setVoiceError(voiceErrorMessage(result.error));
        return;
      }

      const raw = await api.settings?.get?.(VOICE_DEVICE_KEY);
      const savedDeviceId: string | null =
        typeof raw === 'string' && raw.length > 0 ? raw : null;

      const audioConstraints: MediaTrackConstraints = {
        sampleRate: { ideal: 16000 },
        channelCount: { ideal: 1 },
        echoCancellation: true,
      };
      if (savedDeviceId) {
        audioConstraints.deviceId = { ideal: savedDeviceId };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (e) {
        if (e instanceof Error && e.name === 'NotFoundError') {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
          const first = inputs[0];
          if (first) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: first.deviceId } },
              });
            } catch {
              setVoiceError('No microphone found. Set one in Settings or connect a mic.');
              return;
            }
          } else {
            setVoiceError('No microphone found. Set one in Settings or connect a mic.');
            return;
          }
        } else {
          throw e;
        }
      }
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        api.voice.pushAudioChunk(int16.buffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setHolding(true);
      setVoiceState({ capturing: true, error: null });
    } catch (err) {
      console.error('[VoiceButton] startCapture failed:', err);
      setVoiceError('We couldn’t start the microphone. Check Settings → Voice input and try again.');
    }
  }, [setVoiceState, setPanelOpen, setActiveTab, setVoiceError]);

  const stopCapture = useCallback(async () => {
    setHolding(false);
    setVoiceState({ capturing: false, processing: true });

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;

    try {
      const result = await api.voice.stopCapture();
      if (result.success && result.transcript) {
        setVoiceState({ processing: false, lastTranscript: result.transcript, error: null });
        await api.orchestrator.processVoice(result.transcript);
      } else {
        setVoiceState({ processing: false });
        setVoiceError(voiceErrorMessage(result.error ?? 'no_audio_captured'));
      }
    } catch (err) {
      console.error('[VoiceButton] stopCapture failed:', err);
      setVoiceState({ processing: false });
      setVoiceError(voiceErrorMessage('transcription_failed'));
    }
  }, [setVoiceState, setVoiceError]);

  const cancelCapture = useCallback(() => {
    setHolding(false);
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    api.voice.cancelCapture();
    setVoiceState({ capturing: false, processing: false, error: null });
  }, [setVoiceState]);

  const isCapturing = voiceState.capturing;
  const isProcessing = voiceState.processing;

  return (
    <div
      className={`fixed bottom-[200px] -translate-x-1/2 z-50 ${panelOpen ? 'left-[calc(100%-660px)]' : 'left-1/2'}`}
    >
      <button
        onMouseDown={startCapture}
        onMouseUp={stopCapture}
        onMouseLeave={holding ? cancelCapture : undefined}
        onTouchStart={startCapture}
        onTouchEnd={stopCapture}
        disabled={isProcessing}
        className={clsx(
          'w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg',
          isCapturing
            ? 'bg-red-500 shadow-red-500/40 scale-110'
            : isProcessing
              ? 'bg-ow-accent/30 cursor-wait'
              : 'bg-ow-surface/80 border border-ow-border/30 hover:bg-ow-surface hover:border-ow-accent/40 hover:shadow-ow-accent/20',
        )}
        title={isCapturing ? 'Release to send' : isProcessing ? 'Processing...' : 'Hold to speak'}
      >
        {isProcessing ? (
          <Loader2 size={20} className="text-ow-accent animate-spin" />
        ) : isCapturing ? (
          <Mic size={20} className="text-white animate-pulse" />
        ) : (
          <Mic size={20} className="text-ow-text-dim" />
        )}
      </button>

      {isCapturing && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] font-bold text-red-400 animate-pulse">
            Listening...
          </span>
        </div>
      )}

      {voiceState.error && !isCapturing && !isProcessing && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[9px] text-red-400">{voiceState.error}</span>
        </div>
      )}
    </div>
  );
}
