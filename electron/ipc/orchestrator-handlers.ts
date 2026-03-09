import { ipcMain } from 'electron';
import type { Orchestrator, OrchestratorMode } from '../services/orchestrator/index';

export function registerOrchestratorHandlers(getOrchestrator: () => Orchestrator | null): void {
  ipcMain.handle('orchestrator:process', async (_e, text: string, forcedMode?: OrchestratorMode) => {
    const orch = getOrchestrator();
    if (!orch) throw new Error('Orchestrator not initialized');
    return orch.processUtterance(text, forcedMode);
  });

  ipcMain.handle('orchestrator:processVoice', async (_e, text: string) => {
    const orch = getOrchestrator();
    if (!orch) throw new Error('Orchestrator not initialized');
    return orch.processUtterance(text, undefined, true);
  });

  ipcMain.handle('orchestrator:setMode', (_e, mode: OrchestratorMode) => {
    const orch = getOrchestrator();
    if (!orch) throw new Error('Orchestrator not initialized');
    orch.setMode(mode);
    return true;
  });

  ipcMain.handle('orchestrator:getMode', () => {
    const orch = getOrchestrator();
    return orch?.getMode() ?? 'agent';
  });

  ipcMain.handle('orchestrator:getTranscript', () => {
    const orch = getOrchestrator();
    return orch?.getTranscript() ?? [];
  });

  ipcMain.handle('orchestrator:respondToCard', async (_e, cardId: string, action: 'approve' | 'reject' | 'cancel') => {
    const orch = getOrchestrator();
    if (!orch) throw new Error('Orchestrator not initialized');
    return orch.respondToActionCard(cardId, action);
  });

  ipcMain.handle('orchestrator:getSituation', () => {
    const orch = getOrchestrator();
    return orch?.getSituationSnapshot() ?? null;
  });
}
