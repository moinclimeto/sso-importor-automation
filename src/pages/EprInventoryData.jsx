import { useEffect, useState } from 'react';
import { Database, Eye, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';

export default function EprInventoryData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      let data = [];
      let debugMsg = "";
      if (window.pwp && window.pwp.scraper && window.pwp.scraper.getInventory) {
        data = await window.pwp.scraper.getInventory();
        debugMsg = "Tried getInventory. Result length: " + (data ? data.length : 'null');
      } else if (window.pwp && window.pwp.fs && window.pwp.fs.readFileBase64) {
        const filePath = 'C:/Users/itcli/Documents/GitHub/PWP-Cement-Automation/data/inventory.json';
        const fileContent = await window.pwp.fs.readFileBase64(filePath);
        if (fileContent) {
           const binaryString = atob(fileContent);
           const bytes = new Uint8Array(binaryString.length);
           for (let i = 0; i < binaryString.length; i++) {
               bytes[i] = binaryString.charCodeAt(i);
           }
           const text = new TextDecoder('utf-8').decode(bytes);
           data = JSON.parse(text);
           debugMsg = "Tried readFileBase64. Success, parsed " + (data ? data.length : 0) + " items.";
        } else {
           debugMsg = "Tried readFileBase64 but it returned null for path: " + filePath;
        }
      }
      
      if (!data || data.length === 0) {
        console.warn("Debug Info: " + debugMsg);
      }
      
      setRecords(data || []);
    } catch (e) {
      console.error("Failed to fetch EPR Inventory Data:", e);
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
    return true; // Inventory data typically has its own date filter logic, simplified here for now
  });

  const totalQuantity = filteredRecords.reduce((s, r) => s + (Number(r['Available Quantity (MT)']) || 0), 0);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const currentRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const { setPageHeader, clearPageHeader } = usePageHeader();

  useEffect(() => {
    const id = setPageHeader({
      title: 'EPR Inventory Data',
      subtitle: 'Data synced from CPCB portal',
      actions: (
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
          <p className="text-slate-500 text-sm border-l border-slate-200 pl-4">{filteredRecords.length} records — Available: <span className="font-semibold text-teal-600">{totalQuantity.toFixed(2)} MT</span></p>
        </div>
      )
    });
    return () => clearPageHeader(id);
  }, [selectedYear, filteredRecords.length, totalQuantity, setPageHeader, clearPageHeader]);

  return (
    <div className="space-y-4">

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center shadow-sm border border-slate-100">
          <Database size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No EPR inventory records found.</p>
          <p className="text-slate-400 text-sm mt-1">Make sure you have run the scraper and synced to SQLite.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">S.N</th>
                  <th className="px-4 py-3 text-left font-medium border-r border-teal-600 whitespace-nowrap">Production Date</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qualifying Feed(MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat I (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat II (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat III (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Qty of PW processed for Cat IV (MT)</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Production ID</th>
                  <th className="px-4 py-3 text-right font-medium border-r border-teal-600 whitespace-nowrap">Available Quantity (MT)</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((r, i) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + i + 1;
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 border-r border-slate-100 text-slate-500 text-center">{r['s_n'] || r['S.N'] || globalIndex}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r['production_date'] || r['Production Date'] || 'N/A'}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                        {r['qualifying_feed_mt_'] || r['Qualifying Feed(MT)'] || '0'}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                        {r['qty_of_pw_processed_for_cat_i__mt_'] || r['Qty of PW processed for Cat I (MT)'] || '0'}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                        {r['qty_of_pw_processed_for_cat_ii__mt_'] || r['Qty of PW processed for Cat II (MT)'] || '0'}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                        {r['qty_of_pw_processed_for_cat_iii__mt_'] || r['Qty of PW processed for Cat III (MT)'] || '0'}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                        {r['qty_of_pw_processed_for_cat_iv__mt_'] || r['Qty of PW processed for Cat IV (MT)'] || '0'}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100 text-right text-slate-700">
                        {r['production_id'] || r['Production ID'] || 'N/A'}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-100 text-right font-semibold text-teal-700">
                        {r['available_quantity_mt_'] || r['Available Quantity (MT)'] || '0'}
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
