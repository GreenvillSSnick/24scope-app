const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  nodeNowPlaying: () => ipcRenderer.invoke('get-now-playing'),
  play: () => ipcRenderer.invoke('play'),
  pause: () => ipcRenderer.invoke('pause'),
  next: () => ipcRenderer.invoke('next'),
  previous: () => ipcRenderer.invoke('previous'),
  seek: (positionMs) => ipcRenderer.invoke('seek', positionMs),
  setVolume: (volume) => ipcRenderer.invoke('set-volume', volume),
  getImage: () => ipcRenderer.invoke('get-image'),
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
  }
});