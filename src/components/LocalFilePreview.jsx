import { useEffect, useState } from 'react';
import { Eye, Loader2, X } from 'lucide-react';

function mimeFromPath(filePath) {
  const ext = String(filePath || '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

export default function LocalFilePreview({ filePath, fileName }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const name = fileName || String(filePath || '').split(/[/\\]/).pop() || 'Document';
  const isPdf = /\.pdf$/i.test(filePath || name);

  useEffect(() => {
    if (!open || !filePath) return undefined;
    let objectUrl = '';
    let cancelled = false;
    setLoading(true);
    setError('');
    setUrl('');

    (async () => {
      try {
        const fsApi = window.pwp?.fs;
        const readFile =
          fsApi?.readLocalFileBase64 ||
          fsApi?.readFileBase64 ||
          fsApi?.readFileBase64;
        const base64 = await readFile?.(filePath);
        if (!base64) throw new Error('Could not read this file for preview. Please upload it again.');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mimeFromPath(filePath) });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Preview failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, filePath]);

  if (!filePath) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 shrink-0"
      >
        <Eye size={13} />
        Preview
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between bg-slate-50">
              <p className="text-sm font-semibold text-slate-800 truncate pr-4" title={filePath}>{name}</p>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 min-h-0">
              {loading && (
                <div className="h-full flex items-center justify-center text-slate-500 gap-2">
                  <Loader2 size={20} className="animate-spin" />
                  Loading preview…
                </div>
              )}
              {error && (
                <div className="h-full flex items-center justify-center text-sm text-red-600 p-6 text-center">{error}</div>
              )}
              {!loading && !error && url && (
                isPdf ? (
                  <iframe title={name} src={url} className="w-full h-full border-0" />
                ) : (
                  <div className="h-full overflow-auto flex items-center justify-center p-4">
                    <img src={url} alt={name} className="max-w-full max-h-full object-contain rounded shadow" />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
