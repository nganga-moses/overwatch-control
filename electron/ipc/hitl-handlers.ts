/**
 * IPC handlers for Overwatch HITL — direct drone control and video signaling.
 */

import { ipcMain } from 'electron';
import type { HITLServer, HITLIndoorCommand } from '../comms/hitl-server';

export function registerHITLHandlers(hitlServer: HITLServer): void {
  ipcMain.handle(
    'hitl:sendCommand',
    (_event, droneId: string, command: HITLIndoorCommand) => {
      return hitlServer.sendCommand(droneId, command);
    },
  );

  ipcMain.handle(
    'hitl:handback',
    (_event, droneId: string) => {
      return hitlServer.initiateHandback(droneId);
    },
  );

  ipcMain.handle(
    'hitl:getSession',
    (_event, droneId: string) => {
      return hitlServer.getSession(droneId);
    },
  );

  ipcMain.handle(
    'hitl:getAllSessions',
    () => {
      return hitlServer.getActiveSessions();
    },
  );

  ipcMain.handle(
    'hitl:videoAnswer',
    (_event, droneId: string, sdp: string) => {
      return hitlServer.sendVideoAnswer(droneId, sdp);
    },
  );

  ipcMain.handle(
    'hitl:iceCandidate',
    (_event, droneId: string, candidate: string, sdpMid: string, sdpMlineIndex: number) => {
      return hitlServer.sendIceCandidate(droneId, candidate, sdpMid, sdpMlineIndex);
    },
  );
}
