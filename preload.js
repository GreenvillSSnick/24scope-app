const { contextBridge, ipcRenderer } = require('electron');
const { Titlebar, Color } = require('custom-electron-titlebar');

contextBridge.exposeInMainWorld('myTitlebar', {
  init: (opts) => {
    const titlebar = new Titlebar({
      backgroundColor: opts.backgroundColor ? Color.fromHex(opts.backgroundColor) : Color.fromHex('#333'),
      itemBackgroundColor: opts.itemBackgroundColor ? Color.fromHex(opts.itemBackgroundColor) : Color.fromHex('#555'),
      icon: opts.iconPath || null,
      drag: true,
      minimizable: true,
      maximizable: true,
      closeable: true,
      titleHorizontalAlignment: opts.titleAlignment || 'center',
      // you can add more options here per docs
    });

    // Add custom “Clear Cookies” button
    titlebar.addButton({
      icon: opts.clearIcon || '🗑',
      tooltip: 'Clear All Cookies',
      onClick: async () => {
        try {
          await ipcRenderer.invoke('clear-cookies');
          // optionally show a notification
          window.dispatchEvent(new Event('cookiesCleared'));
        } catch (err) {
          console.error('Clear cookies failed:', err);
        }
      }
    });

    return titlebar;
  },
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
