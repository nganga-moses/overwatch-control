import { ipcMain, BrowserWindow } from 'electron';
import type { SyncManager } from '../services/sync-manager';

const NOT_CONFIGURED = { state: 'offline', lastError: 'Sync not configured' };

export function registerSyncHandlers(getSyncManager: () => SyncManager | null): void {
  ipcMain.handle('sync:getStatus', () => {
    return getSyncManager()?.getStatus() ?? NOT_CONFIGURED;
  });

  ipcMain.handle('sync:triggerSync', async () => {
    const sm = getSyncManager();
    if (!sm) throw new Error('Sync not configured — workstation may not be activated');
    await sm.triggerSync();
    return sm.getStatus();
  });

  ipcMain.handle('sync:bootstrap', async () => {
    const sm = getSyncManager();
    if (!sm) throw new Error('Sync not configured');
    const success = await sm.bootstrap();
    return { success, status: sm.getStatus() };
  });

  ipcMain.handle('sync:fetchKit', async (_e, serial: string) => {
    const sm = getSyncManager();
    if (!sm) throw new Error('Sync not configured');
    return sm.fetchKit(serial);
  });

  ipcMain.handle('sync:fetchAllKits', async () => {
    const sm = getSyncManager();
    if (!sm) throw new Error('Sync not configured — workstation may not be activated');
    return sm.fetchAllKits();
  });
}

export function bindSyncEvents(syncManager: SyncManager): void {
  syncManager.on('status', (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sync:status-update', status);
    }
  });

  syncManager.on('bootstrapped', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sync:bootstrapped');
    }
  });
}
