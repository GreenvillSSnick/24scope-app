const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('myTitlebar', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
