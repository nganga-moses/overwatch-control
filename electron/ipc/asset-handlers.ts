import { ipcMain } from 'electron';
import type { AssetManager } from '../services/asset-manager';

export function registerAssetHandlers(am: AssetManager): void {
  ipcMain.handle('asset:createKit', (_e, data) => am.createKit(data));
  ipcMain.handle('asset:getKit', (_e, id: string) => am.getKit(id));
  ipcMain.handle('asset:listKits', () => am.listKits());
  ipcMain.handle('asset:updateKit', (_e, id: string, patch) =>
    am.updateKit(id, patch),
  );
  ipcMain.handle('asset:deleteKit', (_e, id: string) => am.deleteKit(id));

  ipcMain.handle('asset:createDrone', (_e, data) => am.createDrone(data));
  ipcMain.handle('asset:getDrone', (_e, id: string) => am.getDrone(id));
  ipcMain.handle('asset:listDrones', (_e, kitId?: string) =>
    am.listDrones(kitId),
  );
  ipcMain.handle('asset:updateDrone', (_e, id: string, patch) =>
    am.updateDrone(id, patch),
  );
  ipcMain.handle('asset:deleteDrone', (_e, id: string) =>
    am.deleteDrone(id),
  );

  ipcMain.handle('asset:onboard', (_e, serial: string) =>
    am.onboard(serial),
  );
}
