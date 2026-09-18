import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';

const initialState = {
  phase: 'idle',
  version: '',
  currentVersion: '',
  percent: 0,
  message: '',
  releaseNotes: '',
};

export function useAppUpdater() {
  const [state, setState] = useState(initialState);

  const api = typeof window !== 'undefined' ? window.pwp?.app : null;

  useEffect(() => {
    if (!api?.onUpdateEvent) return undefined;

    const merge = (patch) => setState((prev) => ({ ...prev, ...patch }));

    const unsubscribers = [
      api.onUpdateEvent('app:update-checking', () => {
        merge({ phase: 'checking', message: 'Checking for updates…' });
      }),
      api.onUpdateEvent('app:update-available', (payload = {}) => {
        merge({
          phase: 'available',
          version: payload.version || '',
          releaseNotes: payload.releaseNotes || '',
          message: payload.version ? `Version ${payload.version} is available` : 'Update available',
          percent: 0,
        });
      }),
      api.onUpdateEvent('app:update-not-available', (payload = {}) => {
        merge({
          phase: 'idle',
          currentVersion: payload.version || '',
          message: '',
        });
      }),
      api.onUpdateEvent('app:update-download-progress', (payload = {}) => {
        merge({
          phase: 'downloading',
          percent: Math.round(payload.percent || 0),
          message: `Downloading update… ${Math.round(payload.percent || 0)}%`,
        });
      }),
      api.onUpdateEvent('app:update-downloaded', (payload = {}) => {
        merge({
          phase: 'ready',
          version: payload.version || state.version,
          message: 'Update downloaded. Restart to install.',
          percent: 100,
        });
      }),
      api.onUpdateEvent('app:update-error', (payload = {}) => {
        merge({
          phase: 'error',
          message: payload.message || 'Update check failed',
        });
      }),
    ];

    api.getVersion?.().then((info) => {
      if (info?.currentVersion) {
        merge({ currentVersion: info.currentVersion });
      }
    }).catch(() => {});

    return () => {
      unsubscribers.forEach((off) => off?.());
    };
  }, [api]);

  const checkForUpdates = useCallback(async () => {
    if (!api?.checkForUpdates) return;
    setState((prev) => ({ ...prev, phase: 'checking', message: 'Checking for updates…' }));
    await api.checkForUpdates();
  }, [api]);

  const downloadUpdate = useCallback(async () => {
    if (!api?.downloadUpdate) return;
    await api.downloadUpdate();
  }, [api]);

  const installUpdate = useCallback(async () => {
    if (!api?.installUpdate) return;
    await api.installUpdate();
  }, [api]);

  const dismiss = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'idle', message: '' }));
  }, []);

  return {
    ...state,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismiss,
    enabled: Boolean(api),
  };
}

export default function UpdateBanner() {
  const updater = useAppUpdater();
  const {
    phase,
    version,
    currentVersion,
    percent,
    message,
    releaseNotes,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismiss,
    enabled,
  } = updater;

  if (!enabled) return null;

  const showBanner = ['available', 'downloading', 'ready', 'error'].includes(phase);
  if (!showBanner && phase !== 'checking') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[min(420px,calc(100vw-2rem))]">
      <div className="rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-600">
            {phase === 'ready' ? <Sparkles size={18} /> : <Download size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {phase === 'ready' ? 'Update ready' : phase === 'error' ? 'Update issue' : 'New release available'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {message || `Current version: v${currentVersion || '—'}`}
                </p>
                {version ? (
                  <p className="mt-1 text-xs font-medium text-emerald-700">v{version}</p>
                ) : null}
              </div>
              {phase !== 'downloading' ? (
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Dismiss update banner"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>

            {releaseNotes ? (
              <p className="mt-2 line-clamp-3 text-xs text-slate-600">{releaseNotes}</p>
            ) : null}

            {phase === 'downloading' ? (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {phase === 'available' ? (
                <button
                  type="button"
                  onClick={downloadUpdate}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Download size={14} />
                  Download update
                </button>
              ) : null}
              {phase === 'ready' ? (
                <button
                  type="button"
                  onClick={installUpdate}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <RefreshCw size={14} />
                  Restart & install
                </button>
              ) : null}
              {phase === 'error' ? (
                <button
                  type="button"
                  onClick={checkForUpdates}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
