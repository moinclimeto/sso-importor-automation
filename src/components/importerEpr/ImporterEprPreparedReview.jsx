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
            <div>
              <h5 className="text-sm font-medium text-slate-800">
                3c) Total Quantity of Plastic Consumed for Plastic Packaging (TPA)
              </h5>
              <p className="text-xs text-slate-500 mt-1">
                Edit category-wise TPA values before CPCB upload if needed.
              </p>
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
        ) : null}
      </div>
    </div>
  );
}
