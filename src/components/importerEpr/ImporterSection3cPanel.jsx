import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import PlasticConsumed3cTable from '../PlasticConsumed3cTable.jsx';
import { PLASTIC_CONSUMED_3C_COLUMNS } from '../../../shared/plasticConsumed3c.js';

export default function ImporterSection3cPanel({
  years = [],
  plasticConsumed = {},
  importer3aStatus = '',
  confirmed = false,
  onConfirmedChange,
  readOnly = true,
}) {
  const [localConfirmed, setLocalConfirmed] = useState(confirmed);

  const isConfirmed = onConfirmedChange ? confirmed : localConfirmed;
  const setConfirmed = onConfirmedChange || setLocalConfirmed;

  const totalsByYear = useMemo(() => {
    const out = {};
    for (const year of years) {
      const row = plasticConsumed?.[year] || {};
      let total = 0;
      for (const col of PLASTIC_CONSUMED_3C_COLUMNS) {
        total += parseFloat(row[col.key] || 0) || 0;
      }
      out[year] = Number(total.toFixed(4));
    }
    return out;
  }, [years, plasticConsumed]);

  const isNil = importer3aStatus === 'nil';
  const hasData = isNil || years.some((y) => totalsByYear[y] > 0 || importer3aStatus === 'finalized');

  return (
    <div className="space-y-3">
      <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-md px-2.5 py-2">
        These values are automatically derived from your finalized <strong>Section 3a</strong> data.
        No manual entry is required.
      </p>

      {hasData ? (
        <>
          <PlasticConsumed3cTable
            title=""
            years={years}
            plasticConsumed={plasticConsumed}
            readOnly={readOnly}
            compact
          />
          {years.map((year) => (
            <p key={year} className="text-xs text-slate-600 text-right tabular-nums">
              {years.length > 1 ? `${year} — ` : ''}
              Total plastic packaging: <strong>{totalsByYear[year]} MT</strong>
            </p>
          ))}
        </>
      ) : (
        <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
          Finalize Section 3a above to populate Section 3c values.
        </p>
      )}

      {hasData && importer3aStatus === 'finalized' && (
        <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
            checked={isConfirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I have reviewed the Section 3c plastic packaging quantities derived from Section 3a.
          </span>
        </label>
      )}

      {isNil && (
        <p className="text-xs text-slate-600 flex items-center gap-1">
          <CheckCircle2 size={14} className="text-teal-600" />
          Section 3a is NIL — all Section 3c categories are zero.
        </p>
      )}
    </div>
  );
}
