import { ipcMain, shell } from 'electron';
import type { OverwatchDB } from '../storage/overwatch-db';
import type { VenueManager } from '../services/venue-manager';
import type { AssetManager } from '../services/asset-manager';
import type { SyncManager } from '../services/sync-manager';
import type { ActivationService } from '../services/activation-service';
import type { LLMManager } from '../sidecar/llm-manager';
import type { Orchestrator } from '../services/orchestrator/index';
import type { WhisperManager } from '../sidecar/whisper-manager';
import { registerVenueHandlers } from './venue-handlers';
import { registerAssetHandlers } from './asset-handlers';
import { registerSyncHandlers } from './sync-handlers';
import { registerAuthHandlers } from './auth-handlers';
import { registerOrchestratorHandlers } from './orchestrator-handlers';
import { registerVoiceHandlers } from './voice-handlers';

export function registerIPCHandlers(
  db: OverwatchDB,
  venueManager: VenueManager,
  assetManager: AssetManager,
  activationService: ActivationService,
  getSyncManager: () => SyncManager | null,
  deps?: {
    getLlm?: () => LLMManager | null;
    getOrchestrator?: () => Orchestrator | null;
    getWhisper?: () => WhisperManager | null;
  },
): void {
  ipcMain.handle('wm:writeNode', (_e, node) => db.writeNode(node));
  ipcMain.handle('wm:getNode', (_e, id: string) => db.getNode(id));
  ipcMain.handle('wm:queryNodes', (_e, filters?) => db.queryNodes(filters));
  ipcMain.handle(
    'wm:queryNodesBySimilarity',
    (_e, embedding: number[], limit?: number, filters?) =>
      db.queryNodesBySimilarity(embedding, limit, filters),
  );
  ipcMain.handle('wm:writeEdge', (_e, edge) => db.writeEdge(edge));
  ipcMain.handle('wm:queryEdges', (_e, filters?) => db.queryEdges(filters));

  // Settings (register early so they are always available)
  ipcMain.handle('settings:get', (_e, key: string) => {
    try {
      return db.getSetting(key);
    } catch (err) {
      console.warn('[IPC] settings:get failed:', err);
      return null;
    }
  });
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    try {
      db.setSetting(key, value);
      return true;
    } catch (err) {
      console.warn('[IPC] settings:set failed:', err);
      return false;
    }
  });
  ipcMain.handle('settings:openSystemMicrophoneSettings', () => {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    } else if (process.platform === 'win32') {
      shell.openExternal('ms-settings:privacy-microphone');
    }
    return true;
  });

  registerAuthHandlers(activationService, db);
  registerVenueHandlers(venueManager);
  registerAssetHandlers(assetManager);
  registerSyncHandlers(getSyncManager);

  if (deps?.getOrchestrator) {
    registerOrchestratorHandlers(deps.getOrchestrator);
  }
  if (deps?.getWhisper) {
    registerVoiceHandlers(deps.getWhisper);
  }
  if (deps?.getLlm) {
    ipcMain.handle('llm:getStatus', () => {
      const llm = deps.getLlm?.();
      return llm?.getStatus() ?? { status: 'stopped', error: null };
    });
  }
}
