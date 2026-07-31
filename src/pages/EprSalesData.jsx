import { useEffect, useState } from 'react';
import { Database, Download, Calendar, MapPin, Eye, Filter } from 'lucide-react';

export default function EprSalesData() {
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
      const data = await window.pwp.eprData.getSales();
      setRecords(data || []);
    } catch (e) {
      console.error("Failed to fetch EPR Sales Data:", e);
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

  const totalQuantity = filteredRecords.reduce((s, r) => s + (r.productionid_qty || 0), 0);
  const totalAmount = filteredRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">EPR Sales Data</h1>
          <p className="text-slate-500 text-sm">{filteredRecords.length} records scraped — Total Quantity: <span className="font-semibold text-teal-600">{totalQuantity.toFixed(2)} MT</span> | Amount: <span className="font-semibold text-teal-600">₹{new Intl.NumberFormat('en-IN').format(totalAmount)}</span></p>
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
          <p className="text-slate-500">No EPR sales records found.</p>
          <p className="text-slate-400 text-sm mt-1">Make sure you have run the scraper and synced to SQLite.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Sr. No.</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Registration Type</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Entity Type</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Name of the Entity</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Address</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">District</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Country/State</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Seller GST No</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Total Qty. of Pr...</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Amount(₹)</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Date of Sale</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">EPR Invoice No</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Potential Generation Status</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">e invoice no</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Product Sold</th>
                  <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-500 text-center">{i + 1}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-700">{r.registration_type_mapped || r.registertype || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-700">{r.entity_type_mapped || r.applicantsubtypeid || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-800" title={r.entityname}>{r.entityname ? r.entityname.replace(/^\d+-/, '') : 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600" title={r.entityaddress}>{r.entityaddress || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">
                      {r.entitydistrict === 357 ? 'Indore' : r.entitydistrict === 352 ? 'Dhar' : r.entitydistrict || 'N/A'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">
                      {r.entitystate === 23 ? 'Madhya Pradesh' : r.entitystate === 7 ? 'Delhi' : r.entitystate || 'N/A'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-xs">{r.sellergstno || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right font-semibold text-teal-700">
                      {r.productionid_qty?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.amount ? `₹${new Intl.NumberFormat('en-IN').format(r.amount)}` : '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 whitespace-nowrap">
                      {r.dateofsale ? new Date(r.dateofsale).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-xs text-blue-600">{r.eprinvno || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.totalpotentialgenerated ? parseFloat(r.totalpotentialgenerated).toFixed(4) : '0.00'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-xs text-slate-700">
                      {r.invoicenumber || 'N/A'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">
                      {r.productionid_categoryid ? `Cat-I${r.productionid_categoryid === 2 ? 'I' : ''}` : 'N/A'}
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
