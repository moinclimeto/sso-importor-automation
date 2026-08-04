import { useMemo } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

export default function CpcbConfirmationModal({ rows, type, onClose, onConfirm }) {
  const summary = useMemo(() => {
    let totalQty = 0;
    const byCategory = {};
    const byMonth = {};

    rows.forEach(r => {
      // Calculate quantity
      let qty = parseFloat(r.quantity_sold_mt || r.quantity_mt || r.quantity || 0);
      if (isNaN(qty)) qty = 0;
      totalQty += qty;

      // Calculate Category
      const cat = r.category_of_plastic || r.item_name || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += qty;

      // Calculate Month
      const dateStr = r.invoice_date || r.procurement_date || '';
      let month = 'Unknown';
      if (dateStr && dateStr.length >= 7) {
        month = dateStr.substring(0, 7); // YYYY-MM
      }
      if (!byMonth[month]) byMonth[month] = 0;
      byMonth[month] += qty;
    });

    return { totalQty, byCategory, byMonth };
  }, [rows]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-slate-800">
            Confirm {type === 'purchase' ? 'Purchase' : 'Sales'} Upload to CPCB
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="flex items-start gap-3 p-4 bg-blue-50 text-blue-800 rounded-xl">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Please review the data summary before uploading.</p>
              <p className="text-sm mt-1 opacity-90">
                You are about to upload {rows.length} {rows.length === 1 ? 'record' : 'records'} to the CPCB portal.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border rounded-xl p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Total Quantity</h3>
            <p className="text-3xl font-bold text-slate-900">{summary.totalQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Wise */}
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b font-medium text-slate-700">Category Wise (MT)</div>
              <ul className="divide-y max-h-48 overflow-y-auto">
                {Object.entries(summary.byCategory).map(([cat, qty]) => (
                  <li key={cat} className="px-4 py-2 flex justify-between items-center text-sm">
                    <span className="text-slate-600 truncate mr-2" title={cat}>{cat}</span>
                    <span className="font-medium text-slate-800 whitespace-nowrap">{qty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Month Wise */}
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b font-medium text-slate-700">Month Wise (MT)</div>
              <ul className="divide-y max-h-48 overflow-y-auto">
                {Object.entries(summary.byMonth).sort((a,b) => b[0].localeCompare(a[0])).map(([month, qty]) => (
                  <li key={month} className="px-4 py-2 flex justify-between items-center text-sm">
                    <span className="text-slate-600">{month}</span>
                    <span className="font-medium text-slate-800">{qty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <CheckCircle size={16} />
            Confirm & Upload
          </button>
        </div>
      </div>
    </div>
  );
}
