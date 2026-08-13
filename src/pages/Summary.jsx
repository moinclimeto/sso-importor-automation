import { useEffect, useState } from 'react';
import { BarChart3, Filter, TrendingUp, ShoppingCart, IndianRupee } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);

function SummaryCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className={`rounded-xl p-5 ${bg} border flex items-start gap-4`}>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-slate-600">{label}</p>
        <p className="text-xl font-bold text-slate-800">₹{fmt(value)}</p>
      </div>
    </div>
  );
}

export default function Summary() {
  const [companies, setCompanies] = useState([]);
  const [purchaseSummary, setPurchaseSummary] = useState(null);
  const [saleSummary, setSaleSummary] = useState(null);
  const [filters, setFilters] = useState({ company_id: '', from_date: '', to_date: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.pwp) {
      window.pwp.companies.getAll().then(setCompanies);
      loadSummary();
    }
  }, []);

  const loadSummary = async () => {
    if (!window.pwp) return;
    setLoading(true);
    const activeFilters = {};
    if (filters.company_id) activeFilters.company_id = filters.company_id;
    if (filters.from_date) activeFilters.from_date = filters.from_date;
    if (filters.to_date) activeFilters.to_date = filters.to_date;
    const [ps, ss] = await Promise.all([
      window.pwp.purchases.getSummary(activeFilters),
      window.pwp.sales.getSummary(activeFilters),
    ]);
    setPurchaseSummary(ps);
    setSaleSummary(ss);
    setLoading(false);
  };

  const profit = (saleSummary?.total_amount || 0) - (purchaseSummary?.total_amount || 0);

  const rows = [
    { label: 'Total Records', purchase: purchaseSummary?.total_records, sale: saleSummary?.total_records, format: (v) => v },
    { label: 'Taxable Amount', purchase: purchaseSummary?.total_taxable, sale: saleSummary?.total_taxable, format: (v) => `₹${fmt(v)}` },
    { label: 'CGST', purchase: purchaseSummary?.total_cgst, sale: saleSummary?.total_cgst, format: (v) => `₹${fmt(v)}` },
    { label: 'SGST', purchase: purchaseSummary?.total_sgst, sale: saleSummary?.total_sgst, format: (v) => `₹${fmt(v)}` },
    { label: 'IGST', purchase: purchaseSummary?.total_igst, sale: saleSummary?.total_igst, format: (v) => `₹${fmt(v)}` },
    { label: 'Total GST', purchase: (purchaseSummary?.total_cgst || 0) + (purchaseSummary?.total_sgst || 0) + (purchaseSummary?.total_igst || 0), sale: (saleSummary?.total_cgst || 0) + (saleSummary?.total_sgst || 0) + (saleSummary?.total_igst || 0), format: (v) => `₹${fmt(v)}` },
    { label: 'Grand Total', purchase: purchaseSummary?.total_amount, sale: saleSummary?.total_amount, format: (v) => `₹${fmt(v)}`, bold: true },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Summary</h1>
        <p className="text-slate-500 text-sm">Purchase & Sale summary with GST breakdown</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3 items-end">
        <div className="flex items-center gap-2 text-slate-500 mr-2">
          <Filter size={16} />
          <span className="text-sm font-medium">Filter:</span>
        </div>
        <div>
          <label className="label">Company</label>
          <select value={filters.company_id} onChange={(e) => setFilters({ ...filters, company_id: e.target.value })} className="input w-44">
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From Date</label>
          <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} className="input w-40" />
        </div>
        <div>
          <label className="label">To Date</label>
          <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} className="input w-40" />
        </div>
        <button onClick={loadSummary} className="btn-primary h-9 px-4 text-sm">Apply</button>
        <button
          onClick={() => { setFilters({ company_id: '', from_date: '', to_date: '' }); setTimeout(loadSummary, 0); }}
          className="btn-secondary h-9 px-4 text-sm"
        >
          Clear
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Top cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard label="Total Purchase" value={purchaseSummary?.total_amount} icon={ShoppingCart} color="bg-blue-500" bg="bg-blue-50 border-blue-100" />
            <SummaryCard label="Total Sale" value={saleSummary?.total_amount} icon={TrendingUp} color="bg-green-500" bg="bg-green-50 border-green-100" />
            <div className={`rounded-xl p-5 ${profit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'} border flex items-start gap-4`}>
              <div className={`p-3 rounded-lg ${profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
                <IndianRupee size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">{profit >= 0 ? 'Profit' : 'Loss'}</p>
                <p className={`text-xl font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  ₹{fmt(Math.abs(profit))}
                </p>
              </div>
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <BarChart3 size={18} className="text-slate-500" />
              <h2 className="font-semibold text-slate-800">Detailed Breakdown</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="th">Description</th>
                  <th className="th text-right text-blue-600">Purchase</th>
                  <th className="th text-right text-green-600">Sale</th>
                  <th className="th text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const diff = (row.sale || 0) - (row.purchase || 0);
                  return (
                    <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${row.bold ? 'bg-slate-50 font-semibold' : ''}`}>
                      <td className={`td ${row.bold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{row.label}</td>
                      <td className={`td text-right text-blue-700 ${row.bold ? 'font-bold' : ''}`}>{row.format(row.purchase)}</td>
                      <td className={`td text-right text-green-700 ${row.bold ? 'font-bold' : ''}`}>{row.format(row.sale)}</td>
                      <td className={`td text-right ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'} ${row.bold ? 'font-bold' : ''}`}>
                        {row.label === 'Total Records' ? diff : `₹${fmt(Math.abs(diff))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
