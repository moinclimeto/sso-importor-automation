import { useEffect, useState } from 'react';
import { Database, Eye, Filter } from 'lucide-react';

export default function EprProductionData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('');

  const loadData = async () => {
    if (!window.pwp || !window.pwp.eprData || !window.pwp.eprData.getProduction) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const data = await window.pwp.eprData.getProduction();
      setRecords(data || []);
    } catch (e) {
      console.error("Failed to fetch EPR Production Data:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredRecords = records.filter(r => {
    if (!selectedYear) return true;
    return String(r.year) === selectedYear;
  });

  const totalQuantity = filteredRecords.reduce((s, r) => s + (Number(r.qty_of_clinker_produced__mt_) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">EPR Production Data</h1>
          <p className="text-slate-500 text-sm">{filteredRecords.length} records scraped — Total Product Qty: <span className="font-semibold text-teal-600">{totalQuantity.toFixed(2)} MT</span></p>
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
          <p className="text-slate-500">No EPR production records found.</p>
          <p className="text-slate-400 text-sm mt-1">Make sure you have run the scraper and synced to SQLite.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Sr. No.</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">From Date</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">To Date</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">QTY of Clinker Produced (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qualifying Feed (MT) / Solid Waste Burnt (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat I (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat II (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat III (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat IV (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Energy contibution by alternative fuel (MSW/RDF)</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Date of Entry</th>
                  <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-500 text-center">{r.sr__no_ || (i + 1)}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.from_date || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.to_date || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right font-semibold text-teal-700">
                      {r.qty_of_clinker_produced__mt_ || '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.qualifying_feed__mt_____solid_waste_burnt__mt_ || '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.qty_of_pw_processed_for_cat_i__mt_ || '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.qty_of_pw_processed_for_cat_ii__mt_ || '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.qty_of_pw_processed_for_cat_iii__mt_ || '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.qty_of_pw_processed_for_cat_iv__mt_ || '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                      {r.energy_contibution_by_alternative_fuel__msw_rdf_ || '0'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 whitespace-nowrap">
                      {r.date_of_entry || 'N/A'}
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
