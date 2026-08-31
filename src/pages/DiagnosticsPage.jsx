import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Copy, RefreshCw, Send, ShieldAlert } from 'lucide-react';

function StatusPill({ ok, label }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
      ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-800 border border-amber-100'
    }`}>
      {label}
    </span>
  );
}

export default function DiagnosticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await window.pwp?.monitoring?.getDiagnostics?.();
      setData(result);
    } catch (err) {
      setNotice(err.message || 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const system = data?.system || {};
  const oldOs = Boolean(system.isOldWindows || system.isUnsupportedOs);

  async function copyReport() {
    const result = await window.pwp?.monitoring?.copyDiagnostics?.();
    setNotice(result?.success ? 'Diagnostics copied to clipboard' : 'Copy failed');
  }

  async function sendTest() {
    await window.pwp?.monitoring?.sendTest?.();
    setNotice('Test error sent. Check Sentry / crash-reports folder.');
    load();
  }

  async function flush() {
    const result = await window.pwp?.monitoring?.flush?.();
    setNotice(result?.sent ? `Uploaded ${result.sent} queued events` : 'No queued events uploaded (offline or no webhook)');
    load();
  }

  return (
    <div className="space-y-5">
      {oldOs && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <ShieldAlert className="flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold">Old or unsupported Windows detected</p>
            <p className="text-sm mt-1">{system.supportNote || `${system.osName} may crash this app.`}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Windows / OS</p>
          <p className="font-semibold text-slate-900 mt-1">{system.osName || '—'}</p>
          <p className="text-xs text-slate-500 mt-1">{system.osRelease} {system.windowsCaption ? `· ${system.windowsCaption}` : ''}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">App / Electron</p>
          <p className="font-semibold text-slate-900 mt-1">{system.appVersion || '—'}</p>
          <p className="text-xs text-slate-500 mt-1">Electron {system.electronVersion}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Memory</p>
          <p className="font-semibold text-slate-900 mt-1">{system.freeMemGb} / {system.totalMemGb} GB free</p>
          <p className="text-xs text-slate-500 mt-1">{system.cpuCores} cores · {system.arch}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Machine ID</p>
          <p className="font-mono text-xs text-slate-800 mt-1 break-all">{data?.machineId || '—'}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-2">
        <Activity size={16} className="text-slate-500" />
        <StatusPill ok={Boolean(data?.sinks?.sentry)} label={data?.sinks?.sentry ? 'Sentry on' : 'Sentry DSN missing'} />
        <StatusPill ok={Boolean(data?.sinks?.webhook)} label={data?.sinks?.webhook ? 'Webhook on' : 'No webhook'} />
        <StatusPill ok={!oldOs} label={oldOs ? 'Old Windows' : 'OS supported'} />
        <span className="text-xs text-slate-500 ml-auto">Queued uploads: {data?.pendingUploads ?? 0}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
        <button type="button" onClick={copyReport} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
          <Copy size={14} /> Copy report
        </button>
        <button type="button" onClick={flush} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
          <Send size={14} /> Retry upload
        </button>
        <button type="button" onClick={sendTest} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700">
          <AlertTriangle size={14} /> Send test error
        </button>
      </div>

      {notice && <p className="text-sm text-slate-600">{notice}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Recent errors / crashes</div>
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : (data?.recentEvents || []).length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No events yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[28rem] overflow-auto">
            {data.recentEvents.map((event) => (
              <li key={event.id || event.ts} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-semibold ${
                    event.level === 'info' ? 'text-slate-500' : event.level === 'warning' ? 'text-amber-600' : 'text-red-600'
                  }`}>{event.level || event.type}</span>
                  <span className="text-xs text-slate-400">{event.ts}</span>
                  <span className="text-xs text-slate-400 ml-auto">{event.process}</span>
                </div>
                <p className="text-sm text-slate-800 mt-1">{event.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
