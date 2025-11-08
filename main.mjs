import { app, BrowserWindow, BrowserView, ipcMain, shell } from 'electron';
import path from 'path';
import { createRequire } from 'node:module';
import axios from 'axios';
import EventEmitter from 'events';
const require = createRequire(import.meta.url);

function importAddon() {
  if (process.platform === 'win32' && process.arch === 'x64') {
    try {
      return import('node-nowplaying-win32-x64-msvc');
    } catch (e) {
      console.error(e);
      return null;
    }
  } else if (process.platform === 'darwin') {
    try {
      return import('node-nowplaying-darwin-universal');
    } catch (e) {
      console.error(e);
      return null;
    }
  } else if (process.platform === 'linux' && process.arch === 'x64') {
    try {
      return import('node-nowplaying-linux-x64-gnu');
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  console.error('No native addon available for this platform');
  return null;
}

function convertToSeconds(value) {
  if (!value || value <= 0) return 0;
  if (value > 3600) return value / 10_000_000;
  return value;
}

class NativeHandler extends EventEmitter {
  constructor() {
    super();
    this.instance = null;
    this.current = null;
    this.progressTimer = null;
    this.lastTrackId = null;
  }

  async setup() {
    const addon = importAddon();
    if (!addon) throw new Error('No native addon available');

    this.instance = new addon.NowPlaying(async (event) => {
      const trackId = `${event.trackName}|${event.album}|${Array.isArray(event.artist) ? event.artist.join(',') : event.artist}`;
      const isNewTrack = trackId !== this.lastTrackId;
      if (isNewTrack) this.lastTrackId = trackId;

      this.current = event;

      if (isNewTrack && event.thumbnail) {
        try {
          this.current.thumbnailData = await this.fetchImage(event.thumbnail);
        } catch (e) {
          console.error('Failed to fetch thumbnail', e);
          this.current.thumbnailData = null;
        }
      }

      this.emitPlayback();
      this.startProgressTimer();
    });

    await this.instance.subscribe();
    if (await this.getPlayback()) this.emitPlayback();
  }

  async cleanup() {
    if (this.progressTimer) clearInterval(this.progressTimer);
    if (this.instance) await this.instance.unsubscribe();
    this.instance = null;
    this.removeAllListeners();
  }

  async fetchImage(url) {
    if (!url) return null;
    if (url.startsWith('data:image')) return Buffer.from(url.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    else if (url.startsWith('http')) return Buffer.from((await axios.get(url, { responseType: 'arraybuffer' })).data);
    return null;
  }

  filterData(event) {
    if (!event || !event.trackName) return null;
    const { isPlaying, volume, shuffleState, repeatState, trackName, artist, album, trackDuration, trackProgress, canChangeVolume, canSkip } = event;
    const totalSec = convertToSeconds(trackDuration ?? 0);
    const currentSec = convertToSeconds(trackProgress ?? 0);
    const repeatStateMap = { off: 'off', all: 'on', track: 'one' };

    return {
      isPlaying,
      volume,
      shuffle: shuffleState ?? false,
      repeat: repeatStateMap[repeatState ?? 'off'],
      track: {
        name: trackName,
        artists: Array.isArray(artist) ? artist : (artist ? [artist] : []),
        album: album ?? '',
        duration: { current: currentSec * 1000, total: totalSec * 1000 },
        thumbnailBase64: event.thumbnailData ? event.thumbnailData.toString('base64') : null,
        coverArtSrc: event.thumbnailData ? `data:image/png;base64,${event.thumbnailData.toString('base64')}` : ''
      },
      supportedActions: ['play', 'pause', ...(canChangeVolume ? ['volume'] : []), ...(canSkip ? ['next', 'previous', 'seek'] : [])]
    };
  }

  emitPlayback() {
    if (!this.current) return;
    const data = this.filterData(this.current);
    if (!data) return;
    if (mainWindow) mainWindow.webContents.send('playback-update', data);
    this.emit('playback', data);
  }

  startProgressTimer() {
    if (this.progressTimer) clearInterval(this.progressTimer);
    if (!this.current?.isPlaying) return;

    this.progressTimer = setInterval(() => {
      if (!this.current?.isPlaying) {
        clearInterval(this.progressTimer);
        this.progressTimer = null;
        return;
      }
      const durationSec = convertToSeconds(this.current.trackDuration ?? 0);
      const progressSec = Math.min(convertToSeconds(this.current.trackProgress ?? 0) + 1, durationSec);
      this.current.trackProgress = progressSec;
      this.emitPlayback();
    }, 1000);
  }

  async getPlayback() {
    return this.current ? this.filterData(this.current) : null;
  }
  async play() {
    if (!this.instance) return;
    await this.instance.play();
    if (this.current) this.current.isPlaying = true;
    this.emitPlayback();
    this.startProgressTimer();
  }
  async pause() {
    if (!this.instance) return;
    await this.instance.pause();
    if (this.current) this.current.isPlaying = false;
    this.emitPlayback();
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
  }
  async next() {
    if (this.instance) await this.instance.nextTrack();
  }
  async previous() {
    if (this.instance) await this.instance.previousTrack();
  }
  async seekTo(ms) {
    if (!this.instance) return;
    await this.instance.seekTo(ms / 1000);
    if (this.current) this.current.trackProgress = ms / 1000;
    this.emitPlayback();
  }
  async setVolume(volume) {
    if (this.instance) await this.instance.setVolume(volume);
  }
}

const handler = new NativeHandler();
let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.cwd(), 'assets', 'icon.jpg'),
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
//   // Temporarily enable DevTools for debugging
//   topBar.webContents.openDevTools();

  const contentView = new BrowserView({
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

ipcMain.handle('get-now-playing', async () => await handler.getPlayback());
ipcMain.handle('play', async () => await handler.play());
ipcMain.handle('pause', async () => await handler.pause());
ipcMain.handle('next', async () => await handler.next());
ipcMain.handle('previous', async () => await handler.previous());
ipcMain.handle('seek', async (e, ms) => await handler.seekTo(ms));
ipcMain.handle('set-volume', async (e, vol) => await handler.setVolume(vol));
ipcMain.handle('open-external', async (e, url) => await shell.openExternal(url));

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
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
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