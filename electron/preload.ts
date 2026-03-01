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
    deletePerchPoint: (id: string) =>
      ipcRenderer.invoke('venue:deletePerchPoint', id),
    uploadFloorPlan: (venueId: string, filePath: string) =>
      ipcRenderer.invoke('venue:uploadFloorPlan', venueId, filePath),
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

  comms: {
    sendCommand: (droneId: string, command: unknown) =>
      ipcRenderer.invoke('comms:sendCommand', droneId, command),
    onDroneMessage: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on('drone-message', handler);
      return () => ipcRenderer.removeListener('drone-message', handler);
    },
  },

  sync: {
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    triggerSync: () => ipcRenderer.invoke('sync:triggerSync'),
    bootstrap: () => ipcRenderer.invoke('sync:bootstrap'),
    fetchKit: (serial: string) => ipcRenderer.invoke('sync:fetchKit', serial),
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
