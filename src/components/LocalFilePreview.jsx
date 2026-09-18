import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, X, RefreshCw, Download, Printer } from 'lucide-react';

function mimeFromPath(filePath) {
  const ext = String(filePath || '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

export default function LocalFilePreview({ filePath, fileName, originalFileName, hideText = false, onChangeDocument }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
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
        const fileObjName = originalFileName || name;
        const fileObj = new File([bytes], fileObjName, { type: mimeFromPath(filePath) });
        objectUrl = URL.createObjectURL(fileObj);
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
  }, [open, filePath, refresh]);

  if (!filePath) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={`relative z-10 inline-flex items-center justify-center rounded transition-colors shrink-0 ${
          hideText ? 'p-1.5 bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-blue-600 shadow-sm' : 'gap-1 text-xs font-medium text-blue-700 hover:text-blue-800'
        }`}
        title={hideText ? 'Preview Document' : undefined}
      >
        <Eye size={hideText ? 15 : 13} />
        {!hideText && 'Preview'}
      </button>

      {open && createPortal(
        <div 
          className="fixed inset-0 z-[10050] bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between bg-slate-50 shrink-0">
              <p className="text-sm font-semibold text-slate-800 truncate pr-4" title={filePath}>
                {originalFileName ? `${name} - ${originalFileName}` : name}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {onChangeDocument && (
                  <button 
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      await onChangeDocument();
                      setRefresh((r) => r + 1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                  >
                    <RefreshCw size={14} />
                    Change Document
                  </button>
                )}
                {url && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = originalFileName || name;
                        a.click();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 shadow-sm"
                      title="Download Document"
                    >
                      <Download size={14} />
                      Download
                    </button>
                    {isPdf && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const iframe = document.getElementById(`pdf-frame-${name}`);
                          if (iframe) iframe.contentWindow.print();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 shadow-sm"
                        title="Print Document"
                      >
                        <Printer size={14} />
                        Print
                      </button>
                    )}
                  </>
                )}
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }} 
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>
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
                  <iframe id={`pdf-frame-${name}`} title={name} src={`${url}#toolbar=0`} className="w-full h-full border-0" />
                ) : (
                  <div className="h-full overflow-auto flex items-center justify-center p-4">
                    <img src={url} alt={name} className="max-w-full max-h-full object-contain rounded shadow" />
                  </div>
                )
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
