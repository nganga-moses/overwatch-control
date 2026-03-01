import { ipcMain } from 'electron';
import type { OverwatchDB } from '../storage/overwatch-db';
import type { VenueManager } from '../services/venue-manager';
import type { AssetManager } from '../services/asset-manager';
import type { SyncManager } from '../services/sync-manager';
import type { ActivationService } from '../services/activation-service';
import { registerVenueHandlers } from './venue-handlers';
import { registerAssetHandlers } from './asset-handlers';
import { registerSyncHandlers } from './sync-handlers';
import { registerAuthHandlers } from './auth-handlers';

export function registerIPCHandlers(
  db: OverwatchDB,
  venueManager: VenueManager,
  assetManager: AssetManager,
  activationService: ActivationService,
  syncManager?: SyncManager,
): void {
  ipcMain.handle('wm:writeNode', (_e, node) => db.writeNode(node));
  ipcMain.handle('wm:getNode', (_e, id: string) => db.getNode(id));
  ipcMain.handle('wm:queryNodes', (_e, filters?) => db.queryNodes(filters));
  ipcMain.handle(
    'wm:queryNodesBySimilarity',
    (_e, embedding: number[], limit?: number, filters?) =>
      db.queryNodesBySimilarity(embedding, limit, filters),
  );
  ipcMain.handle('wm:writeEdge', (_e, edge) => db.writeEdge(edge));
  ipcMain.handle('wm:queryEdges', (_e, filters?) => db.queryEdges(filters));

  registerAuthHandlers(activationService, db);
  registerVenueHandlers(venueManager);
  registerAssetHandlers(assetManager);

  if (syncManager) {
    registerSyncHandlers(syncManager);
  }
}
