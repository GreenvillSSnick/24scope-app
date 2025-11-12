import { app, BrowserWindow, BrowserView, ipcMain, shell } from 'electron';
import path from 'path';
import { createRequire } from 'node:module';
import axios from 'axios';
import EventEmitter from 'events';

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.cwd(), 'build', '256x256.png'),
    webPreferences: {
      preload: path.join(process.cwd(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:24scope'
    }
  });

  const contentView = new BrowserView({
    icon: path.join(process.cwd(), 'build', '256x256.png'),
    webPreferences: {
      preload: path.join(process.cwd(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.addBrowserView(contentView);
  contentView.setAutoResize({ width: true, height: true });
  await contentView.webContents.loadURL('https://zedruc.net/24scope/');

  mainWindow.on('closed', () => (mainWindow = null));
}

app.whenReady().then(async () => {
  await createWindow();
});