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
                <tr className="bg-slate-50 border-b border-slate-100 whitespace-nowrap">
                  <th className="th">Sr. No.</th>
                  <th className="th">Supplier Name</th>
                  <th className="th">Address Line 1</th>
                  <th className="th">Address Line 2</th>
                  <th className="th">City</th>
                  <th className="th">State</th>
                  <th className="th">Pincode</th>
                  <th className="th">Supplier GST Number</th>
                  <th className="th">Invoice Number/GST E-Invoice No.</th>
                  <th className="th text-right">Qty. of Feed (MT)</th>
                  <th className="th">Procurement Date</th>
                  <th className="th">Date of Entry</th>
                  <th className="th">Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors whitespace-nowrap">
                    <td className="td text-slate-500 font-medium">{i + 1}</td>
                    <td className="td font-medium text-slate-800">{r.supplier_name || 'N/A'}</td>
                    <td className="td text-slate-600">{r.supplier_addr_1 || 'N/A'}</td>
                    <td className="td text-slate-600">{r.supplier_addr_2 || ''}</td>
                    <td className="td text-slate-600">{r.supplier_city || 'N/A'}</td>
                    <td className="td text-slate-600">{r.supplier_state || 'N/A'}</td>
                    <td className="td text-slate-600">{r.supplier_pin_code || 'N/A'}</td>
                    <td className="td text-slate-600">{r.supplier_gst_no || 'N/A'}</td>
                    <td className="td text-slate-600">{r.invoice_no || 'N/A'}</td>
                    <td className="td text-right font-semibold text-blue-600">
                      {r.qty_plastic_waste_mt?.toFixed(2) || '0.00'}
                    </td>
                    <td className="td text-slate-600">
                      {r.procurement_date ? new Date(r.procurement_date).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="td text-slate-600">
                      {r.created_on ? new Date(r.created_on).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="td text-slate-600"></td>
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
