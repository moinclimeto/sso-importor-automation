import PlasticConsumed3cTable from '../PlasticConsumed3cTable.jsx';
import { PLASTIC_CONSUMED_3C_COLUMNS } from '../../../shared/plasticConsumed3c.js';
import {
  CURRENT_FY_COMMENCEMENT_HINT,
  requiresHistoricalEprData,
} from '../../../shared/commencementYearScope.js';

import { Settings, Edit } from 'lucide-react';

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
  const totalsByCategory = {};
  for (const col of PLASTIC_CONSUMED_3C_COLUMNS) {
    let sum = 0;
    for (const fy of reportingYears) {
      sum += parseFloat(plasticConsumed?.[fy]?.[col.key] || 0) || 0;
    }
    totalsByCategory[col.key] = Number(sum.toFixed(4));
  }

  return (
    <div className="md:col-span-2 space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-slate-100">
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Settings size={18} />
            </div>
            <h2 className="text-[15px] font-bold text-slate-800 flex items-center gap-2">
              3. Operations Details
            </h2>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-medium text-slate-500 mb-4">
            Upload Section 3a and 3b PDFs required by CPCB Part A.
          </p>
          {!showHistoricalSections ? (
            <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-md px-3 py-2 mt-2">
              {CURRENT_FY_COMMENCEMENT_HINT}
            </p>
          ) : null}
        </div>

        {showHistoricalSections ? (
          <section className="rounded-xl bg-white border border-slate-200/80 p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] mt-4">
            <div>
              <h5 className="text-[13px] font-bold text-slate-800">
                3c) Total Quantity of Plastic Consumed for Plastic Packaging (TPA)
              </h5>
              <p className="text-[11px] font-medium text-slate-500 mt-1">
                Edit category-wise TPA values before CPCB upload if needed.
              </p>
              {plasticConsumedSource ? (
                <p className="text-[11px] font-medium text-emerald-600 mt-1.5">
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
            <div className="flex flex-wrap gap-2 text-[11px]">
              {PLASTIC_CONSUMED_3C_COLUMNS.map((col) => (
                <div key={col.key} className="rounded-lg bg-[#f8fafc] px-2.5 py-1.5 border border-slate-200/80 flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold">{col.label.split('(')[0].trim()}:</span>
                  <strong className="text-slate-800 tabular-nums">{totalsByCategory[col.key]} MT</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
