let sentryReady = false;

function reportToMain(payload) {
  try {
    window.pwp?.monitoring?.reportError?.(payload);
  } catch {
    /* ignore */
  }
}

export async function initRendererMonitoring() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    reportToMain({
      type: 'window-error',
      name: event.error?.name || 'Error',
      message: event.error?.message || event.message || 'window.onerror',
      stack: event.error?.stack,
      extra: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    reportToMain({
      type: 'unhandledrejection',
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  });

  const getConfig = window.pwp?.monitoring?.getConfig;
  if (!getConfig) return;

  let config = null;
  try {
    config = await Promise.race([
      getConfig(),
      new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
  } catch {
    return;
  }

  if (!config?.dsn) return;

  try {
    const Sentry = await import('@sentry/electron/renderer');
    Sentry.init({
      release: config.release,
      environment: config.environment,
    });
    sentryReady = true;
  } catch (err) {
    console.warn('[monitoring] renderer Sentry init failed', err);
  }
}

export function captureRendererException(err, extra = {}) {
  reportToMain({
    type: extra.type || 'react-error',
    name: err?.name,
    message: err?.message || String(err),
    stack: err?.stack,
    extra,
  });
}

export function setRendererUser(user) {
  window.pwp?.monitoring?.setUser?.(user || null);
  if (!sentryReady) return;
  import('@sentry/electron/renderer').then((Sentry) => {
    Sentry.setUser(user ? {
      id: String(user.id || ''),
      email: user.email || undefined,
      username: user.companyName || user.email || undefined,
    } : null);
  }).catch(() => {});
}
