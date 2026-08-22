import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, MapPin, Calendar } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import {
  PLASTIC_CATEGORIES,
  aggregateByFinancialYear,
  aggregateByStateAndFy,
  formatMt,
  mergeAggregates,
} from '../../shared/plasticMtAggregation.js';
import {
  buildPlasticConsumed3cFromPurchases,
  plasticConsumed3cHasData,
} from '../../shared/plasticConsumed3c.js';
import PlasticConsumed3cTable from '../components/PlasticConsumed3cTable.jsx';
import { FINANCIAL_YEAR_OPTIONS } from '../../shared/procurementConversionFactor.js';

const DOC_TYPE_OPTIONS = [
  { value: 'purchase', label: 'Procurement' },
  { value: 'sale', label: 'Post Consumer' },
  { value: 'both', label: 'Combined' },
];

const STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'all', label: 'All statuses' },
];

function ReportTable({ columns, rows, emptyMessage }) {
  if (!rows.length) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap ${col.className || ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/60">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-slate-700 tabular-nums ${col.className || ''}`}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlasticMtReports({ embedded = false }) {
  const { setPageHeader, clearPageHeader } = usePageHeader();
  const [view, setView] = useState('fy');
  const [docType, setDocType] = useState('both');
  const [docStatus, setDocStatus] = useState('published');
  const [fyFilter, setFyFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyFilter, setCompanyFilter] = useState('');

  useEffect(() => {
    if (embedded) return undefined;
    setPageHeader({
      title: 'Plastic Quantity Reports',
      subtitle: 'Category-wise MT totals by Financial Year and State',
    });
    return clearPageHeader;
  }, [embedded, setPageHeader, clearPageHeader]);

  const load = useCallback(async () => {
    if (!window.pwp) return;
    setLoading(true);
    try {
      const [p, s, comps] = await Promise.all([
        window.pwp.purchases.getAll(),
        window.pwp.sales.getAll(),
        window.pwp.companies.getAll(),
      ]);
      setPurchases(p || []);
      setSales(s || []);
      setCompanies(comps || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filters = useMemo(
    () => ({ docStatus, financialYear: fyFilter }),
    [docStatus, fyFilter],
  );

  const plasticConsumed3c = useMemo(
    () => buildPlasticConsumed3cFromPurchases(purchases, {
      docStatus,
      financialYear: fyFilter,
      companyId: companyFilter || null,
    }),
    [purchases, docStatus, fyFilter, companyFilter],
  );

  const fyRows = useMemo(() => {
    const pRows = aggregateByFinancialYear(purchases, 'purchase', filters);
    const sRows = aggregateByFinancialYear(sales, 'sale', filters);
    if (docType === 'purchase') return pRows;
    if (docType === 'sale') return sRows;
    return mergeAggregates(pRows, sRows, ['financial_year']).sort((a, b) =>
      b.financial_year.localeCompare(a.financial_year),
    );
  }, [purchases, sales, docType, filters]);

  const stateRows = useMemo(() => {
    const pRows = aggregateByStateAndFy(purchases, 'purchase', filters);
    const sRows = aggregateByStateAndFy(sales, 'sale', filters);
    if (docType === 'purchase') return pRows;
    if (docType === 'sale') return sRows;
    return mergeAggregates(pRows, sRows, ['financial_year', 'state']).sort((a, b) => {
      const fyCmp = b.financial_year.localeCompare(a.financial_year);
      if (fyCmp !== 0) return fyCmp;
      return a.state.localeCompare(b.state);
    });
  }, [purchases, sales, docType, filters]);

  const fyOptions = useMemo(() => {
    const fromData = [
      ...purchases.map((r) => r.financial_year),
      ...sales.map((r) => r.financial_year),
    ].filter(Boolean);
    const merged = new Set([...FINANCIAL_YEAR_OPTIONS, ...fromData]);
    return ['all', ...Array.from(merged).sort().reverse()];
  }, [purchases, sales]);

  const categoryCols = PLASTIC_CATEGORIES.map((cat) => ({
    key: cat,
    label: cat,
    className: 'text-right',
    render: (row) => formatMt(row[cat]),
  }));

  const fyColumns = [
    { key: 'financial_year', label: 'Financial Year' },
    ...categoryCols,
    {
      key: 'total',
      label: 'Total (MT)',
      className: 'text-right font-semibold text-slate-900',
      render: (row) => formatMt(row.total),
    },
  ];

  const stateColumns = [
    { key: 'financial_year', label: 'Financial Year' },
    { key: 'state', label: 'State' },
    ...categoryCols,
    {
      key: 'total',
      label: 'Total (MT)',
      className: 'text-right font-semibold text-slate-900',
      render: (row) => formatMt(row.total),
    },
  ];

  const grandTotals = useMemo(() => {
    const source = view === 'fy' ? fyRows : stateRows;
    const totals = { total: 0 };
    for (const cat of PLASTIC_CATEGORIES) totals[cat] = 0;
    for (const row of source) {
      for (const cat of PLASTIC_CATEGORIES) totals[cat] += row[cat] || 0;
      totals.total += row.total || 0;
    }
    return totals;
  }, [view, fyRows, stateRows]);

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setView('fy')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'fy'
              ? 'bg-green-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Calendar size={16} />
          FY Wise
        </button>
        <button
          type="button"
          onClick={() => setView('state')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'state'
              ? 'bg-green-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <MapPin size={16} />
          State Wise
        </button>
        <button
          type="button"
          onClick={() => setView('3c')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === '3c'
              ? 'bg-[#0b6c7a] text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <BarChart3 size={16} />
          3c Packaging (TPA)
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          {view !== '3c' ? (
            <div>
              <label className="label text-xs text-slate-500">Data type</label>
              <select
                className="input text-sm min-w-[10rem]"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {DOC_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="label text-xs text-slate-500">Status</label>
            <select
              className="input text-sm min-w-[10rem]"
              value={docStatus}
              onChange={(e) => setDocStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs text-slate-500">Financial Year</label>
            <select
              className="input text-sm min-w-[10rem]"
              value={fyFilter}
              onChange={(e) => setFyFilter(e.target.value)}
            >
              {fyOptions.map((fy) => (
                <option key={fy} value={fy}>
                  {fy === 'all' ? 'All years' : fy}
                </option>
              ))}
            </select>
          </div>
          {view === '3c' ? (
            <div>
              <label className="label text-xs text-slate-500">Company</label>
              <select
                className="input text-sm min-w-[12rem]"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
              >
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
        </div>
      ) : view === '3c' ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-4 py-3 text-sm text-teal-900">
            <p className="font-medium">Section 3c — Plastic packaging consumed (confirmation)</p>
            <p className="mt-1 text-xs text-teal-800 leading-relaxed">
              Totals are calculated from <strong>Procurement</strong> invoices where packaging is added on review
              (line-level category + MT). Values are category-wise and financial-year-wise in Tonnes — confirm before CPCB upload.
            </p>
          </div>
          <PlasticConsumed3cTable
            title=""
            years={plasticConsumed3c.years}
            plasticConsumed={plasticConsumed3c.plasticConsumed}
            readOnly
          />
          {!plasticConsumed3cHasData(plasticConsumed3c.plasticConsumed) ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
              No packaging MT found for selected filters. Publish procurement records with plastic category and conversion factor on review pages.
            </p>
          ) : null}
        </div>
      ) : (
        <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {PLASTIC_CATEGORIES.map((cat) => (
          <div key={cat} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{cat}</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{formatMt(grandTotals[cat])}</p>
            <p className="text-[11px] text-slate-400">MT</p>
          </div>
        ))}
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 shadow-sm">
          <p className="text-xs text-green-700 uppercase tracking-wide flex items-center gap-1">
            <BarChart3 size={12} /> Grand Total
          </p>
          <p className="text-xl font-bold text-green-900 mt-1">{formatMt(grandTotals.total)}</p>
          <p className="text-[11px] text-green-600">MT</p>
        </div>
      </div>

      {view === 'fy' ? (
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3">Financial Year → Category (MT)</h3>
          <ReportTable
            columns={fyColumns}
            rows={fyRows}
            emptyMessage="No published records found for the selected filters."
          />
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3">State + Financial Year → Category (MT)</h3>
          <ReportTable
            columns={stateColumns}
            rows={stateRows}
            emptyMessage="No published records found for the selected filters."
          />
        </div>
      )}
        </>
      )}
    </div>
  );
}
