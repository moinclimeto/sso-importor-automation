import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, Eye, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

export default function EprProductionData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedYear]);

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

  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('refresh-epr-data', handleRefresh);
    return () => window.removeEventListener('refresh-epr-data', handleRefresh);
  }, []);

  const filteredRecords = records.filter(r => {
    if (!selectedYear) return true;
    
    let dateYear = null;
    if (r.from_date) {
      const d = new Date(r.from_date);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        dateYear = m < 4 ? String(y - 1) : String(y);
      }
    }
    
    const fileSourceYear = r.file_source ? r.file_source.match(/\\d{4}/)?.[0] : null;

    return String(r.source_year) === selectedYear || 
           String(r.year) === selectedYear || 
           fileSourceYear === selectedYear ||
           dateYear === selectedYear;
  });

  const totalQuantity = filteredRecords.reduce((s, r) => s + (Number(r.qty_of_clinker_produced__mt_) || 0), 0);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const currentRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [portalNode, setPortalNode] = useState(null);

  useEffect(() => {
    setPortalNode(document.getElementById('header-actions-portal'));
  }, []);

  const filterContent = (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Filter size={16} className="text-slate-400" />
        <select 
          value={selectedYear} 
          onChange={(e) => setSelectedYear(e.target.value)} 
          className="h-9 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 min-w-[120px] bg-white text-slate-700"
        >
          <option value="">All Years</option>
          <option value="2026">2026-27</option>
          <option value="2025">2025-26</option>
          <option value="2024">2024-25</option>
          <option value="2023">2023-24</option>
          <option value="2022">2022-23</option>
          <option value="2021">2021-22</option>
        </select>
      </div>
      <p className="text-slate-500 text-sm border-l border-slate-200 pl-4">{filteredRecords.length} records — Qty: <span className="font-semibold text-teal-600">{totalQuantity.toFixed(2)} MT</span></p>
    </div>
  );

  return (
    <div className="space-y-4">
      {portalNode && createPortal(filterContent, portalNode)}


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
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((r, i) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + i + 1;
                  return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-500 text-center">{r.sr__no_ || globalIndex}</td>
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
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <div className="text-sm text-slate-500">
                Showing <span className="font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-slate-700">{Math.min(currentPage * itemsPerPage, filteredRecords.length)}</span> of <span className="font-medium text-slate-700">{filteredRecords.length}</span> results
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-sm text-slate-600 font-medium px-2">Page {currentPage} of {totalPages}</span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
