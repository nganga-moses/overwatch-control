import { ipcMain } from 'electron';
import type { VenueManager } from '../services/venue-manager';

export function registerVenueHandlers(vm: VenueManager): void {
  ipcMain.handle('venue:create', (_e, data) => vm.createVenue(data));
  ipcMain.handle('venue:get', (_e, id: string) => vm.getVenue(id));
  ipcMain.handle('venue:list', (_e, filters?) => vm.listVenues(filters));
  ipcMain.handle('venue:update', (_e, id: string, patch) =>
    vm.updateVenue(id, patch),
  );
  ipcMain.handle('venue:delete', (_e, id: string) => vm.deleteVenue(id));

  ipcMain.handle('venue:createZone', (_e, data) => vm.createZone(data));
  ipcMain.handle('venue:getZones', (_e, venueId: string) =>
    vm.getZones(venueId),
  );
  ipcMain.handle('venue:updateZone', (_e, id: string, patch) =>
    vm.updateZone(id, patch),
  );
  ipcMain.handle('venue:deleteZone', (_e, id: string) => vm.deleteZone(id));

  ipcMain.handle('venue:createPerchPoint', (_e, data) =>
    vm.createPerchPoint(data),
  );
  ipcMain.handle('venue:getPerchPoints', (_e, zoneId: string) =>
    vm.getPerchPoints(zoneId),
  );
  ipcMain.handle('venue:deletePerchPoint', (_e, id: string) =>
    vm.deletePerchPoint(id),
  );

  ipcMain.handle('venue:setFloorPlan', (_e, venueId: string, filePath: string) =>
    vm.setFloorPlan(venueId, filePath),
  );
}
