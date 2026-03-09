import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { VenueManager } from '../services/venue-manager';

export function registerVenueHandlers(vm: VenueManager): void {
  ipcMain.handle('venue:pickFloorPlanFile', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Floor Plan',
      filters: [
        { name: 'Floor Plans', extensions: ['dxf', 'pdf', 'png', 'jpg', 'jpeg'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Cloud-first venue CRUD
  ipcMain.handle('venue:create', (_e, data) => vm.createVenue(data));
  ipcMain.handle('venue:get', (_e, id: string) => vm.getVenue(id));
  ipcMain.handle('venue:list', (_e, filters?) => vm.listVenues(filters));
  ipcMain.handle('venue:update', (_e, id: string, patch) =>
    vm.updateVenue(id, patch),
  );
  ipcMain.handle('venue:delete', (_e, id: string) => vm.deleteVenue(id));

  // Zones (local-first)
  ipcMain.handle('venue:createZone', (_e, data) => vm.createZone(data));
  ipcMain.handle('venue:getZones', (_e, venueId: string) =>
    vm.getZones(venueId),
  );
  ipcMain.handle('venue:updateZone', (_e, id: string, patch) =>
    vm.updateZone(id, patch),
  );
  ipcMain.handle('venue:deleteZone', (_e, id: string) => vm.deleteZone(id));

  // Perch points (local-first)
  ipcMain.handle('venue:createPerchPoint', (_e, data) =>
    vm.createPerchPoint(data),
  );
  ipcMain.handle('venue:getPerchPoints', (_e, zoneId: string) =>
    vm.getPerchPoints(zoneId),
  );
  ipcMain.handle('venue:updatePerchPoint', (_e, id: string, patch) =>
    vm.updatePerchPoint(id, patch),
  );
  ipcMain.handle('venue:deletePerchPoint', (_e, id: string) =>
    vm.deletePerchPoint(id),
  );

  // Floor plan (cloud)
  ipcMain.handle('venue:deleteFloorPlan', async (_e, venueId: string) =>
    vm.deleteFloorPlan(venueId),
  );
  ipcMain.handle('venue:uploadFloorPlan', async (_e, venueId: string, filePath: string, options?: { floorLevel?: number; pageNumber?: number }) => {
    console.info('[IPC] venue:uploadFloorPlan called:', { venueId, filePath, options });
    try {
      const result = await vm.uploadFloorPlan(venueId, filePath, options);
      console.info('[IPC] venue:uploadFloorPlan success:', result);
      return result;
    } catch (err) {
      console.error('[IPC] venue:uploadFloorPlan error:', err);
      throw err;
    }
  });
  ipcMain.handle('venue:getPageCount', (_e, venueId: string, blobKey: string) =>
    vm.getPageCount(venueId, blobKey),
  );
  ipcMain.handle('venue:pollIngestion', (_e, venueId: string, jobId: string) =>
    vm.pollIngestion(venueId, jobId),
  );
  ipcMain.handle('venue:pullFloorPlan', (_e, venueId: string) =>
    vm.pullFloorPlan(venueId),
  );
  ipcMain.handle('venue:evictFloorPlan', (_e, venueId: string) =>
    vm.evictFloorPlan(venueId),
  );
  ipcMain.handle('venue:isFloorPlanCached', (_e, venueId: string) =>
    vm.isFloorPlanCached(venueId),
  );
  ipcMain.handle('venue:getFloorPlanPath', (_e, venueId: string) =>
    vm.getFloorPlanPath(venueId),
  );
  ipcMain.handle('venue:getFloorPlanDataUrl', (_e, venueId: string, floorLevel?: number) =>
    vm.getFloorPlanDataUrl(venueId, floorLevel),
  );
  ipcMain.handle('venue:getFloorImageLevels', (_e, venueId: string) =>
    vm.getFloorImageLevels(venueId),
  );
  ipcMain.handle('venue:fetchIntelligence', (_e, venueId: string) =>
    vm.fetchVenueIntelligence(venueId),
  );

  // Surface assessments
  ipcMain.handle('venue:recordSurfaceAssessment', (_e, data) =>
    vm.recordSurfaceAssessment(data),
  );
  ipcMain.handle('venue:getPerchPointHistory', (_e, perchPointId: string) =>
    vm.getPerchPointHistory(perchPointId),
  );
  ipcMain.handle('venue:getPerchPointStats', (_e, perchPointId: string) =>
    vm.getPerchPointStats(perchPointId),
  );
}
