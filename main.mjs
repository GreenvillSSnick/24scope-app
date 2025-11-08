import { app, BrowserWindow, BrowserView, ipcMain, shell } from 'electron';
import path from 'path';
import { createRequire } from 'node:module';
import axios from 'axios';
import EventEmitter from 'events';
const require = createRequire(import.meta.url);

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.cwd(), 'build', '256x256.png'),
    frame: false,
    webPreferences: {
      preload: path.join(process.cwd(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:24scope'
    }
  });

  const topBar = new BrowserView({
    webPreferences: {
      preload: path.join(process.cwd(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setBrowserView(topBar);
  topBar.setBounds({ x: 0, y: 0, width: 1200, height: 32 });
  topBar.setAutoResize({ width: true });
  topBar.webContents.loadFile(path.join(process.cwd(), 'topbar.html'));
  const contentView = new BrowserView({
    icon: path.join(process.cwd(), 'build', '256x256.png'),
    webPreferences: {
      preload: path.join(process.cwd(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.addBrowserView(contentView);
  contentView.setBounds({ x: 0, y: 32, width: 1200, height: 768 });
  contentView.setAutoResize({ width: true, height: true });
  await contentView.webContents.loadURL('https://zedruc.net/24scope/');

  mainWindow.on('closed', () => (mainWindow = null));
}

app.whenReady().then(async () => {
  await handler.setup();
  await createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', async () => {
  await handler.cleanup();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('window-control', (event, action) => {
  console.log(`Received window-control action: ${action}`);
  if (!mainWindow) {
    console.error('mainWindow is null');
    return;
  }
  switch (action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (mainWindow.isMaximized()) {
        mainWindow.restore();
      } else {
        mainWindow.maximize();
      }
      break;
    case 'close':
      mainWindow.close();
      break;
    default:
      console.error(`Unknown action: ${action}`);
  }
});

ipcMain.handle('clear-cookies', async () => {
  console.log('Received clear-cookies request');
  if (!mainWindow) {
    console.error('mainWindow is null');
    return;
  }
  try {
    await mainWindow.webContents.session.clearStorageData({ storages: ['cookies'] });
    console.log('All cookies cleared!');
  } catch (e) {
    console.error('Failed to clear cookies:', e);
  }
});