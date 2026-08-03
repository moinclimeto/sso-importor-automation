import { Archive, FileText, X } from 'lucide-react';

export default function ZipPreviewModal({ open, summaries, skipped, onConfirm, onCancel }) {
  if (!open) return null;

  const docs = (summaries || []).flatMap((z) => z.files || []);
  const zipSkipped = [
    ...(skipped || []),
    ...(summaries || []).flatMap((z) => z.skipped || []),
  ];
  const seenSkip = new Set();
  const uniqueSkipped = zipSkipped.filter((s) => {
    const key = `${s.name}|${s.reason}`;
    if (seenSkip.has(key)) return false;
    seenSkip.add(key);
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/45"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Archive size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-800">ZIP contents</h2>
              <p className="text-sm text-slate-500 mt-0.5 truncate">
                {(summaries || []).map((z) => z.zipName).join(', ') || 'Archive'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4 flex-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Documents ({docs.length})
            </p>
            {docs.length ? (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {docs.map((f, i) => (
                  <li
                    key={`${f.path}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <FileText size={14} className="text-green-600 shrink-0" />
                    <span className="truncate text-slate-800 flex-1" title={f.zipEntry || f.name}>
                      {f.name}
                    </span>
                    {f.size ? (
                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                        {(f.size / 1024).toFixed(1)} KB
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No PDF / image files found in the ZIP.</p>
            )}
          </div>

          {uniqueSkipped.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                Skipped ({uniqueSkipped.length})
              </p>
              <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                {uniqueSkipped.map((s, i) => (
                  <li
                    key={`${s.name}-${i}`}
                    className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-amber-900 truncate">{s.name}</p>
                    <p className="text-xs text-amber-700 mt-0.5">{s.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50/60 rounded-b-2xl">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!docs.length}
            onClick={onConfirm}
            className="rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-3.5 py-1.5"
          >
            Add {docs.length} to queue
          </button>
        </div>
      </div>
    </div>
  );
}
