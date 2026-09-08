import { ipcMain, app, clipboard } from 'electron';
import { getSystemInfo, enrichWindowsCaption } from './systemInfo.js';
import {
  getMachineId,
  setMonitoringUser,
  readRecentEvents,
  pendingCount,
  listLocalDumpFiles,
  getCrashDumpDir,
} from './crashStore.js';
import { captureEvent, captureException, flushRemoteQueue, getRemoteSinks } from './capture.js';
import { getSentryDsn, getCrashReportUrl, getAppRelease, getMonitoringEnvironment } from './config.js';

let registered = false;

export function registerMonitoringHandlers() {
  if (registered) return;
  registered = true;

  ipcMain.handle('monitoring:getConfig', async () => ({
    dsn: getSentryDsn(),
    environment: getMonitoringEnvironment(),
    release: getAppRelease(),
    machineId: getMachineId(),
  }));

  ipcMain.handle('monitoring:getDiagnostics', async () => {
    const system = enrichWindowsCaption(getSystemInfo());
    return {
      success: true,
      system,
      machineId: getMachineId(),
      sinks: getRemoteSinks(),
      pendingUploads: pendingCount(),
      recentEvents: readRecentEvents(40),
      crashDumps: listLocalDumpFiles(),
      crashDumpDir: getCrashDumpDir(),
      userDataDir: app.getPath('userData'),
    };
  });

  ipcMain.handle('monitoring:reportError', async (_, payload = {}) => {
    try {
      if (payload.error || payload.stack) {
        const err = new Error(payload.message || payload.error?.message || 'Renderer error');
        err.name = payload.name || payload.error?.name || 'RendererError';
        err.stack = payload.stack || payload.error?.stack || err.stack;
        captureException(err, {
          type: payload.type || 'renderer-error',
          process: 'renderer',
          extra: payload.extra,
          tags: payload.tags,
        });
      } else {
        captureEvent({
          type: payload.type || 'renderer-error',
          level: payload.level || 'error',
          process: 'renderer',
          message: payload.message || 'Renderer error',
          extra: payload.extra,
          tags: payload.tags,
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('monitoring:setUser', async (_, user) => {
    setMonitoringUser(user || null);
    try {
      const sentry = await import('@sentry/electron/main').catch(() => null);
      sentry?.setUser?.(user ? {
        id: String(user.id || getMachineId()),
        email: user.email || undefined,
        username: user.companyName || user.email || undefined,
      } : null);
    } catch {
      /* optional */
    }
    return { success: true };
  });

  ipcMain.handle('monitoring:flush', async () => {
    const result = await flushRemoteQueue();
    return { success: true, ...result, pending: pendingCount() };
  });

  ipcMain.handle('monitoring:copyDiagnostics', async () => {
    const system = enrichWindowsCaption(getSystemInfo());
    const text = JSON.stringify({
      generatedAt: new Date().toISOString(),
      machineId: getMachineId(),
      system,
      recentEvents: readRecentEvents(15),
      crashDumps: listLocalDumpFiles(),
    }, null, 2);
    clipboard.writeText(text);
    return { success: true };
  });

  ipcMain.handle('monitoring:sendTest', async () => {
    captureEvent({
      type: 'test',
      level: 'error',
      message: 'Manual diagnostics test event from Climeto PWP',
      extra: { manual: true },
    });
    await flushRemoteQueue();
    return { success: true };
  });
}
