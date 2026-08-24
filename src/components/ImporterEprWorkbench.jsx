import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { getImporterReportingFinancialYears } from '../../shared/financialYearScope.js';
import { buildPlasticConsumed3cFromImporter3a, importer3aCanFinalize } from '../../shared/importerSection3a.js';
import { PLASTIC_CONSUMED_3C_COLUMNS } from '../../shared/plasticConsumed3c.js';
import ImporterEprHelp from './importerEpr/ImporterEprHelp.jsx';

const CATEGORY_LABELS = {
  'Cat-I': 'Rigid Plastic (Cat-I)',
  'Cat-II': 'Flexible Plastic (Cat-II)',
  'Cat-III': 'Multilayered Plastic (Cat-III)',
  'Cat-IV': 'Compostable Plastic (Cat-IV)',
};

function StatusBadge({ tone = 'slate', children }) {
  const tones = {
    green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-100 text-amber-900 border-amber-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    teal: 'bg-teal-100 text-teal-800 border-teal-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 min-w-[120px]">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
      {sub ? <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p> : null}
    </div>
  );
}

function aggregateFinalizeSummary(draft, reportingYears) {
  const totals = { cat1: 0, cat2: 0, cat3: 0, cat4: 0 };
  for (const fy of reportingYears) {
    const row = draft?.summaryByFy?.[fy] || {};
    for (const col of PLASTIC_CONSUMED_3C_COLUMNS) {
      totals[col.key] += parseFloat(row[col.key] || 0) || 0;
    }
  }
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  return { totals, grand: Number(grand.toFixed(4)) };
}

export default function ImporterEprWorkbench({
  companyId = null,
  companyName = 'Importer',
  importer3a: saved3a = null,
  importer3aStatus = '',
  onFinalized,
  showToast,
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(saved3a);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reportingYears = useMemo(() => getImporterReportingFinancialYears(), []);

  const refreshDraft = useCallback(async () => {
    if (!window.pwp?.importerEpr?.compute3aDraft) {
      showToast?.('Importer EPR needs the Electron app.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await window.pwp.importerEpr.compute3aDraft({ companyId });
      if (res.success) {
        setDraft(res.draft);
      } else {
        showToast?.(res.error || 'Could not compute 3a draft', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, showToast]);

  useEffect(() => {
    if (!saved3a) refreshDraft();
    else setDraft(saved3a);
  }, [saved3a, refreshDraft]);

  const preview3c = useMemo(() => {
    if (!draft) return null;
    return buildPlasticConsumed3cFromImporter3a(draft, reportingYears);
  }, [draft, reportingYears]);

  const finalizeCheck = useMemo(() => importer3aCanFinalize(draft || {}), [draft]);
  const finalizeSummary = useMemo(
    () => aggregateFinalizeSummary(draft, reportingYears),
    [draft, reportingYears],
  );

  const stats = draft?.stats || {};
  const isNil = (stats.saleLineCount ?? 0) === 0;
  const isFinalized = importer3aStatus === 'finalized' || importer3aStatus === 'nil'
    || draft?.status === 'finalized' || draft?.status === 'nil';

  const issueCounts = useMemo(() => {
    const issues = draft?.issues || [];
    return {
      unmatched: stats.unmatchedSaleCount ?? draft?.unmatchedSales?.length ?? 0,
      unclassified: stats.unclassifiedProcurementCount
        ?? issues.filter((i) => i.type === 'unclassified_procurement').length,
      missingCategory: issues.filter((i) => i.type === 'missing_category').length,
      missingMt: issues.filter((i) => i.type === 'missing_mt').length,
    };
  }, [draft, stats]);

  const overallStatus = useMemo(() => {
    if (isFinalized) return { label: importer3aStatus === 'nil' ? 'Finalized (NIL)' : 'Finalized', tone: 'green' };
    if (finalizeCheck.ok && !isNil) return { label: 'Ready to Finalize', tone: 'teal' };
    if (issueCounts.unmatched > 0) return { label: 'Unmatched Sales', tone: 'red' };
    if (issueCounts.unclassified > 0) return { label: 'Purchases Need Classification', tone: 'amber' };
    if (issueCounts.missingCategory > 0) return { label: 'Missing Category', tone: 'amber' };
    if (issueCounts.missingMt > 0) return { label: 'Missing Conversion Factor', tone: 'amber' };
    if (isNil) return { label: 'NIL — No Domestic Sales', tone: 'blue' };
    return { label: 'Draft', tone: 'slate' };
  }, [finalizeCheck.ok, isNil, isFinalized, importer3aStatus, issueCounts]);

  const firstUnmatched = draft?.unmatchedSales?.[0] || draft?.issues?.find((i) => i.type === 'unmatched_sale');
  const firstUnclassified = draft?.issues?.find((i) => i.type === 'unclassified_procurement');
  const firstMissingCategory = draft?.issues?.find((i) => i.type === 'missing_category');
  const firstMissingMt = draft?.issues?.find((i) => i.type === 'missing_mt');

  const runFinalize = async (nilMode = false) => {
    if (!window.pwp?.importerEpr?.finalize3a) return;
    setFinalizing(true);
    try {
      const payloadDraft = nilMode
        ? {
            ...(draft || {}),
            status: 'nil',
            detailRows: [],
            summaryByFy: Object.fromEntries(
              reportingYears.map((fy) => [fy, { cat1: '0', cat2: '0', cat3: '0', cat4: '0' }]),
            ),
            reportingYears,
            stats: { ...(draft?.stats || {}), saleLineCount: 0 },
          }
        : draft;

      if (!nilMode && !finalizeCheck.ok) {
        showToast?.(finalizeCheck.reason || 'Fix issues before finalizing', 'error');
        return;
      }

      const res = await window.pwp.importerEpr.finalize3a({
        companyId,
        companyName,
        draft: payloadDraft,
      });
      if (!res.success) {
        showToast?.(res.error || 'Finalize failed', 'error');
        return;
      }
      setDraft(res.importer3a);
      setConfirmOpen(false);
      onFinalized?.({
        importer3a: res.importer3a,
        importer3aStatus: res.importer3aStatus,
        detailsOfProductsPath: res.detailsOfProductsPath,
        plasticConsumed: res.plasticConsumed,
        years: res.years,
      });
      showToast?.(
        res.importer3aStatus === 'nil'
          ? 'Section 3a finalized as NIL — PDF generated'
          : 'Section 3a finalized — PDF and 3c values updated',
        'success',
      );
    } finally {
      setFinalizing(false);
    }
  };

  const openFinalizeConfirm = () => {
    if (isNil) {
      runFinalize(true);
      return;
    }
    if (!finalizeCheck.ok) {
      showToast?.(finalizeCheck.reason || 'Fix issues before finalizing', 'error');
      return;
    }
    setConfirmOpen(true);
  };

  if (!draft && loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <Loader2 className="animate-spin" size={16} />
        Loading Importer Section 3a from your invoices…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-teal-900">Importer Section 3a Workbench</h4>
            <StatusBadge tone={overallStatus.tone}>{overallStatus.label}</StatusBadge>
          </div>
          <p className="text-xs text-teal-800/80 mt-1">
            Reporting years: {reportingYears.join(', ')} · Matches imported purchases to domestic sales
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshDraft}
            disabled={loading || finalizing}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-teal-200 bg-white text-teal-800 hover:bg-teal-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {isNil && !isFinalized && (
            <button
              type="button"
              onClick={() => runFinalize(true)}
              disabled={finalizing}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              Finalize NIL
            </button>
          )}
          {!isNil && !isFinalized && (
            <button
              type="button"
              onClick={openFinalizeConfirm}
              disabled={finalizing || !finalizeCheck.ok}
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {finalizing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Finalize 3a + PDF
            </button>
          )}
        </div>
      </div>

      <ImporterEprHelp />

      {/* Summary cards */}
      {!isNil && (
        <div className="flex flex-wrap gap-2">
          <SummaryCard label="Imported Products" value={stats.importLineCount ?? 0} sub="import line items" />
          <SummaryCard label="Domestic Sales" value={stats.saleLineCount ?? 0} sub="sale line items" />
          <SummaryCard label="Matched Sales" value={stats.detailRowCount ?? 0} sub="ready for 3a" />
          <SummaryCard
            label="Unmatched Sales"
            value={issueCounts.unmatched}
            sub={issueCounts.unmatched ? 'needs review' : 'none'}
          />
          <SummaryCard
            label="Total Plastic Packaging"
            value={`${stats.totalPackagingMt ?? 0} MT`}
            sub="matched domestic sales"
          />
        </div>
      )}

      {/* NIL state */}
      {isNil && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 space-y-3">
          <div className="flex items-start gap-2">
            <Info size={18} className="text-blue-700 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 space-y-1">
              <p className="font-semibold">No domestic sales found for imported products</p>
              <p>Section 3a will be reported as <strong>NIL</strong> for the reporting period.</p>
            </div>
          </div>
          {!isFinalized && (
            <button
              type="button"
              onClick={() => runFinalize(true)}
              disabled={finalizing}
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {finalizing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Finalize NIL
            </button>
          )}
          {isFinalized && importer3aStatus === 'nil' && (
            <p className="text-xs text-emerald-800 flex items-center gap-1">
              <CheckCircle2 size={14} /> Section 3a NIL finalized — PDF generated
            </p>
          )}
        </div>
      )}

      {/* Unmatched sales warning */}
      {issueCounts.unmatched > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-red-900">
            {issueCounts.unmatched} domestic sale{issueCounts.unmatched > 1 ? 's' : ''} could not be linked to an imported purchase.
          </p>
          <p className="text-xs text-red-800">
            Check product name, HSN code, Product Match Key, and Packaging Master aliases (linked match keys) so the sale matches an import line.
          </p>
          {firstUnmatched?.recordId && (
            <button
              type="button"
              onClick={() => navigate(`/sales-review/${firstUnmatched.recordId}`)}
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-800 hover:bg-red-100"
            >
              Review Unmatched Sale <ExternalLink size={12} />
            </button>
          )}
        </div>
      )}

      {/* Missing data actions */}
      {issueCounts.unclassified > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-amber-900">
            {issueCounts.unclassified} purchase invoice{issueCounts.unclassified > 1 ? 's need' : ' needs'} Procurement Source (Import or Domestic).
          </p>
          {firstUnclassified?.recordId && (
            <button
              type="button"
              onClick={() => navigate(`/procurement-review/${firstUnclassified.recordId}`)}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
            >
              Review Purchases
            </button>
          )}
        </div>
      )}

      {issueCounts.missingCategory > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-amber-900">
            Plastic category is missing for {issueCounts.missingCategory} sale line{issueCounts.missingCategory > 1 ? 's' : ''}.
          </p>
          {firstMissingCategory?.recordId && (
            <button
              type="button"
              onClick={() => navigate(`/sales-review/${firstMissingCategory.recordId}`)}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
            >
              Review Sales
            </button>
          )}
        </div>
      )}

      {issueCounts.missingMt > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-amber-900">
            Packaging conversion factor is missing for {issueCounts.missingMt} sale line{issueCounts.missingMt > 1 ? 's' : ''}.
          </p>
          {firstMissingMt?.recordId ? (
            <button
              type="button"
              onClick={() => navigate(`/sales-review/${firstMissingMt.recordId}`)}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
            >
              Update Packaging Details
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/master-data?tab=packaging')}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
            >
              Update Packaging Details
            </button>
          )}
        </div>
      )}

      {/* Detail table */}
      {!isNil && (draft?.detailRows || []).length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-2 py-2 text-left">Product</th>
                <th className="px-2 py-2 text-right">Imported Qty</th>
                <th className="px-2 py-2 text-right">Domestic Sale Qty</th>
                <th className="px-2 py-2 text-left">Category</th>
                <th className="px-2 py-2 text-left">Conversion Factor</th>
                <th className="px-2 py-2 text-right">Packaging MT</th>
                <th className="px-2 py-2 text-left">Source</th>
                <th className="px-2 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(draft.detailRows || []).map((row, idx) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-2 py-2 max-w-[140px]">
                    <div className="truncate font-medium text-slate-800" title={row.productDescription}>
                      {row.productDescription}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{row.saleInvoiceRef}</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                    {row.importPoolQty != null ? `${row.importPoolQty} ${row.unit}` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">
                    {row.productQtySold} {row.unit}
                  </td>
                  <td className="px-2 py-2">{CATEGORY_LABELS[row.plasticCategory] || row.plasticCategory}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">{row.conversionFactorLabel || '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-teal-800">{row.packagingMt}</td>
                  <td className="px-2 py-2">
                    <StatusBadge tone={row.packagingDataSource === 'Packaging Master' ? 'blue' : 'slate'}>
                      {row.packagingDataSource || '—'}
                    </StatusBadge>
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge tone={row.matchStatus === 'Matched' ? 'green' : 'amber'}>
                      {row.matchStatus || 'Matched'}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unmatched list (compact) */}
      {!isNil && issueCounts.unmatched > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold text-slate-700 mb-2">Unmatched domestic sales</p>
          <ul className="space-y-1">
            {(draft.unmatchedSales || []).slice(0, 5).map((us, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-slate-600">
                  {us.productDescription} · Inv {us.invoiceNo}
                  {us.productMatchKey ? ` · Key: ${us.productMatchKey}` : ''}
                </span>
                <StatusBadge tone="red">Unmatched</StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3c preview — only when not NIL and has rows */}
      {!isNil && preview3c && (draft?.detailRows || []).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1">
            <ChevronRight size={14} />
            Section 3c preview (from 3a — read-only)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {PLASTIC_CONSUMED_3C_COLUMNS.map((col) => {
              let sum = 0;
              for (const fy of reportingYears) {
                sum += parseFloat(preview3c.plasticConsumed?.[fy]?.[col.key] || 0) || 0;
              }
              return (
                <div key={col.key} className="rounded-md bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] text-slate-500">{col.label.split('(')[0].trim()}</p>
                  <p className="font-semibold tabular-nums">{Number(sum.toFixed(4))} MT</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Finalize confirmation modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Section 3a Summary</h3>
              <button type="button" onClick={() => setConfirmOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 py-4 space-y-3 text-sm">
              <p className="text-xs text-slate-600">Please review these plastic packaging quantities before generating the CPCB report.</p>
              <ul className="space-y-1.5 text-xs">
                {PLASTIC_CONSUMED_3C_COLUMNS.map((col) => (
                  <li key={col.key} className="flex justify-between gap-2">
                    <span className="text-slate-600">{col.label}</span>
                    <span className="font-semibold tabular-nums">{finalizeSummary.totals[col.key].toFixed(4)} MT</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 pt-2 border-t border-slate-100 font-semibold text-slate-900">
                  <span>Total</span>
                  <span className="tabular-nums">{finalizeSummary.grand} MT</span>
                </li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                Back to Review
              </button>
              <button
                type="button"
                onClick={() => runFinalize(false)}
                disabled={finalizing}
                className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {finalizing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                Finalize 3a &amp; Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
