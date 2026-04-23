const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('automation', {
  start: () => ipcRenderer.invoke('automation:start'),
  stop: () => ipcRenderer.invoke('automation:stop'),
  status: () => ipcRenderer.invoke('automation:status'),
});

contextBridge.exposeInMainWorld('follower', {
  start: (options) => ipcRenderer.invoke('follower:start', options),
  stop: () => ipcRenderer.invoke('follower:stop'),
  status: () => ipcRenderer.invoke('follower:status'),
  stats: () => ipcRenderer.invoke('follower:stats'),
});
