import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);

export default function DocTable() {
  const navigate = useNavigate();
  const location = useLocation();
  const type = location.state?.type === 'sale' ? 'sale' : 'purchase';
  const isPurchase = type === 'purchase';
  const title = isPurchase ? 'Procurement' : 'Post Consumer';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!window.pwp) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = isPurchase
        ? await window.pwp.purchases.getAll()
        : await window.pwp.sales.getAll();
      setRows(data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [type]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this record?')) return;
    try {
      if (isPurchase) await window.pwp.purchases.delete(id);
      else await window.pwp.sales.delete(id);
      load();
    } catch (err) {
      alert(err?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/doc-processor')}
          className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{rows.length} records in local database</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No records yet. Upload a document to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="th">Invoice</th>
                  <th className="th">Date</th>
                  <th className="th">{isPurchase ? 'Vendor' : 'Customer'}</th>
                  <th className="th">Item</th>
                  <th className="th">Qty</th>
                  <th className="th">Total</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="td font-medium">{r.invoice_no}</td>
                    <td className="td">{r.invoice_date}</td>
                    <td className="td">{isPurchase ? r.vendor_name : r.customer_name}</td>
                    <td className="td">{r.item_name}</td>
                    <td className="td">{r.quantity} {r.unit}</td>
                    <td className="td">₹{fmt(r.total_amount)}</td>
                    <td className="td text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
