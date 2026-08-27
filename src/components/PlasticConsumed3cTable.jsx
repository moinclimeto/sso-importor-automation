import { PLASTIC_CONSUMED_3C_COLUMNS } from '../../shared/plasticConsumed3c.js';

const HEADER_CLASS = 'bg-[#0b6c7a] text-white';

export default function PlasticConsumed3cTable({
  title = '3c) Total Quantity of Plastic Consumed for Plastic Packaging of Commodities (TPA)',
  years = [],
  plasticConsumed = {},
  readOnly = true,
  onChange,
  compact = false,
}) {
  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3';
  const inputClass = compact
    ? 'w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none tabular-nums'
    : 'w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none tabular-nums';

  const handleCellChange = (year, catKey, value) => {
    onChange?.({
      ...plasticConsumed,
      [year]: {
        ...(plasticConsumed[year] || {}),
        [catKey]: value,
      },
    });
  };

  return (
    <div>
      {title ? (
        <label className="block text-sm font-medium text-slate-700 mb-2">{title}</label>
      ) : null}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className={HEADER_CLASS}>
            <tr>
              <th className={`${cellPad} font-medium whitespace-nowrap`}>Year</th>
              {PLASTIC_CONSUMED_3C_COLUMNS.map((col) => (
                <th key={col.key} className={`${cellPad} font-medium`}>
                  {col.label}
                  <br />
                  <span className="font-normal text-xs opacity-90">* Enter value in Tonnes</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {years.map((year) => (
              <tr key={year}>
                <td className={`${cellPad} font-medium text-slate-700 bg-slate-50/80 whitespace-nowrap`}>
                  {year}
                </td>
                {PLASTIC_CONSUMED_3C_COLUMNS.map((col) => (
                  <td key={col.key} className={compact ? 'px-2 py-1.5' : 'px-4 py-2'}>
                    {readOnly ? (
                      <span className={`block ${compact ? 'text-xs' : 'text-sm'} text-slate-800 tabular-nums px-1`}>
                        {plasticConsumed?.[year]?.[col.key] ?? '0'}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={inputClass}
                        value={plasticConsumed?.[year]?.[col.key] ?? ''}
                        onChange={(e) => handleCellChange(year, col.key, e.target.value)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
