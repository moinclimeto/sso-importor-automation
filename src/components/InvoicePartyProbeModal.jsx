import { useMemo, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';

function normalizeGst(gst) {
  return String(gst || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

export default function InvoicePartyProbeModal({
  open,
  probeResult,
  companies = [],
  loading = false,
  onCancel,
  onConfirm,
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const flatParties = useMemo(() => {
    const rows = [];
    for (const file of probeResult?.files || []) {
      for (const party of file.parties || []) {
        rows.push({ ...party, fileName: file.fileName });
      }
    }
    return rows;
  }, [probeResult]);

  const suggestedCompanyId = useMemo(() => {
    if (!companies.length || !flatParties.length) return '';
    const companyByGst = new Map(
      companies.map((c) => [normalizeGst(c.gstin), c]),
    );
    for (const party of flatParties) {
      const hit = companyByGst.get(normalizeGst(party.gst));
      if (hit) return String(hit.id);
    }
    if (companies.length === 1) return String(companies[0].id);
    return '';
  }, [companies, flatParties]);

  const activeCompanyId = selectedCompanyId || suggestedCompanyId;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={18} />
            <div>
              <h3 className="text-base font-semibold text-slate-900">GST Verification (Pre-extraction)</h3>
              <p className="text-xs text-slate-500">Scan parties from invoice, verify via GST API, then start extraction.</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-600 py-8 justify-center">
              <Loader2 className="animate-spin" size={16} />
              Probing documents & verifying GST…
            </div>
          ) : (
            <>
              {(probeResult?.files || []).map((file) => (
                <div key={file.fileName} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800 mb-2">{file.fileName}</p>
                  {!file.parties?.length ? (
                    <p className="text-xs text-amber-700">No GST found via QR/text scan. Extraction will still run.</p>
                  ) : (
                    <div className="space-y-2">
                      {file.parties.map((party) => {
                        const v = party.verified;
                        return (
                          <div key={`${party.role}-${party.gst}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="font-semibold uppercase text-slate-500">{party.role}</span>
                              <span className="font-mono text-slate-800">{party.gst}</span>
                              {party.name ? <span className="text-slate-600">· {party.name}</span> : null}
                            </div>
                            {v?.success !== false && (v?.tradeName || v?.legalName) ? (
                              <p className="mt-1 text-slate-700">
                                Verified: {v.tradeName || v.legalName}
                                {v.address ? ` · ${v.address}` : ''}
                                {v.status ? ` · ${v.status}` : ''}
                              </p>
                            ) : (
                              <p className="mt-1 text-amber-700">{v?.error || 'GST verify pending/unavailable'}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {companies.length ? (
                <div>
                  <label className="label text-xs text-slate-500">Your Company Profile (for routing)</label>
                  <select
                    className="input w-full bg-white"
                    value={activeCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                  >
                    <option value="">Auto-match by GST</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.gstin}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-amber-700">Add a company in Company Master for automatic sale/purchase routing.</p>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => onConfirm({ companyId: activeCompanyId ? Number(activeCompanyId) : null })}
          >
            Confirm & Start Extraction
          </button>
        </div>
      </div>
    </div>
  );
}
