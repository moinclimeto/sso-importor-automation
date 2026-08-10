import { useMemo, useState ,useEffect } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

export default function CpcbConfirmationModal({ rows, type, onClose, onConfirm }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparedData, setPreparedData] = useState(null);
  const [prepareError, setPrepareError] = useState('');
  const [progressText, setProgressText] = useState('');

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
      const dateStr = r.invoice_date || '';
      if (!dateStr) return false;
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
      const dateStr = r.invoice_date || '';
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
      
      let progressOff = null;
      if (window.pwp?.scraper?.onPrepareProgress) {
        progressOff = window.pwp.scraper.onPrepareProgress((data) => {
          if (data?.message) setProgressText(data.message);
        });
      }

      const res = await window.pwp.scraper.prepareCpcbData({ rows: filteredRows, type, fromDate, toDate });
      
      if (progressOff) progressOff();

      if (!res?.success) {
        throw new Error(res?.error || 'Failed to prepare data');
      }
      
      // Artificial delay to prevent accidental double-clicks from immediately triggering Confirm
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setPreparedData(res); 
    } catch (err) {
      setPrepareError(err.message || 'Something went wrong');
    } finally {
      setIsPreparing(false);
      setProgressText('');
    }
  };

  const handleConfirm = () => {
    if (preparedData && preparedData.batches && preparedData.batches.length > 0) {
      onConfirm({
        fromDate,
        toDate,
        excelPath: preparedData.batches[0].excelPath,
        zipPath: preparedData.batches[0].zipPath,
      });
    } else if (preparedData) {
      onConfirm({
        fromDate,
        toDate,
        excelPath: preparedData.excelPath,
        zipPath: preparedData.zipPath,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_ease-out] border border-slate-100">
        {/* Header */}
        <div className="flex flex-col px-6 py-4 border-b bg-slate-50/50 rounded-t-2xl">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-slate-800">
              Confirm {type === 'purchase' ? 'Purchase' : 'Sales'} Upload to CPCB
            </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <p>You are about to upload <span className="font-semibold text-indigo-600">{filteredRows.length}</span> records.</p>
            <p>Please review the summary below.</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">From Date</label>
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none text-slate-700 bg-slate-50 hover:bg-white transition-colors"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">To Date</label>
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none text-slate-700 bg-slate-50 hover:bg-white transition-colors disabled:opacity-50 disabled:bg-slate-100"
                  value={toDate}
                  min={toDateMin}
                  max={toDateMax}
                  disabled={!fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Select a date range up to 31 days</p>
          </div>

          <div className="bg-gradient-to-r from-slate-50 to-white border border-slate-100 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-600">Total Quantity</h3>
            <p className="text-2xl font-bold text-slate-800">{summary.totalQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-semibold text-slate-500">MT</span></p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category Wise */}
            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
              <div className="bg-slate-50/80 px-3 py-1.5 border-b border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wider">Category (MT)</div>
              <ul className="divide-y divide-slate-50 max-h-32 overflow-y-auto custom-scrollbar">
                {Object.entries(summary.byCategory).map(([cat, qty]) => (
                  <li key={cat} className="px-3 py-1.5 flex justify-between items-center text-[13px] hover:bg-slate-50/50 transition-colors">
                    <span className="text-slate-600 truncate mr-2 font-medium" title={cat}>{cat}</span>
                    <span className="font-bold text-slate-700 whitespace-nowrap">{qty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Month Wise */}
            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
              <div className="bg-slate-50/80 px-3 py-1.5 border-b border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wider">Month (MT)</div>
              <ul className="divide-y divide-slate-50 max-h-32 overflow-y-auto custom-scrollbar">
                {Object.entries(summary.byMonth).sort((a,b) => b[0].localeCompare(a[0])).map(([month, qty]) => (
                  <li key={month} className="px-3 py-1.5 flex justify-between items-center text-[13px] hover:bg-slate-50/50 transition-colors">
                    <span className="text-slate-600 font-medium">{month}</span>
                    <span className="font-bold text-slate-700">{qty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          {prepareError && (
            <div className="p-2 bg-red-50 text-red-700 rounded-lg text-xs font-medium border border-red-100">
              {prepareError}
            </div>
          )}
          
          {preparedData && (
            <div className="p-3 bg-green-50 text-green-800 rounded-xl border border-green-200 shadow-sm animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-green-600" />
                <span className="font-bold text-sm">Data Prepared Successfully</span>
              </div>
              
              {preparedData.batches && preparedData.batches.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-medium opacity-90">Split into {preparedData.batches.length} batches to keep ZIP sizes under 25MB.</p>
                  <div className="max-h-24 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                    {preparedData.batches.map((b, i) => (
                      <div key={i} className="text-xs space-y-0.5 bg-white/60 p-2 rounded-lg border border-green-200/50">
                        <p className="font-bold text-green-800">Batch {i + 1} &bull; {b.sizeMb} MB &bull; {b.recordsCount} records</p>
                        <p className="break-all opacity-70"><strong>Excel:</strong> {b.excelPath}</p>
                        <p className="break-all opacity-70"><strong>ZIP:</strong> {b.zipPath}</p>
                      </div>
                    ))}
                  </div>
                  {preparedData.batches.length > 1 && (
                    <p className="text-[11px] text-green-700 mt-1.5 bg-green-100/50 px-2 py-1.5 rounded-lg border border-green-200/50 font-medium">
                      <AlertCircle size={12} className="inline mr-1 mb-0.5" />
                      Only Batch 1 will auto-upload. Upload remaining manually.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-xs space-y-1 opacity-80">
                  <p><strong>Excel:</strong> {preparedData.excelPath}</p>
                  <p><strong>ZIP:</strong> {preparedData.zipPath}</p>

                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t bg-slate-50/50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm"
          >
            Cancel
          </button>
          {!preparedData ? (
              <button
                type="button"
                onClick={handlePrepareData}
                disabled={isPreparing || !fromDate || !toDate}
                className="flex items-center gap-2 px-5 py-1.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] justify-center shadow-sm shadow-indigo-200"
              >
                {isPreparing ? (progressText || 'Preparing...') : 'Prepare Data'}
              </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-1.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm shadow-green-200"
            >
              <CheckCircle size={15} />
              Confirm & Upload
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
