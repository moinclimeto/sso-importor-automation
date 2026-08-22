import dns from 'dns';
import { app, BrowserWindow, nativeImage } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* older Node */
}

import { initDatabase, dbJsonPath } from './db/database.js';
import { migrateFromJsonToSqlite } from './db/dataMigration.js';
import { registerAuthHandlers } from './authHandlers.js';
import { registerIpcHandlers } from './ipc/ipcHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ICON_PATH = path.join(__dirname, 'icon.png');

function createWindow() {
  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    titleBarStyle: 'default',
    show: false,
    title: 'SSO Importer',
  });

  win.once('ready-to-show', () => win.show());

  const zoomBy = (delta) => {
    const wc = win.webContents;
    const next = Math.min(3, Math.max(0.5, wc.getZoomFactor() + delta));
    wc.setZoomFactor(Number(next.toFixed(2)));
  };
  win.webContents.on('before-input-event', (event, input) => {
    if (!(input.control || input.meta) || input.type !== 'keyDown') return;
    const key = String(input.key || '');
    if (key === '=' || key === '+' || key === 'Add' || key === 'NumpadAdd') {
      event.preventDefault();
      zoomBy(0.1);
    } else if (key === '-' || key === '_' || key === 'Subtract' || key === 'NumpadSubtract') {
      event.preventDefault();
      zoomBy(-0.1);
    } else if (key === '0' || key === 'Numpad0') {
      event.preventDefault();
      win.webContents.setZoomFactor(1);
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5180');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.climeto.pwp');
  }
  await initDatabase(async (db) => {
    await migrateFromJsonToSqlite(db, dbJsonPath);
  });
  registerAuthHandlers();
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
