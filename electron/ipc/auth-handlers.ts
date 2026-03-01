import { ipcMain } from 'electron';
import type { ActivationService } from '../services/activation-service';
import type { OverwatchDB } from '../storage/overwatch-db';

export function registerAuthHandlers(
  activationService: ActivationService,
  db: OverwatchDB,
): void {
  ipcMain.handle('auth:isActivated', () => activationService.isActivated());

  ipcMain.handle('auth:activate', async (_e, cloudUrl: string, code: string) => {
    return activationService.activate(cloudUrl, code);
  });

  ipcMain.handle('auth:getOperators', () => activationService.getOperators());

  ipcMain.handle('auth:getChallengePositions', (_e, excludePositions?: number[]) => {
    return activationService.generateChallengePositions(excludePositions);
  });

  ipcMain.handle(
    'auth:validatePin',
    (_e, operatorId: string, positions: number[], digits: string[]) => {
      return activationService.validatePin(operatorId, positions, digits);
    },
  );

  ipcMain.handle('auth:writeAuditLog', (_e, entry: { operatorId: string; action: string; detail?: string }) => {
    return db.writeAuditLog(entry);
  });

  ipcMain.handle('auth:getCustomerName', () => db.getConfig('customer_name'));
}
