import React, { useState, useEffect } from 'react';
import { Upload, Plus, FileSpreadsheet, Trash2, Filter, X, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useToast, Toast } from '../components/Toast.jsx';
import { usePageHeader } from '../context/PageHeaderContext.jsx';

const emptyForm = {
  from_date: '', to_date: '', clinker_production: '', energy_percentage: '',
  energy_contribution_mj: '', qualifying_feed_mt: '', cat_i: '', cat_ii: '', cat_iii: '', cat_iv: ''
};

export default function ProductionEntryPage() {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();
  const { setPageHeader, clearPageHeader } = usePageHeader();
  
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Modals
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Single Entry Form State
  const [formData, setFormData] = useState({ ...emptyForm });
  
  // Bulk Entry State
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState([]);
  
  // Table Filters
  const [dateFilter, setDateFilter] = useState('all');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await window.pwp.localProduction.getAll();
      setRecords(data || []);
    } catch (err) {
      showToast('Failed to load records', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    try {
      const dataToSave = {
        from_date: formData.from_date,
        to_date: formData.to_date,
        clinker_production: parseFloat(formData.clinker_production) || 0,
        energy_percentage: parseFloat(formData.energy_percentage) || 0,
        energy_contribution_mj: parseFloat(formData.energy_contribution_mj) || 0,
        qualifying_feed_mt: parseFloat(formData.qualifying_feed_mt) || 0,
        cat_i: parseFloat(formData.cat_i) || 0,
        cat_ii: parseFloat(formData.cat_ii) || 0,
        cat_iii: parseFloat(formData.cat_iii) || 0,
        cat_iv: parseFloat(formData.cat_iv) || 0,
      };
      
      if (editingId) {
        // Update existing record
        const res = await window.pwp.localProduction.update({ id: editingId, ...dataToSave });
        if (res && res.success) {
          showToast('Production entry updated successfully!', 'success');
          setFormData({ ...emptyForm });
          setEditingId(null);
          setShowSingleModal(false);
          loadRecords();
        }
      } else {
        // Add new record
        const res = await window.pwp.localProduction.add(dataToSave);
        if (res && res.id) {
          showToast('Production entry saved successfully!', 'success');
          setFormData({ ...emptyForm });
          setShowSingleModal(false);
          loadRecords();
        }
      }
    } catch (err) {
      showToast('Error saving entry: ' + err.message, 'error');
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setFormData({
      from_date: record.from_date || '',
      to_date: record.to_date || '',
      clinker_production: record.clinker_production?.toString() || '',
      energy_percentage: record.energy_percentage?.toString() || '',
      energy_contribution_mj: record.energy_contribution_mj?.toString() || '',
      qualifying_feed_mt: record.qualifying_feed_mt?.toString() || '',
      cat_i: record.cat_i?.toString() || '',
      cat_ii: record.cat_ii?.toString() || '',
      cat_iii: record.cat_iii?.toString() || '',
      cat_iv: record.cat_iv?.toString() || '',
    });
    setShowSingleModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await window.pwp.localProduction.delete(id);
      showToast('Record deleted.', 'success');
      loadRecords();
    } catch (err) {
      showToast('Error deleting record', 'error');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const formatExcelDate = (val) => {
          if (!val) return '';
          if (val instanceof Date) {
            const y = val.getFullYear();
            const m = String(val.getMonth() + 1).padStart(2, '0');
            const d = String(val.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
          }
          if (typeof val === 'number') {
            const d = new Date((val - 25569) * 86400 * 1000);
            const y = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            return `${y}-${mo}-${da}`;
          }
          return val.toString();
        };

        const mapped = data.map(row => ({
          from_date: formatExcelDate(row['From Date']),
          to_date: formatExcelDate(row['To Date']),
          clinker_production: parseFloat(row['Clinker production (T)']) || 0,
          energy_percentage: parseFloat(row['Percentage of energy contribution by Alternate fuel (MSW/RDF)']) || 0,
          energy_contribution_mj: 0,
          qualifying_feed_mt: 0,
          cat_i: 0, cat_ii: 0, cat_iii: 0, cat_iv: 0
        }));
        
        setBulkPreview(mapped);
      } catch (err) {
        showToast('Error parsing Excel file. Please use the provided template.', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const displayDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  };

  const displayMonthName = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'long' });
  };

  const displayYear = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear().toString();
  };

  const submitBulk = async () => {
    if (!bulkPreview.length) return;
    try {
      const res = await window.pwp.localProduction.bulkAdd(bulkPreview);
      if (res.success) {
        showToast(`Successfully imported ${res.count} records!`, 'success');
        setBulkFile(null);
        setBulkPreview([]);
        setShowBulkModal(false);
        loadRecords();
      } else {
        showToast('Bulk import failed: ' + res.error, 'error');
      }
    } catch (err) {
      showToast('Bulk import failed', 'error');
    }
  };
  
  const getFilteredRecords = () => {
    if (dateFilter === 'all') return records;
    
    const now = new Date();
    return records.filter(r => {
      if (!r.from_date) return false;
      const d = new Date(r.from_date);
      
      if (dateFilter === 'day') {
        return d.toDateString() === now.toDateString();
      } else if (dateFilter === 'week') {
        const diff = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
        const weekStart = new Date(now.setDate(diff));
        return d >= weekStart;
      } else if (dateFilter === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      } else if (dateFilter === 'custom') {
        const start = customRange.start ? new Date(customRange.start) : new Date(0);
        const end = customRange.end ? new Date(customRange.end) : new Date();
        end.setHours(23, 59, 59, 999);
        return d >= start && d <= end;
      }
      return true;
    });
  };

  const filteredRecords = getFilteredRecords();
  
  const totals = filteredRecords.reduce((acc, r) => {
    acc.clinker += (r.clinker_production || 0);
    acc.qualifying += (r.qualifying_feed_mt || 0);
    return acc;
  }, { clinker: 0, qualifying: 0 });

  // Expose header actions to the global MainLayout Header
  useEffect(() => {
    const id = setPageHeader({
      title: 'Production Data',
      subtitle: `${filteredRecords.length} records found`,
      onBack: () => navigate(-1),
      actions: (
        <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
          {/* Date Filters */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Filter size={16} className="text-slate-400" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent border-none text-sm font-medium text-slate-700 focus:outline-none focus:ring-0 cursor-pointer outline-none"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-2 py-1 rounded-lg">
              <input type="date" value={customRange.start} max={customRange.end || undefined} onChange={(e) => setCustomRange({...customRange, start: e.target.value})} className="text-sm border-none focus:ring-0 cursor-pointer w-28 bg-transparent" />
              <span className="text-slate-400">to</span>
              <input type="date" value={customRange.end} min={customRange.start || undefined} onChange={(e) => setCustomRange({...customRange, end: e.target.value})} className="text-sm border-none focus:ring-0 cursor-pointer w-28 bg-transparent" />
            </div>
          )}
          
          {/* Totals Highlight in Header */}
          <div className="flex items-center bg-[#f0f4ff] border border-[#e2e8f0] px-4 py-1.5 rounded-lg ml-2 shadow-sm">
             <div className="flex flex-col pr-4">
               <span className="text-[10px] uppercase font-bold text-[#7c3aed]">Total Clinker</span>
               <span className="font-bold text-[#4f46e5] text-[15px] leading-tight">{totals.clinker.toFixed(2)} MT</span>
             </div>
             <div className="w-px h-8 bg-[#cbd5e1] mx-1"></div>
             <div className="flex flex-col pl-4">
               <span className="text-[10px] uppercase font-bold text-[#7c3aed]">Qualifying Feed</span>
               <span className="font-bold text-[#4f46e5] text-[15px] leading-tight">{totals.qualifying.toFixed(2)} MT</span>
             </div>
          </div>
          
          <button onClick={() => { setEditingId(null); setFormData({ ...emptyForm }); setShowSingleModal(true); }} className="bg-[#10b981] hover:bg-[#059669] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors">
            <Plus size={16} /> Single
          </button>
          <button onClick={() => setShowBulkModal(true)} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors">
            <Upload size={16} /> Bulk
          </button>
        </div>
      )
    });

    return () => clearPageHeader(id);
  }, [dateFilter, customRange, totals.clinker, totals.qualifying, filteredRecords.length, setPageHeader, clearPageHeader, navigate]);

  return (
    <div className="space-y-5">
      <Toast toast={toast} onClose={hideToast} />

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="th py-3 px-4 text-left font-semibold text-slate-600">Sr. No.</th>
                <th className="th py-3 px-4 text-left font-semibold text-slate-600">Year</th>
                <th className="th py-3 px-4 text-left font-semibold text-slate-600">Month</th>
                <th className="th py-3 px-4 text-right font-semibold text-slate-600">Clinker (MT)</th>
                <th className="th py-3 px-4 text-right font-semibold text-slate-600">Energy %</th>
                <th className="th py-3 px-4 text-right font-semibold text-slate-600">Qualifying Feed (MT)</th>
                <th className="th py-3 px-4 text-center font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    <div className="flex justify-center py-4">
                      <div className="w-6 h-6 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-16 text-center text-slate-500 bg-slate-50/50">
                    <FileSpreadsheet size={32} className="mx-auto text-slate-300 mb-3" />
                    No records found for the selected dates.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="td py-3 px-4 text-slate-500">{i + 1}</td>
                    <td className="td py-3 px-4 text-slate-500 text-xs">{displayYear(r.to_date)}</td>
                    <td className="td py-3 px-4 font-medium text-slate-700">{displayMonthName(r.to_date)}</td>
                    <td className="td py-3 px-4 text-right text-slate-600">{r.clinker_production}</td>
                    <td className="td py-3 px-4 text-right text-slate-600">{r.energy_percentage}</td>
                    <td className="td py-3 px-4 text-right text-slate-600">{r.qualifying_feed_mt}</td>
                    <td className="td py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleEdit(r)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Edit">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SINGLE ENTRY / EDIT MODAL */}
      {showSingleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-lg text-slate-800">{editingId ? 'Edit Production Entry' : 'Add Production Entry'}</h2>
              <button onClick={() => { setShowSingleModal(false); setEditingId(null); setFormData({ ...emptyForm }); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSingleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">From Date *</label>
                  <input type="date" name="from_date" required max={formData.to_date || undefined} value={formData.from_date} onChange={handleInputChange} className="input" />
                </div>
                <div>
                  <label className="label">To Date *</label>
                  <input type="date" name="to_date" required min={formData.from_date || undefined} value={formData.to_date} onChange={handleInputChange} className="input" />
                </div>
                
                <div>
                  <label className="label">Clinker production (MT) *</label>
                  <input type="number" step="any" name="clinker_production" required value={formData.clinker_production} onChange={handleInputChange} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Energy contribution % (MSW/RDF) *</label>
                  <input type="number" step="any" name="energy_percentage" required value={formData.energy_percentage} onChange={handleInputChange} className="input" placeholder="0" />
                </div>

              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
                <button type="button" onClick={() => { setShowSingleModal(false); setEditingId(null); setFormData({ ...emptyForm }); }} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" className="flex-1 btn-primary">{editingId ? 'Update Entry' : 'Save Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK ENTRY MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-lg text-slate-800">Bulk Production Entry</h2>
              <button onClick={() => {setShowBulkModal(false); setBulkPreview([]); setBulkFile(null);}} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Upload your completed Excel template.</p>
                <a href="/cement-co-processing-production-bulk-entry-template.xlsx" download className="text-blue-600 hover:underline text-sm flex items-center gap-1 font-medium">
                  <FileSpreadsheet size={16} /> Download Template
                </a>
              </div>
              
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
                <Upload className="mx-auto text-slate-400 mb-3" size={32} />
                <p className="text-sm text-slate-600 mb-4">Select Excel sheet to upload</p>
                <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" id="excel-upload" />
                <label htmlFor="excel-upload" className="cursor-pointer bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors inline-block">
                  Choose File
                </label>
                {bulkFile && <p className="mt-3 text-xs text-blue-600 font-medium">{bulkFile.name}</p>}
              </div>

              {bulkPreview.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">Preview ({bulkPreview.length} records)</span>
                  </div>
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0">
                        <tr>
                          <th className="px-4 py-2">Month</th>
                          <th className="px-4 py-2 text-right">Clinker (MT)</th>
                          <th className="px-4 py-2 text-right">Energy %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkPreview.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2">{displayMonthName(r.to_date)}</td>
                            <td className="px-4 py-2 text-right">{r.clinker_production}</td>
                            <td className="px-4 py-2 text-right">{r.energy_percentage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => {setShowBulkModal(false); setBulkPreview([]); setBulkFile(null);}} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">Cancel</button>
              <button onClick={submitBulk} disabled={!bulkPreview.length} className="bg-[#10b981] hover:bg-[#059669] text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Import Records
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
