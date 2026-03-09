import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { OverwatchDB } from './storage/overwatch-db';
import { VenueManager } from './services/venue-manager';
import { AssetManager } from './services/asset-manager';
import { OperationManager } from './services/operation-manager';
import { SyncManager } from './services/sync-manager';
import { ActivationService } from './services/activation-service';
import { LLMManager } from './sidecar/llm-manager';
import { Orchestrator } from './services/orchestrator/index';
import { WhisperManager } from './sidecar/whisper-manager';
import { registerIPCHandlers } from './ipc/handlers';
import { registerOperationHandlers } from './ipc/operation-handlers';
import { bindSyncEvents } from './ipc/sync-handlers';
import { CommsManager } from './comms/comms-manager';
import { HITLServer } from './comms/hitl-server';
import { StreamManager } from './services/stream-manager';
import { MediaRelayManager } from './sidecar/media-relay';
import { registerStreamHandlers } from './ipc/stream-handlers';
import { registerCommsHandlers } from './ipc/comms-handlers';
import { registerHITLHandlers } from './ipc/hitl-handlers';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

app.setName('Overwatch Control');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      bypassCSP: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

let db: OverwatchDB | null = null;
let venueManager: VenueManager | null = null;
let assetManager: AssetManager | null = null;
let operationManager: OperationManager | null = null;
let syncManager: SyncManager | null = null;
let activationService: ActivationService | null = null;
let llmManager: LLMManager | null = null;
let orchestrator: Orchestrator | null = null;
let whisperManager: WhisperManager | null = null;
let commsManager: CommsManager | null = null;
let hitlServer: HITLServer | null = null;
let streamManager: StreamManager | null = null;
let mediaRelay: MediaRelayManager | null = null;

/** Current comms mode: 'simulation' uses tick-based sim, 'live' uses CommsManager. */
let commsMode: 'simulation' | 'live' = 'simulation';

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

function startSyncManager(): void {
  if (syncManager || !db) return;

  let cloudApiUrl = process.env.OW_CLOUD_API_URL;
  let apiKey = process.env.OW_API_KEY;
  let workstationId = process.env.OW_WORKSTATION_ID;

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
    return;
  }

  syncManager = new SyncManager(
    {
      cloudApiUrl,
      apiKey,
      workstationId,
      dataDir: app.getPath('userData'),
      syncIntervalMs: parseInt(process.env.OW_SYNC_INTERVAL_MS ?? '300000', 10),
      heartbeatIntervalMs: parseInt(process.env.OW_HEARTBEAT_INTERVAL_MS ?? '60000', 10),
    },
    db,
  );

  if (venueManager) venueManager.setSyncManager(syncManager);
  if (assetManager) assetManager.setSyncManager(syncManager);
  if (operationManager) operationManager.setSyncManager(syncManager);

  bindSyncEvents(syncManager);

  syncManager.start().catch((err) => {
    console.error('[Main] SyncManager failed to start:', err);
  });

  console.info('[Main] SyncManager initialized and started');
}

app.whenReady().then(async () => {
  protocol.handle('local-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-file://', ''));
    return net.fetch(pathToFileURL(filePath).toString());
  });

  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = path.join(getAssetsBase(), 'overwatch.png');
    app.dock.setIcon(dockIcon);
  }

  db = new OverwatchDB(app.getPath('userData'));
  db.initialize();

  activationService = new ActivationService(db);
  venueManager = new VenueManager(db);
  assetManager = new AssetManager(db);
  operationManager = new OperationManager(db);

  llmManager = new LLMManager({
    model: process.env.OW_LLM_MODEL ?? 'qwen3:32b',
    ollamaPath: process.env.OLLAMA_PATH ?? 'ollama',
  });

  orchestrator = new Orchestrator({
    llm: llmManager,
    db: db.getDatabase(),
  });

  whisperManager = new WhisperManager({
    serverPath: process.env.WHISPER_SERVER_PATH ?? 'whisper-server',
    modelPath: process.env.WHISPER_MODEL_PATH ?? '',
  });

  registerIPCHandlers(db, venueManager, assetManager, activationService, () => syncManager, {
    getLlm: () => llmManager,
    getOrchestrator: () => orchestrator,
    getWhisper: () => whisperManager,
  });
  registerOperationHandlers(operationManager);

  // Try to start sync (will succeed if already activated)
  startSyncManager();

  // Re-initialize sync after activation completes
  ipcMain.on('activation:complete', () => {
    startSyncManager();
  });

  const mainWindow = createWindow();

  orchestrator!.setMainWindow(mainWindow);

  // -----------------------------------------------------------------------
  // Comms layer (live mode only — simulation mode uses the sim engine)
  // -----------------------------------------------------------------------
  commsMode = (process.env.OW_COMMS_MODE === 'live') ? 'live' : 'simulation';

  commsManager = new CommsManager({
    swarmServerPort: parseInt(process.env.OW_SWARM_PORT ?? '9200', 10),
    swarmAuthToken: process.env.OW_SWARM_AUTH_TOKEN ?? '',
    owId: process.env.OW_WORKSTATION_ID ?? 'overwatch-default',
  });
  commsManager.setMainWindow(mainWindow);

  hitlServer = new HITLServer(
    parseInt(process.env.OW_HITL_PORT ?? '9201', 10),
    process.env.OW_HITL_AUTH_TOKEN ?? '',
  );

  hitlServer.setHandlers(
    (info) => mainWindow.webContents.send('ow-hitl-alert', info),
    (droneId, telem) => mainWindow.webContents.send('ow-hitl-telemetry', { droneId, ...telem }),
    (info, event) => mainWindow.webContents.send('ow-hitl-session', { info, event }),
  );

  hitlServer.setVideoHandlers({
    onVideoOffer: (droneId, sdp) => {
      mainWindow.webContents.send('hitl-video-offer', { droneId, sdp });
    },
    onIceCandidate: (droneId, candidate, sdpMid, sdpMlineIndex) => {
      mainWindow.webContents.send('hitl-ice-candidate', {
        droneId, candidate, sdpMid, sdpMlineIndex,
      });
    },
  });

  registerHITLHandlers(hitlServer);

  mediaRelay = new MediaRelayManager({
    recordPath: path.join(app.getPath('home'), 'overwatch-recordings'),
  });
  streamManager = new StreamManager();
  registerStreamHandlers(streamManager, mediaRelay);
  registerCommsHandlers(commsManager);

  streamManager.init({
    mainWindow,
    sendToSwarm: (swarmId, msg) => {
      const sessions = commsManager!.getAllSwarmStatuses();
      const targetId = swarmId === '*'
        ? sessions[0]?.swarmId ?? ''
        : swarmId;
      if (targetId) {
        const payload = (msg as { payload: unknown }).payload;
        const msgType = (msg as { type: string }).type;
        if (msgType === 'start_stream') {
          commsManager!.sendSwarmCommand(targetId, 'start_stream', undefined, payload);
        } else if (msgType === 'stop_stream') {
          commsManager!.sendSwarmCommand(targetId, 'stop_stream', undefined, payload);
        } else if (msgType === 'set_bitrate') {
          commsManager!.sendSwarmCommand(targetId, 'set_bitrate', undefined, payload);
        } else if (msgType === 'set_resolution') {
          commsManager!.sendSwarmCommand(targetId, 'set_resolution', undefined, payload);
        }
      }
    },
    sendHITLCommand: (droneId, msg) => {
      if (!hitlServer) return;
      const payload = (msg as { type: string; payload?: unknown }).payload;
      const msgType = (msg as { type: string }).type;
      if (msgType === 'start_stream' || msgType === 'stop_stream' || msgType === 'set_bitrate' || msgType === 'set_resolution') {
        const sessions = commsManager?.getAllSwarmStatuses() ?? [];
        const targetSwarm = sessions[0]?.swarmId;
        if (targetSwarm && commsManager) {
          commsManager.sendSwarmCommand(targetSwarm, msgType, droneId, payload);
        }
      } else {
        hitlServer.sendCommand(droneId, msg as Record<string, unknown>);
      }
    },
    getSwarmMembers: (swarmId) => {
      if (!commsManager) return [];
      return commsManager.getMemberDroneIds(swarmId);
    },
    getConnectedSwarmIds: () => {
      if (!commsManager) return [];
      return commsManager.getAllSwarmStatuses().map((s) => s.swarmId);
    },
  });

  commsManager.on('stream-started', (_swarmId: string, payload: Record<string, unknown>) => {
    if (!streamManager) return;
    try {
      streamManager.handleStreamStarted(payload as {
        drone_id: string;
        mode: 'preview' | 'hitl';
        resolution: string;
        bitrate_kbps: number;
        rtsp_url: string | null;
      });
    } catch (err) {
      console.error('[Main] Error handling stream-started:', err);
    }
  });
  commsManager.on('stream-stopped', (_swarmId: string, payload: Record<string, unknown>) => {
    if (!streamManager) return;
    try {
      streamManager.handleStreamStopped(payload.drone_id as string);
    } catch (err) {
      console.error('[Main] Error handling stream-stopped:', err);
    }
  });
  commsManager.on('stream-error', (_swarmId: string, payload: Record<string, unknown>) => {
    if (!streamManager) return;
    try {
      streamManager.handleStreamError(payload.drone_id as string, payload.reason as string);
    } catch (err) {
      console.error('[Main] Error handling stream-error:', err);
    }
  });

  if (commsMode === 'live') {
    commsManager.start();
    hitlServer.start();
    mediaRelay.start().catch((err) => {
      console.error('[Main] Failed to start MediaRelay:', err);
    });
    console.info('[Main] Live comms mode: SwarmServer + HITL + MediaRelay active');
  } else {
    console.info('[Main] Simulation comms mode: using tick-based sim engine');
  }

  // Mode switch via IPC
  ipcMain.handle('ow:set-comms-mode', async (_event, mode: 'simulation' | 'live') => {
    if (mode === commsMode) return { ok: true, mode };
    commsMode = mode;
    if (mode === 'live') {
      commsManager!.start();
      hitlServer!.start();
      mediaRelay?.start().catch((err) => {
        console.error('[Main] Failed to start MediaRelay:', err);
      });
    } else {
      hitlServer!.stop();
      commsManager!.stop();
      mediaRelay?.stop().catch((err) => {
        console.error('[Main] Failed to stop MediaRelay:', err);
      });
    }
    console.info(`[Main] Comms mode switched to: ${mode}`);
    return { ok: true, mode };
  });

  llmManager!.start().catch((err) => {
    console.warn('[Main] Ollama not available:', err instanceof Error ? err.message : err);
  });

  llmManager!.on('status-change', (status: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('llm:status-change', status);
    }
  });

  orchestrator!.start().catch((err) => {
    console.error('[Main] Orchestrator failed to start:', err);
  });

  whisperManager!.start().catch((err) => {
    console.warn('[Main] Whisper not available:', err instanceof Error ? err.message : err);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let isShuttingDown = false;
app.on('before-quit', (event) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  event.preventDefault();

  if (hitlServer) {
    hitlServer.stop();
    hitlServer = null;
  }
  streamManager = null;
  if (commsManager) {
    commsManager.stop();
    commsManager = null;
  }

  const shutdownPromises: Promise<void>[] = [];

  if (mediaRelay) {
    shutdownPromises.push(mediaRelay.stop());
    mediaRelay = null;
  }
  if (orchestrator) {
    shutdownPromises.push(orchestrator.stop());
    orchestrator = null;
  }
  if (llmManager) {
    shutdownPromises.push(llmManager.stop());
    llmManager = null;
  }
  if (whisperManager) {
    shutdownPromises.push(whisperManager.stop());
    whisperManager = null;
  }
  if (syncManager) {
    shutdownPromises.push(syncManager.stop());
    syncManager = null;
  }

  const finish = () => {
    if (db) {
      db.close();
      db = null;
    }
    app.exit(0);
  };

  if (shutdownPromises.length > 0) {
    const timeout = setTimeout(finish, 5000);
    Promise.allSettled(shutdownPromises).then((results) => {
      clearTimeout(timeout);
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('[Main] Sidecar shutdown error:', result.reason);
        }
      }
      finish();
    });
  } else {
    finish();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
