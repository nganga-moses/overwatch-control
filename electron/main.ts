import { app, BrowserWindow } from 'electron';
import path from 'path';
import { OverwatchDB } from './storage/overwatch-db';
import { VenueManager } from './services/venue-manager';
import { AssetManager } from './services/asset-manager';
import { registerIPCHandlers } from './ipc/handlers';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

app.setName('Overwatch Control');

let db: OverwatchDB | null = null;
let venueManager: VenueManager | null = null;
let assetManager: AssetManager | null = null;

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

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = path.join(getAssetsBase(), 'overwatch.png');
    app.dock.setIcon(dockIcon);
  }

  db = new OverwatchDB(app.getPath('userData'));
  db.initialize();

  venueManager = new VenueManager(db);
  assetManager = new AssetManager(db);

  registerIPCHandlers(db, venueManager, assetManager);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
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
