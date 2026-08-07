import { useMemo, useState ,useEffect } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

export default function CpcbConfirmationModal({ rows, type, onClose, onConfirm }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparedData, setPreparedData] = useState(null);
  const [prepareError, setPrepareError] = useState('');

  // Auto-correct toDate if fromDate changes and toDate becomes invalid
  useEffect(() => {
    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      const diffTime = to.getTime() - from.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive

      if (diffDays < 1 || diffDays > 31) {
        setToDate(fromDate);
      }
    }
  }, [fromDate]);

  // Calculate min and max for toDate picker
  const toDateMin = fromDate;
  const toDateMax = useMemo(() => {
    if (!fromDate) return '';
    const date = new Date(fromDate);
    date.setDate(date.getDate() + 30); // max 30 days after fromDate
    return date.toISOString().split('T')[0];
  }, [fromDate]);

  const filteredRows = useMemo(() => {
    if (!fromDate || !toDate) return rows;
    
    const start = new Date(fromDate);
    const end = new Date(toDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return rows.filter(r => {
      const dateStr = r.invoice_date || r.procurement_date || r.date_of_entry || '';
      if (!dateStr) return true; // keep rows with no date? or false? let's keep them if no date is specified or maybe filter out? usually better to keep or maybe check the logic. Let's keep them if no date is found or assume they fall in range if they were fetched. Wait, CPCB data usually has dates. Let's strictly filter:
      const rowDate = new Date(dateStr);
      return rowDate >= start && rowDate <= end;
    });
  }, [rows, fromDate, toDate]);

  const summary = useMemo(() => {
    let totalQty = 0;
    const byCategory = {};
    const byMonth = {};

    filteredRows.forEach(r => {
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
  }, [filteredRows]);

  const handlePrepareData = async () => {
    if (!fromDate || !toDate) {
      setPrepareError('Please select both From and To dates.');
      return;
    }
    if (filteredRows.length === 0) {
      setPrepareError('No records found for the selected date range.');
      return;
    }
    setPrepareError('');
    setIsPreparing(true);

    try {
      if (!window.pwp?.scraper?.prepareCpcbData) {
        throw new Error('prepareCpcbData IPC missing - restart app.');
      }
      const res = await window.pwp.scraper.prepareCpcbData({ rows: filteredRows, type, fromDate, toDate });
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to prepare data');
      }
      
      // Artificial delay to prevent accidental double-clicks from immediately triggering Confirm
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setPreparedData(res); // expecting { success: true, excelPath, zipPath }
    } catch (err) {
      setPrepareError(err.message || 'Something went wrong');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleConfirm = () => {
    if (preparedData) {
      onConfirm({
        fromDate,
        toDate,
        excelPath: preparedData.excelPath,
        zipPath: preparedData.zipPath,
      });
    }
  };

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
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 disabled:opacity-50 disabled:bg-slate-100"
                  value={toDate}
                  min={toDateMin}
                  max={toDateMax}
                  disabled={!fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-[-8px]">Select a date range up to 31 days</p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-blue-50 text-blue-800 rounded-xl">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Please review the data summary before uploading.</p>
              <p className="text-sm mt-1 opacity-90">
                You are about to upload {filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'} to the CPCB portal.
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
          
          {prepareError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {prepareError}
            </div>
          )}
          
          {preparedData && (
            <div className="p-4 bg-green-50 text-green-800 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={18} className="text-green-600" />
                <span className="font-medium">Data Prepared Successfully</span>
              </div>
              <div className="text-sm space-y-1 text-green-700">
                <p><strong>Excel:</strong> {preparedData.excelPath}</p>
                <p><strong>ZIP:</strong> {preparedData.zipPath}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          {!preparedData ? (
            <button
              type="button"
              onClick={handlePrepareData}
              disabled={isPreparing || !fromDate || !toDate}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPreparing ? 'Preparing...' : 'Prepare Data'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <CheckCircle size={16} />
              Confirm & Upload
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
