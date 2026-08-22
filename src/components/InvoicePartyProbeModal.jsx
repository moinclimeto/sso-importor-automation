import { useMemo, useState } from 'react';
import { Building2, Loader2, ShieldCheck, X } from 'lucide-react';
import { normalizeGst } from '../utils/companyInvoiceMatch.js';
import { verifiedPartyLabel } from '../utils/companyProfileFromGst.js';

function PartyCard({ party, selected, onSelect }) {
  const v = party?.verified;
  const ok = v?.success !== false && (v?.tradeName || v?.legalName || party?.gst);

  return (
    <button
      type="button"
      onClick={() => onSelect(party)}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${
        selected
          ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 h-4 w-4 rounded-full border flex-shrink-0 ${
            selected ? 'border-green-600 bg-green-600' : 'border-slate-300'
          }`}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {party.role}
            </span>
            <span className="font-mono text-sm text-slate-900">{party.gst}</span>
          </div>

          {ok ? (
            <>
              {v.tradeName ? (
                <p className="text-sm font-medium text-slate-900">
                  Trade name: {v.tradeName}
                </p>
              ) : null}
              {v.legalName && v.legalName !== v.tradeName ? (
                <p className="text-sm text-slate-700">Legal name: {v.legalName}</p>
              ) : null}
              {v.address ? (
                <p className="text-xs text-slate-600 leading-relaxed">{v.address}</p>
              ) : null}
              <p className="text-xs">
                <span className="text-slate-500">GST status:</span>{' '}
                <span className="text-slate-800">{v.status || 'Active'}</span>
                {' · '}
                <span className="text-slate-500">Registration:</span>{' '}
                <span className={v.registration_type === 'Registered' ? 'text-emerald-700' : 'text-amber-700'}>
                  {v.registration_type || 'Unregistered'}
                </span>
                {v.entity_type ? ` · ${v.entity_type}` : ''}
              </p>
            </>
          ) : (
            <p className="text-xs text-amber-700">{v?.error || 'GST verification unavailable for this party.'}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function InvoicePartyProbeModal({
  open,
  probeResult,
  companies = [],
  loading = false,
  saving = false,
  onCancel,
  onConfirm,
}) {
  const [selectedPartyKey, setSelectedPartyKey] = useState('');

  const sampleFile = probeResult?.files?.[0] || null;
  const parties = sampleFile?.parties || [];

  const partyKey = (party) => `${party.role}-${normalizeGst(party.gst)}`;

  const suggestedPartyKey = useMemo(() => {
    if (!parties.length) return '';
    const byGst = new Map(companies.map((c) => [normalizeGst(c.gstin), c]));
    for (const party of parties) {
      if (byGst.has(normalizeGst(party.gst))) return partyKey(party);
    }
    if (parties.length === 1) return partyKey(parties[0]);
    return '';
  }, [parties, companies]);

  const activePartyKey = selectedPartyKey || suggestedPartyKey;
  const selectedParty = parties.find((p) => partyKey(p) === activePartyKey) || null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={18} />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Identify Your Company</h3>
              <p className="text-xs text-slate-500">
                We verified buyer & seller GST from your first invoice. Select which one is your company —
                remaining invoices will route to Purchase or Sale, and unrelated invoices will be skipped.
              </p>
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
              Reading first invoice & verifying GST…
            </div>
          ) : (
            <>
              {sampleFile ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Sample invoice</p>
                  <p className="text-sm font-medium text-slate-800">{sampleFile.fileName}</p>
                  {probeResult?.totalFiles > 1 ? (
                    <p className="text-xs text-slate-500 mt-1">
                      {probeResult.totalFiles - 1} more file(s) will be classified using your selection.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {parties.length ? (
                <div className="space-y-3">
                  <label className="label text-sm text-slate-700 flex items-center gap-2">
                    <Building2 size={15} className="text-indigo-600" />
                    Which company is yours?
                  </label>
                  {parties.map((party) => (
                    <PartyCard
                      key={partyKey(party)}
                      party={party}
                      selected={activePartyKey === partyKey(party)}
                      onSelect={() => setSelectedPartyKey(partyKey(party))}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No buyer/seller GST found on the first invoice. Extraction will continue, but automatic
                  Purchase/Sale routing may not work until you add a company in Master Data.
                </div>
              )}

              {selectedParty ? (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-900">
                  <strong>Routing rule:</strong> if{' '}
                  <span className="font-medium">{verifiedPartyLabel(selectedParty)}</span> is the{' '}
                  <span className="uppercase">{selectedParty.role}</span>, invoices where you are seller go to{' '}
                  <strong>Sale</strong> and where you are buyer go to <strong>Purchase</strong>. Invoices
                  that do not include your GST will be skipped.
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading || saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || saving || (parties.length > 0 && !selectedParty)}
            onClick={() => onConfirm({ selectedParty })}
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin inline mr-2" size={14} />
                Saving…
              </>
            ) : (
              'Save & Start Extraction'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
