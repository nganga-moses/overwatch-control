import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  subscribe: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('store-update', handler);
    return () => ipcRenderer.removeListener('store-update', handler);
  },
  disconnect: () => {
    ipcRenderer.removeAllListeners('store-update');
  },

  worldModel: {
    writeNode: (node: unknown) => ipcRenderer.invoke('wm:writeNode', node),
    getNode: (id: string) => ipcRenderer.invoke('wm:getNode', id),
    queryNodes: (filters?: unknown) =>
      ipcRenderer.invoke('wm:queryNodes', filters),
    queryNodesBySimilarity: (
      embedding: number[],
      limit?: number,
      filters?: unknown,
    ) =>
      ipcRenderer.invoke('wm:queryNodesBySimilarity', embedding, limit, filters),
    writeEdge: (edge: unknown) => ipcRenderer.invoke('wm:writeEdge', edge),
    queryEdges: (filters?: unknown) =>
      ipcRenderer.invoke('wm:queryEdges', filters),
  },

  venues: {
    create: (venue: unknown) => ipcRenderer.invoke('venue:create', venue),
    get: (id: string) => ipcRenderer.invoke('venue:get', id),
    list: (filters?: unknown) => ipcRenderer.invoke('venue:list', filters),
    update: (id: string, patch: unknown) =>
      ipcRenderer.invoke('venue:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('venue:delete', id),
    createZone: (zone: unknown) =>
      ipcRenderer.invoke('venue:createZone', zone),
    getZones: (venueId: string) =>
      ipcRenderer.invoke('venue:getZones', venueId),
    updateZone: (id: string, patch: unknown) =>
      ipcRenderer.invoke('venue:updateZone', id, patch),
    deleteZone: (id: string) => ipcRenderer.invoke('venue:deleteZone', id),
    createPerchPoint: (point: unknown) =>
      ipcRenderer.invoke('venue:createPerchPoint', point),
    getPerchPoints: (zoneId: string) =>
      ipcRenderer.invoke('venue:getPerchPoints', zoneId),
    updatePerchPoint: (id: string, patch: Record<string, unknown>) =>
      ipcRenderer.invoke('venue:updatePerchPoint', id, patch),
    deletePerchPoint: (id: string) =>
      ipcRenderer.invoke('venue:deletePerchPoint', id),
    deleteFloorPlan: (venueId: string) =>
      ipcRenderer.invoke('venue:deleteFloorPlan', venueId),
    pickFloorPlanFile: () =>
      ipcRenderer.invoke('venue:pickFloorPlanFile'),
    uploadFloorPlan: (venueId: string, filePath: string, options?: { floorLevel?: number; pageNumber?: number }) =>
      ipcRenderer.invoke('venue:uploadFloorPlan', venueId, filePath, options),
    getPageCount: (venueId: string, blobKey: string) =>
      ipcRenderer.invoke('venue:getPageCount', venueId, blobKey),
    pollIngestion: (venueId: string, jobId: string) =>
      ipcRenderer.invoke('venue:pollIngestion', venueId, jobId),
    pullFloorPlan: (venueId: string) =>
      ipcRenderer.invoke('venue:pullFloorPlan', venueId),
    evictFloorPlan: (venueId: string) =>
      ipcRenderer.invoke('venue:evictFloorPlan', venueId),
    isFloorPlanCached: (venueId: string) =>
      ipcRenderer.invoke('venue:isFloorPlanCached', venueId),
    getFloorPlanPath: (venueId: string) =>
      ipcRenderer.invoke('venue:getFloorPlanPath', venueId),
    getFloorPlanDataUrl: (venueId: string, floorLevel?: number) =>
      ipcRenderer.invoke('venue:getFloorPlanDataUrl', venueId, floorLevel),
    getFloorImageLevels: (venueId: string) =>
      ipcRenderer.invoke('venue:getFloorImageLevels', venueId),
    fetchIntelligence: (venueId: string) =>
      ipcRenderer.invoke('venue:fetchIntelligence', venueId),
    recordSurfaceAssessment: (data: unknown) =>
      ipcRenderer.invoke('venue:recordSurfaceAssessment', data),
    getPerchPointHistory: (perchPointId: string) =>
      ipcRenderer.invoke('venue:getPerchPointHistory', perchPointId),
    getPerchPointStats: (perchPointId: string) =>
      ipcRenderer.invoke('venue:getPerchPointStats', perchPointId),
  },

  assets: {
    createKit: (kit: unknown) => ipcRenderer.invoke('asset:createKit', kit),
    getKit: (id: string) => ipcRenderer.invoke('asset:getKit', id),
    listKits: () => ipcRenderer.invoke('asset:listKits'),
    updateKit: (id: string, patch: unknown) =>
      ipcRenderer.invoke('asset:updateKit', id, patch),
    deleteKit: (id: string) => ipcRenderer.invoke('asset:deleteKit', id),
    createDrone: (drone: unknown) =>
      ipcRenderer.invoke('asset:createDrone', drone),
    getDrone: (id: string) => ipcRenderer.invoke('asset:getDrone', id),
    listDrones: (kitId?: string) =>
      ipcRenderer.invoke('asset:listDrones', kitId),
    updateDrone: (id: string, patch: unknown) =>
      ipcRenderer.invoke('asset:updateDrone', id, patch),
    deleteDrone: (id: string) => ipcRenderer.invoke('asset:deleteDrone', id),
    onboard: (serial: string) =>
      ipcRenderer.invoke('asset:onboard', serial),
  },

  operations: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('operation:create', data),
    get: (id: string) => ipcRenderer.invoke('operation:get', id),
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('operation:list', filters),
    update: (id: string, patch: Record<string, unknown>) => ipcRenderer.invoke('operation:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('operation:delete', id),
    startBriefing: (id: string) => ipcRenderer.invoke('operation:startBriefing', id),
    deploy: (id: string, briefingJson: Record<string, unknown>) => ipcRenderer.invoke('operation:deploy', id, briefingJson),
    complete: (id: string) => ipcRenderer.invoke('operation:complete', id),
    abort: (id: string) => ipcRenderer.invoke('operation:abort', id),
    pause: (id: string) => ipcRenderer.invoke('operation:pause', id),
    resume: (id: string) => ipcRenderer.invoke('operation:resume', id),
    getMetrics: (id: string) => ipcRenderer.invoke('operation:getMetrics', id),
    getDebrief: (id: string) => ipcRenderer.invoke('operation:getDebrief', id),
  },

  principals: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('principal:create', data),
    list: () => ipcRenderer.invoke('principal:list'),
    update: (id: string, patch: Record<string, unknown>) => ipcRenderer.invoke('principal:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('principal:delete', id),
  },

  agents: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('agent:create', data),
    list: () => ipcRenderer.invoke('agent:list'),
    update: (id: string, patch: Record<string, unknown>) => ipcRenderer.invoke('agent:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('agent:delete', id),
  },

  weather: {
    getCurrent: (lat: number, lng: number) => ipcRenderer.invoke('weather:getCurrent', lat, lng),
    getForecast: (lat: number, lng: number, hours?: number) => ipcRenderer.invoke('weather:getForecast', lat, lng, hours),
  },

  comms: {
    sendCommand: (swarmId: string, command: unknown, targetDroneId?: string, parameters?: unknown) =>
      ipcRenderer.invoke('comms:sendCommand', swarmId, command, targetDroneId, parameters),
    getSwarmStatus: (swarmId: string) => ipcRenderer.invoke('comms:getSwarmStatus', swarmId),
    getAllStatuses: () => ipcRenderer.invoke('comms:getAllStatuses'),
    sendPerchCommand: (data: unknown) => ipcRenderer.invoke('comms:sendPerchCommand', data),
    sendRepositionCommand: (data: unknown) => ipcRenderer.invoke('comms:sendRepositionCommand', data),
    getMeshRepeaters: (swarmId: string) => ipcRenderer.invoke('comms:getMeshRepeaters', swarmId),
    setCommsMode: (mode: 'simulation' | 'live') => ipcRenderer.invoke('ow:set-comms-mode', mode),
    onDroneMessage: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('drone-message', handler);
      return () => ipcRenderer.removeListener('drone-message', handler);
    },
    onSwarmConnection: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-swarm-connection', handler);
      return () => ipcRenderer.removeListener('ow-swarm-connection', handler);
    },
    onIndoorTelemetry: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-indoor-telemetry', handler);
      return () => ipcRenderer.removeListener('ow-indoor-telemetry', handler);
    },
    onSafetyEvent: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-safety-event', handler);
      return () => ipcRenderer.removeListener('ow-safety-event', handler);
    },
    onPerchResult: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-perch-result', handler);
      return () => ipcRenderer.removeListener('ow-perch-result', handler);
    },
  },

  streaming: {
    request: (droneId: string, mode: string, resolution?: string) =>
      ipcRenderer.invoke('stream:request', droneId, mode, resolution),
    release: (droneId: string) => ipcRenderer.invoke('stream:release', droneId),
    requestFeedGrid: (swarmId: string) => ipcRenderer.invoke('stream:requestFeedGrid', swarmId),
    releaseFeedGrid: () => ipcRenderer.invoke('stream:releaseFeedGrid'),
    getActive: () => ipcRenderer.invoke('stream:getActive'),
    getWhepUrl: (droneId: string) => ipcRenderer.invoke('stream:getWhepUrl', droneId),
    upgradeTile: (droneId: string) => ipcRenderer.invoke('stream:upgradeTile', droneId),
    revertTile: (droneId: string) => ipcRenderer.invoke('stream:revertTile', droneId),
    onStreamEvent: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('stream-event', handler);
      return () => ipcRenderer.removeListener('stream-event', handler);
    },
    onStreamStarted: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-stream-started', handler);
      return () => ipcRenderer.removeListener('ow-stream-started', handler);
    },
    onStreamStopped: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-stream-stopped', handler);
      return () => ipcRenderer.removeListener('ow-stream-stopped', handler);
    },
    onStreamError: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-stream-error', handler);
      return () => ipcRenderer.removeListener('ow-stream-error', handler);
    },
    mediaStatus: () => ipcRenderer.invoke('media:status'),
    mediaRestart: () => ipcRenderer.invoke('media:restart'),
    mediaStreams: () => ipcRenderer.invoke('media:streams'),
  },

  hitl: {
    sendCommand: (droneId: string, command: unknown) =>
      ipcRenderer.invoke('hitl:sendCommand', droneId, command),
    handback: (droneId: string) => ipcRenderer.invoke('hitl:handback', droneId),
    getSession: (droneId: string) => ipcRenderer.invoke('hitl:getSession', droneId),
    getAllSessions: () => ipcRenderer.invoke('hitl:getAllSessions'),
    videoAnswer: (droneId: string, sdp: string) =>
      ipcRenderer.invoke('hitl:videoAnswer', droneId, sdp),
    iceCandidate: (droneId: string, candidate: string, sdpMid: string, sdpMlineIndex: number) =>
      ipcRenderer.invoke('hitl:iceCandidate', droneId, candidate, sdpMid, sdpMlineIndex),
    onVideoOffer: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('hitl-video-offer', handler);
      return () => ipcRenderer.removeListener('hitl-video-offer', handler);
    },
    onIceCandidate: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('hitl-ice-candidate', handler);
      return () => ipcRenderer.removeListener('hitl-ice-candidate', handler);
    },
    onAlert: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-hitl-alert', handler);
      return () => ipcRenderer.removeListener('ow-hitl-alert', handler);
    },
    onTelemetry: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-hitl-telemetry', handler);
      return () => ipcRenderer.removeListener('ow-hitl-telemetry', handler);
    },
    onSession: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('ow-hitl-session', handler);
      return () => ipcRenderer.removeListener('ow-hitl-session', handler);
    },
  },

  auth: {
    isActivated: () => ipcRenderer.invoke('auth:isActivated'),
    activate: (cloudUrl: string, code: string) =>
      ipcRenderer.invoke('auth:activate', cloudUrl, code),
    getOperators: () => ipcRenderer.invoke('auth:getOperators'),
    findOperator: (name: string) => ipcRenderer.invoke('auth:findOperator', name),
    getChallengePositions: (excludePositions?: number[]) =>
      ipcRenderer.invoke('auth:getChallengePositions', excludePositions),
    validatePin: (operatorId: string, positions: number[], digits: string[]) =>
      ipcRenderer.invoke('auth:validatePin', operatorId, positions, digits),
    writeAuditLog: (entry: { operatorId: string; action: string; detail?: string }) =>
      ipcRenderer.invoke('auth:writeAuditLog', entry),
    getCustomerName: () => ipcRenderer.invoke('auth:getCustomerName'),
  },

  orchestrator: {
    process: (text: string, forcedMode?: string) =>
      ipcRenderer.invoke('orchestrator:process', text, forcedMode),
    processVoice: (text: string) =>
      ipcRenderer.invoke('orchestrator:processVoice', text),
    setMode: (mode: string) => ipcRenderer.invoke('orchestrator:setMode', mode),
    getMode: () => ipcRenderer.invoke('orchestrator:getMode'),
    getTranscript: () => ipcRenderer.invoke('orchestrator:getTranscript'),
    respondToCard: (cardId: string, action: string) =>
      ipcRenderer.invoke('orchestrator:respondToCard', cardId, action),
    getSituation: () => ipcRenderer.invoke('orchestrator:getSituation'),
    onMessage: (callback: (msg: unknown) => void) => {
      const handler = (_event: unknown, msg: unknown) => callback(msg);
      ipcRenderer.on('orchestrator-message', handler);
      return () => ipcRenderer.removeListener('orchestrator-message', handler);
    },
    onActionCard: (callback: (card: unknown) => void) => {
      const handler = (_event: unknown, card: unknown) => callback(card);
      ipcRenderer.on('orchestrator-action-card', handler);
      return () => ipcRenderer.removeListener('orchestrator-action-card', handler);
    },
    onActionExecuted: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('orchestrator-action-executed', handler);
      return () => ipcRenderer.removeListener('orchestrator-action-executed', handler);
    },
    onAlert: (callback: (alert: unknown) => void) => {
      const handler = (_event: unknown, alert: unknown) => callback(alert);
      ipcRenderer.on('orchestrator-alert', handler);
      return () => ipcRenderer.removeListener('orchestrator-alert', handler);
    },
    onCommand: (callback: (cmd: unknown) => void) => {
      const handler = (_event: unknown, cmd: unknown) => callback(cmd);
      ipcRenderer.on('orchestrator-command', handler);
      return () => ipcRenderer.removeListener('orchestrator-command', handler);
    },
  },

  voice: {
    checkPermission: () => ipcRenderer.invoke('voice:checkPermission'),
    requestPermission: () => ipcRenderer.invoke('voice:requestPermission'),
    startCapture: () => ipcRenderer.invoke('voice:startCapture'),
    pushAudioChunk: (chunk: ArrayBuffer) =>
      ipcRenderer.invoke('voice:pushAudioChunk', chunk),
    stopCapture: () => ipcRenderer.invoke('voice:stopCapture'),
    cancelCapture: () => ipcRenderer.invoke('voice:cancelCapture'),
    getStatus: () => ipcRenderer.invoke('voice:getStatus'),
  },

  llm: {
    getStatus: () => ipcRenderer.invoke('llm:getStatus'),
    onStatusChange: (callback: (status: unknown) => void) => {
      const handler = (_event: unknown, status: unknown) => callback(status);
      ipcRenderer.on('llm:status-change', handler);
      return () => ipcRenderer.removeListener('llm:status-change', handler);
    },
  },

  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    openSystemMicrophoneSettings: () => ipcRenderer.invoke('settings:openSystemMicrophoneSettings'),
  },

  sync: {
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    triggerSync: () => ipcRenderer.invoke('sync:triggerSync'),
    bootstrap: () => ipcRenderer.invoke('sync:bootstrap'),
    fetchKit: (serial: string) => ipcRenderer.invoke('sync:fetchKit', serial),
    fetchAllKits: () => ipcRenderer.invoke('sync:fetchAllKits'),
    onStatusUpdate: (callback: (status: unknown) => void) => {
      const handler = (_event: unknown, status: unknown) => callback(status);
      ipcRenderer.on('sync:status-update', handler);
      return () => ipcRenderer.removeListener('sync:status-update', handler);
    },
    onBootstrapped: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('sync:bootstrapped', handler);
      return () => ipcRenderer.removeListener('sync:bootstrapped', handler);
    },
  },
});
