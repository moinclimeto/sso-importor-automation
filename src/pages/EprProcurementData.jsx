import { useEffect, useState } from 'react';
import { Database, Filter, ChevronLeft, ChevronRight, Download, Calendar, MapPin, Building2, User, Phone, CheckCircle2, Clock } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';

export default function EprProcurementData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedYear]);

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
    
    let dateYear = null;
    if (r.procurement_date) {
      const d = new Date(r.procurement_date);
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

  const totalQuantity = filteredRecords.reduce((s, r) => s + (Number(r.qty_plastic_waste_mt) || 0), 0);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const currentRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('refresh-epr-data', handleRefresh);
    return () => window.removeEventListener('refresh-epr-data', handleRefresh);
  }, []);

  const { setPageHeader, clearPageHeader } = usePageHeader();

  useEffect(() => {
    const id = setPageHeader({
      title: 'EPR Procurement Data',
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
          <p className="text-slate-500 text-sm border-l border-slate-200 pl-4">{filteredRecords.length} records — Qty: <span className="font-semibold text-teal-600">{totalQuantity.toFixed(2)} MT</span></p>
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
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((r, i) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + i + 1;
                  return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-500 text-center">{globalIndex}</td>
                    <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-800" title={r.supplier_name}>{r.supplier_name || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 truncate max-w-xs" title={r.supplier_addr_1}>{r.supplier_addr_1 || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 truncate max-w-xs" title={r.supplier_addr_2}>{r.supplier_addr_2 || ''}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.supplier_city || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.supplier_state || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600">{r.supplier_pin_code || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-xs">{r.supplier_gst_no || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-xs text-slate-700">{r.invoice_no || 'N/A'}</td>
                    <td className="px-4 py-3 border-r border-slate-100 text-right font-semibold text-teal-700">
                      {Number(r.qty_plastic_waste_mt || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 whitespace-nowrap">
                      {r.procurement_date ? new Date(r.procurement_date).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 text-slate-600 whitespace-nowrap">
                      {r.created_on ? new Date(r.created_on).toLocaleDateString('en-IN') : 'N/A'}
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
