import { ipcMain, systemPreferences } from 'electron';
import type { WhisperManager } from '../sidecar/whisper-manager';

interface CaptureSession {
  chunks: Buffer[];
  startTime: number;
}

let currentSession: CaptureSession | null = null;

export function registerVoiceHandlers(getWhisper: () => WhisperManager | null): void {
  ipcMain.handle('voice:checkPermission', async () => {
    if (process.platform !== 'darwin') return 'granted';
    return systemPreferences.getMediaAccessStatus('microphone');
  });

  ipcMain.handle('voice:requestPermission', async () => {
    if (process.platform !== 'darwin') return true;
    return systemPreferences.askForMediaAccess('microphone');
  });

  ipcMain.handle('voice:startCapture', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status === 'denied' || status === 'restricted') {
        return { success: false, error: 'microphone_denied' };
      }
      if (status === 'not-determined') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        if (!granted) return { success: false, error: 'microphone_denied' };
      }
    }

    currentSession = { chunks: [], startTime: Date.now() };
    return { success: true };
  });

  ipcMain.handle('voice:pushAudioChunk', (_e, chunk: ArrayBuffer) => {
    if (!currentSession) return false;
    if (!chunk || chunk.byteLength === 0) return false;
    currentSession.chunks.push(Buffer.from(chunk));
    return true;
  });

  ipcMain.handle('voice:stopCapture', async () => {
    if (!currentSession) return { success: false, error: 'no_active_session' };

    const session = currentSession;
    currentSession = null;

    if (session.chunks.length === 0) return { success: false, error: 'no_audio_captured' };

    const pcmBuffer = Buffer.concat(session.chunks);
    const durationMs = (pcmBuffer.length / (16000 * 2)) * 1000;
    if (durationMs < 300) return { success: false, error: 'recording_too_short' };

    const whisper = getWhisper();
    if (!whisper?.isReady()) {
      return { success: false, error: 'whisper_not_ready' };
    }

    try {
      const result = await whisper.transcribe(pcmBuffer);
      return {
        success: true,
        transcript: result.text,
        segments: result.segments,
        language: result.language,
        duration_ms: result.duration_ms,
        audio_duration_ms: Math.round(durationMs),
      };
    } catch (err) {
      return {
        success: false,
        error: 'transcription_failed',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle('voice:cancelCapture', () => {
    currentSession = null;
    return true;
  });

  ipcMain.handle('voice:getStatus', () => {
    const whisper = getWhisper();
    return {
      whisper: whisper?.getStatus() ?? { status: 'stopped', error: null },
      capturing: currentSession !== null,
    };
  });
}
