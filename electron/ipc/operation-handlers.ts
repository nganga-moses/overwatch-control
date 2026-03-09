import { ipcMain } from 'electron';
import type { OperationManager } from '../services/operation-manager';

export function registerOperationHandlers(om: OperationManager): void {
  // Operations CRUD
  ipcMain.handle('operation:create', (_e, data) => om.createOperation(data));
  ipcMain.handle('operation:get', (_e, id: string) => om.getOperation(id));
  ipcMain.handle('operation:list', (_e, filters?) => om.listOperations(filters));
  ipcMain.handle('operation:update', (_e, id: string, patch) =>
    om.updateOperation(id, patch),
  );
  ipcMain.handle('operation:delete', (_e, id: string) => om.deleteOperation(id));

  // Lifecycle transitions
  ipcMain.handle('operation:startBriefing', (_e, id: string) =>
    om.startBriefing(id),
  );
  ipcMain.handle('operation:deploy', (_e, id: string, briefingJson) =>
    om.deploy(id, briefingJson),
  );
  ipcMain.handle('operation:complete', (_e, id: string) =>
    om.completeOperation(id),
  );
  ipcMain.handle('operation:abort', (_e, id: string) => om.abortOperation(id));
  ipcMain.handle('operation:pause', (_e, id: string) => om.pauseOperation(id));
  ipcMain.handle('operation:resume', (_e, id: string) =>
    om.resumeOperation(id),
  );

  // Metrics & Debrief
  ipcMain.handle('operation:getMetrics', (_e, id: string) =>
    om.getMetrics(id),
  );
  ipcMain.handle('operation:getDebrief', (_e, id: string) =>
    om.getDebrief(id),
  );

  // Principals
  ipcMain.handle('principal:create', (_e, data) => om.createPrincipal(data));
  ipcMain.handle('principal:list', () => om.listPrincipals());
  ipcMain.handle('principal:update', (_e, id: string, patch) =>
    om.updatePrincipal(id, patch),
  );
  ipcMain.handle('principal:delete', (_e, id: string) =>
    om.deletePrincipal(id),
  );

  // Protection Agents
  ipcMain.handle('agent:create', (_e, data) => om.createAgent(data));
  ipcMain.handle('agent:list', () => om.listAgents());
  ipcMain.handle('agent:update', (_e, id: string, patch) =>
    om.updateAgent(id, patch),
  );
  ipcMain.handle('agent:delete', (_e, id: string) => om.deleteAgent(id));

  // Weather
  ipcMain.handle('weather:getCurrent', (_e, lat: number, lng: number) =>
    om.getWeather(lat, lng),
  );
  ipcMain.handle(
    'weather:getForecast',
    (_e, lat: number, lng: number, hours?: number) =>
      om.getWeatherForecast(lat, lng, hours),
  );
}
