import { app, BrowserWindow } from 'electron';
import { createRequire } from 'module';
import { captureException } from '../monitoring/init.js';
import { trackTelemetry } from '../telemetry/telemetry.js';

const require = createRequire(import.meta.url);

let autoUpdater = null;
let checkTimer = null;
let initialized = false;

const CHECK_INTERVAL_MS = Number(process.env.UPDATE_CHECK_INTERVAL_MS || 4 * 60 * 60 * 1000);

function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = process.env.UPDATE_AUTO_DOWNLOAD !== '0';
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    return autoUpdater;
  } catch (err) {
    console.warn('[updater] electron-updater unavailable:', err?.message);
    return null;
  }
}

function broadcast(channel, payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

function attachListeners(updater) {
  updater.on('checking-for-update', () => {
    broadcast('app:update-checking');
  });

  updater.on('update-available', (info) => {
    const payload = {
      version: info?.version || '',
      releaseDate: info?.releaseDate || '',
      releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : '',
    };
    trackTelemetry('update_available', payload).catch(() => {});
    broadcast('app:update-available', payload);
  });

  updater.on('update-not-available', (info) => {
    broadcast('app:update-not-available', {
      version: info?.version || app.getVersion(),
    });
  });

  updater.on('download-progress', (progress) => {
    broadcast('app:update-download-progress', {
      percent: progress?.percent ?? 0,
      transferred: progress?.transferred ?? 0,
      total: progress?.total ?? 0,
      bytesPerSecond: progress?.bytesPerSecond ?? 0,
    });
  });

  updater.on('update-downloaded', (info) => {
    const payload = {
      version: info?.version || '',
      releaseDate: info?.releaseDate || '',
    };
    trackTelemetry('update_downloaded', payload).catch(() => {});
    broadcast('app:update-downloaded', payload);
  });

  updater.on('error', (err) => {
    const message = err?.message || String(err || 'Update error');
    captureException(err instanceof Error ? err : new Error(message), {
      type: 'auto-update',
      process: 'main',
    });
    broadcast('app:update-error', { message });
  });
}

export function initAutoUpdater() {
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged) {
    console.log('[updater] Skipped in development (unpackaged app).');
    return;
  }

  const feedUrl = String(process.env.UPDATE_FEED_URL || '').trim();
  const updater = getAutoUpdater();
  if (!updater) return;

  if (feedUrl) {
    updater.setFeedURL({ provider: 'generic', url: feedUrl });
  }

  attachListeners(updater);

  const runCheck = () => {
    updater.checkForUpdates().catch((err) => {
      console.warn('[updater] check failed:', err?.message || err);
    });
  };

  setTimeout(runCheck, 15_000);
  checkTimer = setInterval(runCheck, CHECK_INTERVAL_MS);
  checkTimer.unref?.();
}

export async function checkForUpdatesNow() {
  if (!app.isPackaged) {
    return { success: false, reason: 'development' };
  }
  const updater = getAutoUpdater();
  if (!updater) {
    return { success: false, reason: 'unavailable' };
  }
  try {
    const result = await updater.checkForUpdates();
    return {
      success: true,
      updateInfo: result?.updateInfo || null,
      cancelled: Boolean(result?.cancelled),
    };
  } catch (err) {
    return { success: false, reason: err?.message || String(err) };
  }
}

export function downloadUpdateNow() {
  const updater = getAutoUpdater();
  if (!updater) return { success: false, reason: 'unavailable' };
  try {
    updater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, reason: err?.message || String(err) };
  }
}

export function quitAndInstallUpdate() {
  const updater = getAutoUpdater();
  if (!updater) return { success: false, reason: 'unavailable' };
  try {
    updater.quitAndInstall(false, true);
    return { success: true };
  } catch (err) {
    return { success: false, reason: err?.message || String(err) };
  }
}

export function getUpdateStatus() {
  const updater = getAutoUpdater();
  return {
    enabled: Boolean(updater) && app.isPackaged,
    currentVersion: app.getVersion(),
    feedUrl: String(process.env.UPDATE_FEED_URL || '').trim() || null,
    autoDownload: updater?.autoDownload ?? false,
  };
}

export function stopAutoUpdater() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
