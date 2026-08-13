import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, Filter } from 'lucide-react';
import TransactionModal from '../components/TransactionModal.jsx';

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);

export default function Sales() {
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ company_id: '', from_date: '', to_date: '' });

  const load = async () => {
    if (!window.pwp) { setLoading(false); return; }
    setLoading(true);
    const activeFilters = {};
    if (filters.company_id) activeFilters.company_id = filters.company_id;
    if (filters.from_date) activeFilters.from_date = filters.from_date;
    if (filters.to_date) activeFilters.to_date = filters.to_date;
    const [data, comps] = await Promise.all([
      window.pwp.sales.getAll(activeFilters),
      window.pwp.companies.getAll(),
    ]);
    setRecords(data);
    setCompanies(comps);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (!window.pwp) return;
    if (modal?.id) await window.pwp.sales.update({ ...form, id: modal.id });
    else await window.pwp.sales.add(form);
    setModal(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this sale record?')) return;
    await window.pwp.sales.delete(id);
    load();
  };

  const totalAmount = records.reduce((s, r) => s + (r.total_amount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sales</h1>
          <p className="text-slate-500 text-sm">{records.length} records — Total: ₹{fmt(totalAmount)}</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Sale
        </button>
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
        <button onClick={load} className="btn-primary h-9 px-4 text-sm">Apply</button>
        <button
          onClick={() => { setFilters({ company_id: '', from_date: '', to_date: '' }); setTimeout(load, 0); }}
          className="btn-secondary h-9 px-4 text-sm"
        >
          Clear
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center shadow-sm border border-slate-100">
          <TrendingUp size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No sale records found.</p>
          <button onClick={() => setModal({})} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus size={16} /> Add Sale
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="th">#</th>
                  <th className="th">Date</th>
                  <th className="th">Invoice No</th>
                  <th className="th">Customer</th>
                  <th className="th">Item</th>
                  <th className="th">Qty</th>
                  <th className="th">Rate</th>
                  <th className="th">Taxable</th>
                  <th className="th">GST</th>
                  <th className="th font-semibold">Total</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="td text-slate-400">{i + 1}</td>
                    <td className="td text-slate-600">{r.invoice_date}</td>
                    <td className="td font-medium">{r.invoice_no}</td>
                    <td className="td">{r.customer_name}</td>
                    <td className="td">{r.item_name}</td>
                    <td className="td text-right">{r.quantity} {r.unit}</td>
                    <td className="td text-right">₹{fmt(r.rate)}</td>
                    <td className="td text-right">₹{fmt(r.taxable_amount)}</td>
                    <td className="td text-right text-slate-500">
                      ₹{fmt((r.cgst_amount || 0) + (r.sgst_amount || 0) + (r.igst_amount || 0))}
                    </td>
                    <td className="td text-right font-semibold text-green-600">₹{fmt(r.total_amount)}</td>
                    <td className="td text-right">
                      <button onClick={() => setModal(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg mr-1 transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-green-50 border-t-2 border-green-200">
                  <td colSpan={9} className="td font-semibold text-slate-700 text-right">Grand Total:</td>
                  <td className="td font-bold text-green-700 text-right text-base">₹{fmt(totalAmount)}</td>
                  <td className="td" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {modal !== null && (
        <TransactionModal
          type="sale"
          record={modal?.id ? modal : null}
          companies={companies}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
