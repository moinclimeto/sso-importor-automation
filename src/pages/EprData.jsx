import { useEffect, useState } from 'react';
import { Database, Download, Calendar, MapPin } from 'lucide-react';

export default function EprData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!window.pwp || !window.pwp.eprData) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const data = await window.pwp.eprData.getProcurement();
      setRecords(data || []);
    } catch (e) {
      console.error("Failed to fetch EPR Data:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalQuantity = records.reduce((s, r) => s + (r.qty_plastic_waste_mt || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">EPR Procurement Data</h1>
          <p className="text-slate-500 text-sm">{records.length} records scraped — Total Quantity: <span className="font-semibold text-blue-600">{totalQuantity.toFixed(2)} MT</span></p>
        </div>
        <button onClick={loadData} className="btn-secondary h-9 px-4 text-sm flex items-center gap-2">
          <Database size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center shadow-sm border border-slate-100">
          <Database size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No EPR procurement records found.</p>
          <p className="text-slate-400 text-sm mt-1">Make sure you have run the scraper and synced to SQLite.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="th">Source Year</th>
                  <th className="th">Procurement Date</th>
                  <th className="th">Supplier Name</th>
                  <th className="th">Supplier City/State</th>
                  <th className="th">Category</th>
                  <th className="th">Applicant Sub Type</th>
                  <th className="th text-right">Qty (MT)</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="td text-slate-500">
                      <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md text-xs font-medium border border-blue-100">
                        {r.source_year}
                      </span>
                    </td>
                    <td className="td text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-400" />
                        {new Date(r.procurement_date).toLocaleDateString('en-IN')}
                      </div>
                    </td>
                    <td className="td font-medium text-slate-800">{r.supplier_name}</td>
                    <td className="td text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-slate-400" />
                        {r.supplier_city || 'N/A'}, {r.supplier_state || 'N/A'}
                      </div>
                    </td>
                    <td className="td">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-medium">
                        {r.category_name || 'N/A'}
                      </span>
                    </td>
                    <td className="td text-slate-500">{r.applicant_sub_type || 'N/A'}</td>
                    <td className="td text-right font-semibold text-blue-600">
                      {r.qty_plastic_waste_mt?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
