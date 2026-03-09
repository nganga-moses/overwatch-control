/**
 * IPC handlers for video streaming in Overwatch.
 *
 * Bridges the renderer (React) to the StreamManager and MediaRelayManager.
 */

import { ipcMain } from 'electron';
import type { StreamManager, VideoStreamMode } from '../services/stream-manager';
import type { MediaRelayManager } from '../sidecar/media-relay';

export function registerStreamHandlers(
  streamManager: StreamManager,
  mediaRelay: MediaRelayManager,
): void {
  ipcMain.handle(
    'stream:request',
    async (_event, droneId: string, mode: VideoStreamMode) => {
      await streamManager.requestStream(droneId, mode);
    },
  );

  ipcMain.handle('stream:release', async (_event, droneId: string) => {
    await streamManager.releaseStream(droneId);
  });

  ipcMain.handle(
    'stream:requestFeedGrid',
    async (_event, swarmId: string) => {
      await streamManager.requestFeedGrid(swarmId);
    },
  );

  ipcMain.handle('stream:releaseFeedGrid', async () => {
    await streamManager.releaseFeedGrid();
  });

  ipcMain.handle('stream:getActive', () => {
    return streamManager.getActiveStreams();
  });

  ipcMain.handle('stream:getWhepUrl', (_event, droneId: string) => {
    return streamManager.getWhepUrl(droneId);
  });

  ipcMain.handle('stream:upgradeTile', async (_event, droneId: string) => {
    await streamManager.upgradeTile(droneId);
  });

  ipcMain.handle('stream:revertTile', async (_event, droneId: string) => {
    await streamManager.revertTile(droneId);
  });

  ipcMain.handle('media:status', () => {
    return mediaRelay.getStatus();
  });

  ipcMain.handle('media:restart', async () => {
    await mediaRelay.restart();
  });

  ipcMain.handle('media:streams', async () => {
    return mediaRelay.getStreams();
  });
}
