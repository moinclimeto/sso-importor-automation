import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

export default function ConversionFactorSetupModal({
  open,
  line,
  loading = false,
  onClose,
  onApplyMaster,
  onApplyManual,
  onApplyFormula,
}) {
  const [manualCf, setManualCf] = useState('');
  const [formula, setFormula] = useState('');

  useEffect(() => {
    if (!open) return;
    setManualCf(line?.conversionFactorApplied || line?.conversionFactor || '');
    setFormula(line?.cfFormula || '');
  }, [open, line]);

  if (!open || !line) return null;

  const contextRows = [
    { label: 'Item', value: line.productDescription || '—' },
    { label: 'HSN', value: line.hsn || '—' },
    { label: 'UOM', value: line.unit || line.uom || '—' },
    { label: 'Qty', value: line.quantity || '—' },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cf-setup-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="cf-setup-title" className="text-base font-semibold text-slate-900">
            Conversion Factor Setup
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
            {contextRows.map((row) => (
              <div key={row.label}>
                <span className="text-slate-500">{row.label}: </span>
                <span className="font-medium text-slate-800">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Auto-Master</p>
            <p className="text-xs text-slate-500">Apply conversion factor from Packaging Master match.</p>
            <button
              type="button"
              disabled={loading}
              onClick={onApplyMaster}
              className="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Apply Packaging Master'}
            </button>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700">Manual CF</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input text-sm flex-1"
                value={manualCf}
                onChange={(e) => setManualCf(e.target.value)}
                placeholder="e.g. 0.025"
              />
              <button
                type="button"
                disabled={loading || !String(manualCf).trim()}
                onClick={() => onApplyManual?.(manualCf.trim())}
                className="btn btn-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700">Auto-Function</p>
            <p className="text-xs text-slate-500">Formula using GST, net amount, or quantity as base.</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input text-sm flex-1"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g. gst * 0.001"
              />
              <button
                type="button"
                disabled={loading || !String(formula).trim()}
                onClick={() => onApplyFormula?.(formula.trim())}
                className="btn btn-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} disabled={loading} className="btn btn-sm text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
