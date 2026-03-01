import { ipcMain, BrowserWindow } from 'electron';
import type { SyncManager } from '../services/sync-manager';

export function registerSyncHandlers(syncManager: SyncManager): void {
  ipcMain.handle('sync:getStatus', () => syncManager.getStatus());

  ipcMain.handle('sync:triggerSync', async () => {
    await syncManager.triggerSync();
    return syncManager.getStatus();
  });

  ipcMain.handle('sync:bootstrap', async () => {
    const success = await syncManager.bootstrap();
    return { success, status: syncManager.getStatus() };
  });

  ipcMain.handle('sync:fetchKit', async (_e, serial: string) => {
    return syncManager.fetchKit(serial);
  });

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
