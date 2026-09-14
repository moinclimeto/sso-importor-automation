import { UploadCloud, RefreshCw } from 'lucide-react';
import PlasticConsumed3cTable from '../PlasticConsumed3cTable.jsx';
import RegistrationPartAPdfUploads from '../RegistrationPartAPdfUploads.jsx';
import { PLASTIC_CONSUMED_3C_COLUMNS } from '../../../shared/plasticConsumed3c.js';
import {
  CURRENT_FY_COMMENCEMENT_HINT,
  requiresHistoricalEprData,
} from '../../../shared/commencementYearScope.js';
import {
  validatePlasticConsumed3cForPortal,
  formatPlasticConsumed3cIssue,
} from '../../../shared/plasticConsumed3cValidation.js';

export default function ImporterEprPreparedReview({
  detailsOfProductsPath = '',
  representativePicturePath = '',
  plasticConsumed = {},
  reportingYears = [],
  yearOfCommencement = '',
  onPdfUpload,
  uploadingPdfField = '',
  onPlasticConsumedChange,
  plasticConsumedSource = '',
  onNavigateToDocProcessor,
  onRefreshDocData,
  refreshingDocData = false,
}) {
  const showHistoricalSections = requiresHistoricalEprData(yearOfCommencement);
  const plasticConsumedIssues = showHistoricalSections
    ? validatePlasticConsumed3cForPortal({
      plasticConsumed,
      yearOfCommencement,
      reportingYears,
    })
    : [];
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
          <h4 className="text-sm font-semibold text-slate-800">3) Operations Details</h4>
          <p className="text-xs text-slate-500 mt-1">
            Upload Section 3a and 3b PDFs required by CPCB Part A.
          </p>
          {!showHistoricalSections ? (
            <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-md px-3 py-2 mt-2">
              {CURRENT_FY_COMMENCEMENT_HINT}
            </p>
          ) : null}
        </div>

        <RegistrationPartAPdfUploads
          detailsOfProductsPath={detailsOfProductsPath}
          representativePicturePath={representativePicturePath}
          onUpload={onPdfUpload}
          uploadingField={uploadingPdfField}
        />

        {showHistoricalSections ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h5 className="text-sm font-medium text-slate-800">
                  3c) Total Quantity of Plastic Consumed for Plastic Packaging (TPA)
                </h5>
                <p className="text-xs text-slate-500 mt-0.5">
                  Edit category-wise TPA values directly or upload invoices in Doc Processor.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                {onRefreshDocData ? (
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={onRefreshDocData}
                      disabled={refreshingDocData}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                    >
                      <RefreshCw size={12} className={refreshingDocData ? 'animate-spin text-teal-600' : 'text-slate-500'} />
                      <span>Sync</span>
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-slate-900/95 backdrop-blur-xs px-2.5 py-1.5 text-center text-[11px] font-medium leading-normal text-white shadow-xl opacity-0 translate-y-1 scale-95 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 transition-all duration-200 ease-out z-30">
                      Sync Section 3c totals from published Doc Processor invoices.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900/95" />
                    </div>
                  </div>
                ) : null}
                {onNavigateToDocProcessor ? (
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={onNavigateToDocProcessor}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 active:scale-95 transition-all shadow-sm cursor-pointer"
                    >
                      <UploadCloud size={14} />
                      <span>Upload Invoices</span>
                    </button>
                    <div className="pointer-events-none absolute bottom-full right-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 w-56 rounded-lg bg-slate-900/95 backdrop-blur-xs px-2.5 py-1.5 text-center text-[11px] font-medium leading-normal text-white shadow-xl opacity-0 translate-y-1 scale-95 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 transition-all duration-200 ease-out z-30">
                      Go to Doc Processor Purchase Table to upload and publish invoices.
                      <div className="absolute top-full right-6 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto -mt-px border-4 border-transparent border-t-slate-900/95" />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {plasticConsumedIssues.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 mt-2 space-y-1">
                <p className="text-xs font-semibold text-red-800">CPCB will reject Register</p>
                {plasticConsumedIssues.map((issue) => (
                  <p key={issue.id} className="text-xs text-red-700">
                    {formatPlasticConsumed3cIssue(issue)}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mt-2">
                After editing 3c values, update Part B → Section 4 so totals stay within ±40% of these figures.
              </p>
            )}
            {plasticConsumedSource ? (
              <p className="text-xs text-teal-700 mt-1">
                Data source: {plasticConsumedSource}
              </p>
            ) : null}
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
        ) : null}
      </div>
    </div>
  );
}
