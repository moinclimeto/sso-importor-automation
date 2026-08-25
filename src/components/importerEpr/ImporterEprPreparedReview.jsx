import { useState } from 'react';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import ImporterPackagingImages from '../ImporterPackagingImages.jsx';
import PlasticConsumed3cTable from '../PlasticConsumed3cTable.jsx';
import LocalFilePreview from '../LocalFilePreview.jsx';
import { PLASTIC_CONSUMED_3C_COLUMNS } from '../../../shared/plasticConsumed3c.js';

const CATEGORY_LABELS = {
  'Cat-I': 'Rigid (Cat-I)',
  'Cat-II': 'Flexible (Cat-II)',
  'Cat-III': 'Multilayered (Cat-III)',
  'Cat-IV': 'Compostable (Cat-IV)',
};

function StatusPill({ children, tone = 'slate' }) {
  const tones = {
    green: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-blue-100 text-blue-800',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

export default function ImporterEprPreparedReview({
  companyName = 'Importer',
  importer3a = null,
  importer3aStatus = '',
  detailsOfProductsPath = '',
  importer3b = null,
  representativePicturePath = '',
  plasticConsumed = {},
  reportingYears = [],
  onImporter3aFinalized,
  onImporter3bChange,
  onPlasticConsumedChange,
  plasticConsumedSource = '',
  showToast,
}) {
  const [regenerating3a, setRegenerating3a] = useState(false);

  const isNil = importer3aStatus === 'nil' || importer3a?.status === 'nil';
  const isFinalized = importer3aStatus === 'finalized' || importer3aStatus === 'nil'
    || importer3a?.status === 'finalized' || importer3a?.status === 'nil';
  const detailRows = importer3a?.detailRows || [];
  const stats = importer3a?.stats || {};
  const has3a = Boolean(importer3a) || isFinalized;

  const handleRegenerate3aPdf = async () => {
    if (!window.pwp?.importerEpr?.finalize3a) {
      showToast?.('PDF generation needs the Electron app.', 'error');
      return;
    }
    if (!importer3a && !isNil) {
      showToast?.('No prepared Section 3a data to generate PDF.', 'error');
      return;
    }
    setRegenerating3a(true);
    try {
      const res = await window.pwp.importerEpr.finalize3a({
        companyName,
        draft: importer3a,
      });
      if (res.success) {
        onImporter3aFinalized?.({
          importer3a: res.importer3a,
          importer3aStatus: res.importer3aStatus,
          detailsOfProductsPath: res.detailsOfProductsPath,
          plasticConsumed: res.plasticConsumed,
        });
        showToast?.('Section 3a PDF regenerated', 'success');
      } else {
        showToast?.(res.error || 'Could not generate 3a PDF', 'error');
      }
    } finally {
      setRegenerating3a(false);
    }
  };

  const totalsByCategory = {};
  for (const col of PLASTIC_CONSUMED_3C_COLUMNS) {
    let sum = 0;
    for (const fy of reportingYears) {
      sum += parseFloat(plasticConsumed?.[fy]?.[col.key] || 0) || 0;
    }
    totalsByCategory[col.key] = Number(sum.toFixed(4));
  }

  return (
    <div className="md:col-span-2 mt-6 space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-6">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">EPR Prepared Data (3a, 3b, 3c)</h4>
          <p className="text-xs text-slate-500 mt-1">
            Review and edit prepared sections before CPCB upload.
          </p>
        </div>

        {/* Section 3a */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h5 className="text-sm font-medium text-slate-800">3a) Details of Products Produced / Marketed</h5>
              {isNil ? (
                <StatusPill tone="blue">NIL</StatusPill>
              ) : isFinalized ? (
                <StatusPill tone="green">Prepared</StatusPill>
              ) : has3a ? (
                <StatusPill>Draft</StatusPill>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleRegenerate3aPdf}
              disabled={regenerating3a || (!importer3a && !isNil)}
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {regenerating3a ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {detailsOfProductsPath ? 'Regenerate 3a PDF' : 'Generate 3a PDF'}
            </button>
          </div>

          {!has3a ? (
            <p className="text-sm text-slate-500 py-4 text-center border border-dashed rounded-lg bg-slate-50">
              No Section 3a data prepared yet.
            </p>
          ) : isNil ? (
            <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-3 py-3">
              No domestic sales — Section 3a is reported as NIL.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                <span>Matched rows: <strong>{stats.detailRowCount ?? detailRows.length}</strong></span>
                <span>Total packaging: <strong>{stats.totalPackagingMt ?? 0} MT</strong></span>
              </div>
              {detailRows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs min-w-[720px]">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="px-2 py-2 text-left">Product</th>
                        <th className="px-2 py-2 text-right">Sale Qty</th>
                        <th className="px-2 py-2 text-left">Category</th>
                        <th className="px-2 py-2 text-right">Packaging MT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="px-2 py-2 max-w-[180px] truncate" title={row.productDescription}>
                            {row.productDescription}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {row.productQtySold} {row.unit}
                          </td>
                          <td className="px-2 py-2">
                            {CATEGORY_LABELS[row.plasticCategory] || row.plasticCategory}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium text-teal-800">
                            {row.packagingMt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {detailsOfProductsPath ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} />
              <span>3a PDF: <strong>{detailsOfProductsPath.split(/[/\\]/).pop()}</strong></span>
              <LocalFilePreview filePath={detailsOfProductsPath} />
            </div>
          ) : null}
        </section>

        {/* Section 3b */}
        <section data-importer-3b-section>
          <ImporterPackagingImages
            companyName={companyName}
            images={importer3b?.images || []}
            generatedPdfPath={representativePicturePath}
            onChange={onImporter3bChange}
            showToast={showToast}
          />
        </section>

        {/* Section 3c */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <h5 className="text-sm font-medium text-slate-800">
              3c) Total Quantity of Plastic Consumed for Plastic Packaging (TPA)
            </h5>
            <p className="text-xs text-slate-500 mt-1">
              Values from prepared Section 3a — edit if needed before upload.
            </p>
            {plasticConsumedSource ? (
              <p className="text-xs text-teal-700 mt-1">
                Data source: {plasticConsumedSource}
              </p>
            ) : null}
          </div>
          <PlasticConsumed3cTable
            title=""
            years={reportingYears}
            plasticConsumed={plasticConsumed}
            readOnly={false}
            onChange={onPlasticConsumedChange}
            compact
          />
          <div className="flex flex-wrap gap-2 text-xs">
            {PLASTIC_CONSUMED_3C_COLUMNS.map((col) => (
              <div key={col.key} className="rounded-md bg-slate-50 px-2 py-1 border border-slate-100">
                <span className="text-slate-500">{col.label.split('(')[0].trim()}: </span>
                <strong className="tabular-nums">{totalsByCategory[col.key]} MT</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
