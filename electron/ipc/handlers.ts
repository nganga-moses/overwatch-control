import { ipcMain } from 'electron';
import type { OverwatchDB } from '../storage/overwatch-db';
import type { VenueManager } from '../services/venue-manager';
import type { AssetManager } from '../services/asset-manager';
import { registerVenueHandlers } from './venue-handlers';
import { registerAssetHandlers } from './asset-handlers';

export function registerIPCHandlers(
  db: OverwatchDB,
  venueManager: VenueManager,
  assetManager: AssetManager,
): void {
  // World Model node/edge handlers
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

  registerVenueHandlers(venueManager);
  registerAssetHandlers(assetManager);
}
