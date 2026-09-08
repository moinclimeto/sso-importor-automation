import { app, crashReporter } from 'electron';
import * as Sentry from '@sentry/electron/main';
import {
  getSentryDsn,
  getCrashReportUrl,
  getAppRelease,
  getMonitoringEnvironment,
  shouldEnableRemoteMonitoring,
} from './config.js';
import { getSystemInfo, enrichWindowsCaption, shouldDisableGpu } from './systemInfo.js';
import {
  getMachineId,
  setMonitoringUser,
  persistEvent,
  buildEvent,
} from './crashStore.js';
import { captureEvent, captureException, flushRemoteQueue, setSentryClient } from './capture.js';

let started = false;

function initSentry() {
  const dsn = getSentryDsn();
  if (!dsn || !shouldEnableRemoteMonitoring()) return false;
  try {
    Sentry.init({
      dsn,
      release: getAppRelease(),
      environment: getMonitoringEnvironment(),
      sendDefaultPii: false,
      maxBreadcrumbs: 80,
      beforeSend(event) {
        const info = getSystemInfo();
        event.tags = {
          ...(event.tags || {}),
          os_name: info.osName,
          old_windows: info.isOldWindows ? 'true' : 'false',
          unsupported_os: info.isUnsupportedOs ? 'true' : 'false',
          machine_id: getMachineId(),
        };
        return event;
      },
    });
    setSentryClient(Sentry);
    return true;
  } catch (err) {
    console.warn('[monitoring] Sentry init skipped:', err?.message);
    setSentryClient(null);
    return false;
  }
}

function startNativeCrashReporter() {
  const extra = {
    machineId: getMachineId(),
    appVersion: getSystemInfo().appVersion || '',
    osName: getSystemInfo().osName || '',
    osRelease: getSystemInfo().osRelease || '',
  };
  const submitURL = getCrashReportUrl();
  try {
    crashReporter.start({
      productName: 'Climeto PWP',
      companyName: 'Climeto',
      submitURL: submitURL || 'https://127.0.0.1/crash-disabled',
      uploadToServer: Boolean(submitURL),
      compress: true,
      extra,
    });
  } catch (err) {
    console.warn('[monitoring] crashReporter.start failed:', err?.message);
  }
}

function applyGpuWorkaround() {
  const info = getSystemInfo();
  if (!shouldDisableGpu(info)) return false;
  try {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    return true;
  } catch {
    return false;
  }
}

function installProcessHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('[monitoring] uncaughtException', err);
    captureException(err, { type: 'uncaughtException', process: 'main' });
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('[monitoring] unhandledRejection', err);
    captureException(err, { type: 'unhandledRejection', process: 'main' });
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    captureEvent({
      type: 'renderer-gone',
      level: 'fatal',
      process: 'renderer',
      message: `Renderer process gone: ${details?.reason || 'unknown'}`,
      extra: {
        reason: details?.reason,
        exitCode: details?.exitCode,
        url: webContents?.getURL?.(),
      },
      tags: { crash_reason: details?.reason || 'unknown' },
    });
  });

  app.on('child-process-gone', (_event, details) => {
    captureEvent({
      type: 'child-process-gone',
      level: 'error',
      process: details?.type || 'child',
      message: `Child process gone: ${details?.type || 'unknown'} (${details?.reason || 'unknown'})`,
      extra: details,
      tags: { child_type: details?.type || 'unknown' },
    });
  });

  app.on('before-quit', () => {
    flushRemoteQueue().catch(() => {});
  });
}

export function initMainMonitoring() {
  if (started) return getSystemInfo();
  started = true;

  const gpuDisabled = applyGpuWorkaround();
  const sentryOn = initSentry();
  if (!sentryOn) startNativeCrashReporter();
  installProcessHandlers();

  const info = getSystemInfo();
  persistEvent(buildEvent({
    type: 'bootstrap',
    level: 'info',
    message: 'Monitoring started',
    extra: { gpuDisabled, sentry: sentryOn, webhook: Boolean(getCrashReportUrl()) },
  }), { queueRemote: false });

  if (info.isUnsupportedOs || info.isOldWindows) {
    captureEvent({
      type: 'old-windows',
      level: 'warning',
      message: info.supportNote || `Old Windows detected: ${info.osName}`,
      extra: { gpuDisabled },
      tags: { old_windows: 'true' },
    });
  }

  return info;
}

export async function onAppReadyMonitoring() {
  const info = enrichWindowsCaption(getSystemInfo());
  try {
    Sentry.setTag('os_name', info.osName);
    Sentry.setTag('old_windows', info.isOldWindows ? 'true' : 'false');
    Sentry.setTag('unsupported_os', info.isUnsupportedOs ? 'true' : 'false');
    Sentry.setContext('system', info);
    Sentry.setUser({ id: getMachineId() });
  } catch {
    /* Sentry not initialised */
  }

  captureEvent({
    type: 'session',
    level: info.isUnsupportedOs ? 'warning' : 'info',
    message: `App session start on ${info.osName}`,
    extra: { packed: info.packaged },
  });

  await flushRemoteQueue();
}

export function attachWindowMonitoring(win) {
  if (!win?.webContents) return;
  win.webContents.on('unresponsive', () => {
    captureEvent({
      type: 'window-unresponsive',
      level: 'error',
      process: 'renderer',
      message: 'Renderer window became unresponsive',
      extra: { url: win.webContents.getURL() },
    });
  });
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    captureEvent({
      type: 'did-fail-load',
      level: 'error',
      process: 'renderer',
      message: `Window failed to load: ${errorDescription}`,
      extra: { errorCode, errorDescription, validatedURL },
    });
  });
}

export { setMonitoringUser, captureException, captureEvent, flushRemoteQueue };

initMainMonitoring();
