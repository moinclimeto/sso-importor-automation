import { getSentryDsn, getCrashReportUrl, shouldEnableRemoteMonitoring } from './config.js';
import { buildEvent, persistEvent, takeQueuedEvents, requeueEvents } from './crashStore.js';
import { errorToPayload } from './sanitize.js';
import { getSystemInfo } from './systemInfo.js';

let sentryMain = null;
let sentryReady = false;
let flushing = false;

export function setSentryClient(client) {
  sentryMain = client;
  sentryReady = Boolean(client);
}

export function captureEvent(partial = {}) {
  const event = persistEvent(buildEvent(partial));

  if (sentryReady && sentryMain) {
    try {
      const info = event.system || getSystemInfo();
      sentryMain.withScope((scope) => {
        scope.setLevel(event.level === 'warning' || event.level === 'warn' ? 'warning' : event.level || 'error');
        scope.setTag('process', event.process || 'main');
        scope.setTag('event_type', event.type || 'error');
        if (info?.osName) scope.setTag('os_name', info.osName);
        if (info?.isOldWindows) scope.setTag('old_windows', 'true');
        if (info?.isUnsupportedOs) scope.setTag('unsupported_os', 'true');
        if (info?.windowsBuild) scope.setTag('windows_build', String(info.windowsBuild));
        if (event.tags && typeof event.tags === 'object') {
          for (const [key, value] of Object.entries(event.tags)) {
            if (value != null) scope.setTag(key, String(value));
          }
        }
        scope.setContext('system', info || {});
        scope.setContext('extra', event.extra || {});
        if (event.error?.stack) {
          sentryMain.captureException(Object.assign(new Error(event.message), event.error));
        } else {
          sentryMain.captureMessage(event.message, event.level === 'info' ? 'info' : 'error');
        }
      });
    } catch (err) {
      console.warn('[monitoring] Sentry capture failed', err?.message);
    }
  }

  return event;
}

export function captureException(err, extra = {}) {
  return captureEvent({
    type: extra.type || 'exception',
    level: extra.level || 'error',
    process: extra.process || 'main',
    message: err?.message || extra.message || 'Unhandled exception',
    error: errorToPayload(err),
    extra: extra.extra || extra,
    tags: extra.tags,
  });
}

export async function flushRemoteQueue() {
  const url = getCrashReportUrl();
  if (!url || flushing) return { sent: 0, pending: false };
  flushing = true;
  let sent = 0;
  try {
    const batch = takeQueuedEvents();
    if (!batch.length) return { sent: 0, pending: false };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        source: 'climeto-pwp',
        events: batch,
      }),
    });
    if (!res.ok) {
      requeueEvents(batch);
      return { sent: 0, pending: true, error: `HTTP ${res.status}` };
    }
    sent = batch.length;
  } catch (err) {
    /* network down — keep queue */
    return { sent: 0, pending: true, error: err?.message };
  } finally {
    flushing = false;
  }
  return { sent, pending: false };
}

export function getRemoteSinks() {
  return {
    sentry: Boolean(getSentryDsn()),
    webhook: Boolean(getCrashReportUrl()),
    remoteEnabled: shouldEnableRemoteMonitoring(),
  };
}
