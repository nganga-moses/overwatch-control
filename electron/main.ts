import { app, BrowserWindow } from 'electron';
import path from 'path';
import { OverwatchDB } from './storage/overwatch-db';
import { VenueManager } from './services/venue-manager';
import { AssetManager } from './services/asset-manager';
import { SyncManager } from './services/sync-manager';
import { ActivationService } from './services/activation-service';
import { registerIPCHandlers } from './ipc/handlers';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

app.setName('Overwatch Control');

let db: OverwatchDB | null = null;
let venueManager: VenueManager | null = null;
let assetManager: AssetManager | null = null;
let syncManager: SyncManager | null = null;
let activationService: ActivationService | null = null;

function getAssetsBase(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', '..', 'assets');
}

function createWindow(): BrowserWindow {
  const iconPath = path.join(getAssetsBase(), 'overwatch.png');

  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    title: 'Overwatch Control',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0d1117',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
}

function initSyncManager(overwatchDb: OverwatchDB): SyncManager | null {
  // Env vars take precedence (dev override)
  let cloudApiUrl = process.env.OW_CLOUD_API_URL;
  let apiKey = process.env.OW_API_KEY;
  let workstationId = process.env.OW_WORKSTATION_ID;

  // Fall back to DB-stored credentials from activation
  if (!cloudApiUrl || !apiKey || !workstationId) {
    const creds = activationService?.getCredentials();
    if (creds) {
      cloudApiUrl = cloudApiUrl ?? creds.cloudUrl;
      apiKey = apiKey ?? creds.apiKey;
      workstationId = workstationId ?? creds.workstationId;
    }
  }

  if (!cloudApiUrl || !apiKey || !workstationId) {
    console.info('[Main] Sync disabled — workstation not yet activated');
    return null;
  }

  return new SyncManager(
    {
      cloudApiUrl,
      apiKey,
      workstationId,
      dataDir: app.getPath('userData'),
      syncIntervalMs: parseInt(process.env.OW_SYNC_INTERVAL_MS ?? '300000', 10),
      heartbeatIntervalMs: parseInt(process.env.OW_HEARTBEAT_INTERVAL_MS ?? '60000', 10),
    },
    overwatchDb,
  );
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = path.join(getAssetsBase(), 'overwatch.png');
    app.dock.setIcon(dockIcon);
  }

  db = new OverwatchDB(app.getPath('userData'));
  db.initialize();

  activationService = new ActivationService(db);
  venueManager = new VenueManager(db);
  assetManager = new AssetManager(db);

  syncManager = initSyncManager(db);

  if (syncManager) {
    venueManager.setSyncManager(syncManager);
    assetManager.setSyncManager(syncManager);
  }

  registerIPCHandlers(db, venueManager, assetManager, activationService, syncManager ?? undefined);

  createWindow();

  if (syncManager) {
    syncManager.start().catch((err) => {
      console.error('[Main] SyncManager failed to start:', err);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (syncManager) {
    await syncManager.stop();
    syncManager = null;
  }
  if (db) {
    db.close();
    db = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
