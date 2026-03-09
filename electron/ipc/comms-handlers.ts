/**
 * IPC handlers for Overwatch comms — drone commands, perch, reposition.
 *
 * Bridges the renderer to CommsManager for live drone control.
 */

import { ipcMain } from 'electron';
import type { CommsManager } from '../comms/comms-manager';
import type {
  PerchCommandPayload,
  RepositionCommandPayload,
} from '../../src/protocol/messages';

export function registerCommsHandlers(commsManager: CommsManager): void {
  ipcMain.handle(
    'comms:sendCommand',
    (_event, swarmId: string, command: string, targetDroneId?: string, parameters?: unknown) => {
      return commsManager.sendSwarmCommand(swarmId, command, targetDroneId, parameters);
    },
  );

  ipcMain.handle('comms:getSwarmStatus', (_event, swarmId: string) => {
    return commsManager.getSwarmStatus(swarmId);
  });

  ipcMain.handle('comms:getAllStatuses', () => {
    return commsManager.getAllSwarmStatuses();
  });

  ipcMain.handle(
    'comms:sendPerchCommand',
    (_event, swarmId: string, cmd: PerchCommandPayload) => {
      return commsManager.sendPerchCommand(swarmId, cmd);
    },
  );

  ipcMain.handle(
    'comms:sendRepositionCommand',
    (_event, swarmId: string, cmd: RepositionCommandPayload) => {
      return commsManager.sendRepositionCommand(swarmId, cmd);
    },
  );

  ipcMain.handle('comms:getMeshRepeaters', () => {
    return commsManager.getMeshRepeaters();
  });
}
