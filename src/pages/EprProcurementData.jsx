import { useEffect, useState } from 'react';
import { Database, Download, Calendar, MapPin, Eye, Filter } from 'lucide-react';

export default function EprProcurementData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('');

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
      console.error("Failed to fetch EPR Procurement Data:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredRecords = records.filter(r => {
    if (!selectedYear) return true;
    return String(r.source_year) === selectedYear || String(r.year) === selectedYear;
  });

  const totalQuantity = filteredRecords.reduce((s, r) => s + (Number(r.qty_plastic_waste_mt) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">EPR Procurement Data</h1>
          <p className="text-slate-500 text-sm">{filteredRecords.length} records scraped — Total Quantity: <span className="font-semibold text-teal-600">{totalQuantity.toFixed(2)} MT</span></p>
        </div>
        <button onClick={loadData} className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 rounded text-sm flex items-center gap-2">
          <Database size={16} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3 items-end">
        <div className="flex items-center gap-2 text-slate-500 mr-2 mb-1">
          <Filter size={16} />
          <span className="text-sm font-medium">Filter by Year:</span>
        </div>
        <div>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)} 
            className="h-9 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 min-w-[120px]"
          >
            <option value="">All Years</option>
            <option value="2026">2026-27</option>
            <option value="2025">2025-26</option>
            <option value="2024">2024-25</option>
            <option value="2023">2023-24</option>
            <option value="2022">2022-23</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
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
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Sr. No.</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Supplier Name</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Address Line 1</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Address Line 2</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">City</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">State</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Pincode</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Supplier GST Number</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Invoice Number/GST E-Invoice No.</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty. of Feed (MT)</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Procurement Date</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Date of Entry</th>
                  <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-500 text-center">{i + 1}</td>
                    <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-800" title={r.supplier_name}>{r.supplier_name || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 truncate max-w-xs" title={r.supplier_addr_1}>{r.supplier_addr_1 || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 truncate max-w-xs" title={r.supplier_addr_2}>{r.supplier_addr_2 || ''}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.supplier_city || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.supplier_state || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.supplier_pin_code || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-xs">{r.supplier_gst_no || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-xs text-slate-700">{r.invoice_no || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right font-semibold text-teal-700">
                      {r.qty_plastic_waste_mt?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 whitespace-nowrap">
                      {r.procurement_date ? new Date(r.procurement_date).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 whitespace-nowrap">
                      {r.created_on ? new Date(r.created_on).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button className="text-teal-600 hover:text-teal-800 p-1 bg-teal-50 rounded-full transition-colors">
                        <Eye size={16} />
                      </button>
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
