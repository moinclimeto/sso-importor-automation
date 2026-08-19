import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Printer,
  Stamp,
  Upload,
  X,
} from 'lucide-react';
import { fileLabel } from '../utils/partCLetterValues.js';
import { storeCompressedUpload } from '../utils/storeUploadFile.js';
import LetterPagePreview from './LetterPagePreview.jsx';

export default function LetterStudioModal({
  open,
  onClose,
  letters = [],
  values,
  missing = [],
  initialId,
  attached = {},
  onAttachPdf,
  onNotify,
}) {
  const [activeId, setActiveId] = useState(initialId || letters[0]?.id);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const active = letters.find((letter) => letter.id === activeId) || letters[0];
  const templateIds = useMemo(() => letters.map((letter) => letter.id), [letters]);

  useEffect(() => {
    if (open) setActiveId(initialId || letters[0]?.id);
  }, [open, initialId, letters]);

  useEffect(() => {
    if (!open || !templateIds.length || !window.pwp?.letters?.preview) return undefined;

    let cancelled = false;
    setLoading(true);
    setError('');

    window.pwp.letters
      .preview({ templateIds, values })
      .then((res) => {
        if (cancelled) return;
        if (!res?.success) {
          setError(res?.error || 'Could not fill the letters.');
          setPreview([]);
          return;
        }
        setPreview(res.letters || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not fill the letters.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, templateIds, values]);

  if (!open) return null;

  const downloadOne = async () => {
    if (!active || !window.pwp?.letters?.save) {
      onNotify?.('Letter download is available in the desktop app.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await window.pwp.letters.save({ templateId: active.id, values });
      if (res?.canceled) return;
      if (!res?.success) throw new Error(res?.error || 'Save failed');
      onNotify?.(`${active.title} saved as Word. Print, seal & sign, then upload the PDF.`, 'success');
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadAll = async () => {
    if (!window.pwp?.letters?.saveAll) {
      onNotify?.('Letter download is available in the desktop app.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await window.pwp.letters.saveAll({ templateIds, values });
      if (res?.canceled) return;
      if (!res?.success) throw new Error(res?.error || 'Save failed');
      onNotify?.('All ready letters downloaded. Print on letterhead, seal & sign, then re-upload PDFs.', 'success');
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAttach = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !active) return;
    if (!/\.pdf$/i.test(file.name)) {
      onNotify?.('Please upload a signed PDF.', 'error');
      return;
    }
    const stored = await storeCompressedUpload(file, { destSubdir: 'processed_part_c' });
    if (!stored.success || !stored.filePath) {
      onNotify?.(stored.message || 'Could not save PDF.', 'error');
      return;
    }
    onAttachPdf?.(active, stored.filePath);
    onNotify?.(`${active.title} signed PDF attached.`, 'success');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Ready Letters</p>
            <h2 className="text-lg font-semibold text-slate-900 mt-0.5">Filled drafts, ready for seal &amp; sign</h2>
            <p className="text-sm text-slate-500 mt-1">
              Preview the auto-filled Word drafts, download them, print on letterhead, then upload the signed PDF (short name).
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-white hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {missing.length > 0 && (
          <div className="mx-6 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>Some fields are still empty: {missing.join(', ')}. You can still download and edit them in Word.</p>
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[220px_1fr]">
          <aside className="border-b md:border-b-0 md:border-r border-slate-100 p-3 space-y-1 overflow-y-auto">
            {letters.map((letter) => {
              const isActive = letter.id === active?.id;
              const hasPdf = Boolean(attached[letter.id]);
              return (
                <button
                  key={letter.id}
                  type="button"
                  onClick={() => setActiveId(letter.id)}
                  className={`w-full text-left rounded-xl px-3 py-3 text-sm transition ${
                    isActive
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'border border-transparent hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-medium block">{letter.title}</span>
                  <span className={`text-[11px] ${hasPdf ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {hasPdf ? `Signed PDF: ${fileLabel(attached[letter.id])}` : 'Draft only'}
                  </span>
                </button>
              );
            })}
          </aside>

          <div className="min-h-0 overflow-y-auto bg-[#d7ddd8] p-5 md:p-8">
            {error && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Word download service: {error}. Preview below is still filled from saved company data.
              </div>
            )}
            <LetterPagePreview letterId={active?.id} values={values} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 flex items-center gap-2 text-xs text-slate-500">
            <Printer size={14} className="text-slate-400" />
            Print → <Stamp size={14} className="text-slate-400" /> seal &amp; sign → upload PDF
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Upload size={15} />
              Upload signed PDF
              <input type="file" accept=".pdf" className="hidden" onChange={handleAttach} />
            </label>
            <button
              type="button"
              onClick={downloadOne}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Download Word
            </button>
            <button
              type="button"
              onClick={downloadAll}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Download all
            </button>
          </div>
        </div>

        {active && attached[active.id] && (
          <div className="px-6 pb-4 -mt-1">
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Signed copy attached: {fileLabel(attached[active.id])}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
