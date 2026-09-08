import { loadEnvFile } from './loadEnv.js';
import dns from 'dns';
import fs from 'fs';
import { app, BrowserWindow, nativeImage, dialog } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { initMainMonitoring, onAppReadyMonitoring, attachWindowMonitoring, captureException } from './monitoring/init.js';
import { registerMonitoringHandlers } from './monitoring/ipc.js';
import { initDatabase, dbJsonPath } from './db/database.js';
import { migrateFromJsonToSqlite } from './db/dataMigration.js';
import { registerAuthHandlers } from './authHandlers.js';
import { appendStartupLog, getRendererIndexHtml } from './appPaths.js';

initMainMonitoring();
loadEnvFile();

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* older Node */
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ICON_PATH = path.join(__dirname, 'icon.png');

function showStartupError(title, err) {
  const message = err?.message || String(err || 'Unknown error');
  appendStartupLog(`ERROR ${title}: ${message}`);
  try {
    dialog.showErrorBox(title, message);
  } catch {
    console.error(title, err);
  }
}

const DEV_SERVER_URLS = [
  'http://127.0.0.1:5180/#/login',
  'http://localhost:5180/#/login',
];

function isDevMode() {
  return !app.isPackaged || process.env.NODE_ENV === 'development';
}

async function loadDevUi(win) {
  let lastError = null;
  for (const url of DEV_SERVER_URLS) {
    try {
      await win.loadURL(url);
      appendStartupLog(`loaded dev UI ${url}`);
      return;
    } catch (err) {
      lastError = err;
      appendStartupLog(`dev load failed ${url}: ${err?.message || err}`);
    }
  }
  throw lastError || new Error('Vite dev server not reachable on port 5180');
}

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
      preload: path.join(__dirname, 'preload.cjs'),
    },
    titleBarStyle: 'default',
    show: true,
    title: 'PIBO Importer',
  });

  const reveal = () => {
    if (win.isDestroyed()) return;
    if (!win.isVisible()) win.show();
    win.focus();
  };
  win.once('ready-to-show', reveal);
  setTimeout(reveal, 4000);

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

  attachWindowMonitoring(win);

  if (isDevMode()) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    appendStartupLog(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL || ''}`);
    showStartupError(
      'Climeto Importer could not load',
      new Error(`${errorDescription || 'Failed to load UI'} (${errorCode})`),
    );
  });

  if (isDevMode()) {
    loadDevUi(win).catch((err) => {
      captureException(err, { type: 'startup-dev-ui', process: 'main' });
      showStartupError('Climeto Importer could not load dev UI', err);
    });
    return win;
  }

  const indexHtml = getRendererIndexHtml();
  if (!fs.existsSync(indexHtml)) {
    const missing = new Error(`UI file not found:\n${indexHtml}`);
    captureException(missing, { type: 'startup-missing-ui', process: 'main' });
    showStartupError('Climeto Importer could not start', missing);
    return win;
  }
  win.loadFile(indexHtml);
  return win;
}

async function startApp() {
  appendStartupLog(`whenReady packaged=${app.isPackaged} userData=${app.getPath('userData')}`);
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.climeto.pwp');
  }

  try {
    registerMonitoringHandlers();
  } catch (err) {
    captureException(err, { type: 'startup-monitoring-ipc', process: 'main' });
  }

  createWindow();
  appendStartupLog('window created');

  onAppReadyMonitoring().catch((err) => {
    captureException(err, { type: 'startup-monitoring', process: 'main' });
    appendStartupLog(`monitoring failed: ${err?.message || err}`);
  });

  try {
    await initDatabase(async (database) => {
      await migrateFromJsonToSqlite(database, dbJsonPath);
    });
    appendStartupLog('database ready');
  } catch (err) {
    captureException(err, { type: 'startup-database', process: 'main' });
    showStartupError('Climeto Importer database error', err);
  }

  try {
    registerAuthHandlers();
  } catch (err) {
    captureException(err, { type: 'startup-auth', process: 'main' });
    showStartupError('Climeto Importer could not register login', err);
  }

  try {
    const { registerIpcHandlers } = await import('./ipc/ipcHandlers.js');
    registerIpcHandlers();
    appendStartupLog('ipc handlers ready');
  } catch (err) {
    captureException(err, { type: 'startup-ipc', process: 'main' });
    showStartupError('Climeto Importer background services failed', err);
  }
}

app.whenReady().then(startApp).catch((err) => {
  captureException(err, { type: 'startup-fatal', process: 'main' });
  showStartupError('Climeto Importer failed to start', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
