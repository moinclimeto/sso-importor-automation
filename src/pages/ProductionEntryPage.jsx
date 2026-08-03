import React, { useState, useEffect } from 'react';
import { Upload, Plus, FileSpreadsheet, Trash2, Filter, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useToast, Toast } from '../components/Toast.jsx';

export default function ProductionEntryPage() {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();
  
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Modals
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  
  // Single Entry Form State
  const [formData, setFormData] = useState({
    from_date: '', to_date: '', clinker_production: '', energy_percentage: '',
    energy_contribution_mj: '', qualifying_feed_mt: '', cat_i: '', cat_ii: '', cat_iii: '', cat_iv: ''
  });
  
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
      
      const res = await window.pwp.localProduction.add(dataToSave);
      if (res && res.id) {
        showToast('Production entry saved successfully!', 'success');
        setFormData({
          from_date: '', to_date: '', clinker_production: '', energy_percentage: '',
          energy_contribution_mj: '', qualifying_feed_mt: '', cat_i: '', cat_ii: '', cat_iii: '', cat_iv: ''
        });
        setShowSingleModal(false);
        loadRecords();
      }
    } catch (err) {
      showToast('Error saving entry: ' + err.message, 'error');
    }
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
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const mapped = data.map(row => ({
          from_date: row['From Date'] || '',
          to_date: row['To Date'] || '',
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

  return (
    <div className="space-y-5">
      <Toast toast={toast} onClose={hideToast} />
      
      {/* Page Action Buttons */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSingleModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Single Entry
          </button>
          <button onClick={() => setShowBulkModal(true)} className="btn-secondary flex items-center gap-2">
            <Upload size={18} /> Bulk Entry
          </button>
        </div>
      </div>

      {/* Filters Area */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter size={16} />
          <span className="text-sm font-medium">Filter:</span>
        </div>
        
        <div>
          <label className="label">Date Range</label>
          <select 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value)}
            className="input w-40"
          >
            <option value="all">All Time</option>
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        
        {dateFilter === 'custom' && (
          <div className="flex gap-3">
            <div>
              <label className="label">From</label>
              <input type="date" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} className="input w-40" />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} className="input w-40" />
            </div>
          </div>
        )}
        
        <div className="ml-auto flex items-center gap-6 text-sm">
           <div className="flex flex-col text-right">
             <span className="text-slate-500 text-xs">Total Clinker (MT)</span>
             <span className="font-bold text-blue-700">{totals.clinker.toFixed(2)}</span>
           </div>
           <div className="flex flex-col text-right">
             <span className="text-slate-500 text-xs">Total Qualifying Feed (MT)</span>
             <span className="font-bold text-blue-700">{totals.qualifying.toFixed(2)}</span>
           </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="th">Sr. No.</th>
                <th className="th">From Date</th>
                <th className="th">To Date</th>
                <th className="th text-right">Clinker (MT)</th>
                <th className="th text-right">Energy %</th>
                <th className="th text-right">Qualifying Feed (MT)</th>
                <th className="th text-center">Actions</th>
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
                  <td colSpan="7" className="px-4 py-16 text-center text-slate-500">
                    <FileSpreadsheet size={32} className="mx-auto text-slate-300 mb-3" />
                    No records found.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="td text-slate-400">{i + 1}</td>
                    <td className="td font-medium">{r.from_date}</td>
                    <td className="td font-medium">{r.to_date}</td>
                    <td className="td text-right">{r.clinker_production}</td>
                    <td className="td text-right">{r.energy_percentage}</td>
                    <td className="td text-right">{r.qualifying_feed_mt}</td>
                    <td className="td text-center flex items-center justify-center">
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SINGLE ENTRY MODAL */}
      {showSingleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-lg text-slate-800">Add Production Entry</h2>
              <button onClick={() => setShowSingleModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSingleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">From Date *</label>
                  <input type="date" name="from_date" required value={formData.from_date} onChange={handleInputChange} className="input" />
                </div>
                <div>
                  <label className="label">To Date *</label>
                  <input type="date" name="to_date" required value={formData.to_date} onChange={handleInputChange} className="input" />
                </div>
                
                <div>
                  <label className="label">Clinker production (MT) *</label>
                  <input type="number" step="any" name="clinker_production" required value={formData.clinker_production} onChange={handleInputChange} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Energy contribution % (MSW/RDF) *</label>
                  <input type="number" step="any" name="energy_percentage" required value={formData.energy_percentage} onChange={handleInputChange} className="input" placeholder="0" />
                </div>

                <div>
                  <label className="label">Energy Contribution from Feed (MJ)</label>
                  <input type="number" step="any" name="energy_contribution_mj" value={formData.energy_contribution_mj} onChange={handleInputChange} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Qualifying Feed (MT)</label>
                  <input type="number" step="any" name="qualifying_feed_mt" value={formData.qualifying_feed_mt} onChange={handleInputChange} className="input" placeholder="0" />
                </div>

                <div>
                  <label className="label">Qty processed Cat I (MT)</label>
                  <input type="number" step="any" name="cat_i" value={formData.cat_i} onChange={handleInputChange} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Qty processed Cat II (MT)</label>
                  <input type="number" step="any" name="cat_ii" value={formData.cat_ii} onChange={handleInputChange} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Qty processed Cat III (MT)</label>
                  <input type="number" step="any" name="cat_iii" value={formData.cat_iii} onChange={handleInputChange} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Qty processed Cat IV (MT)</label>
                  <input type="number" step="any" name="cat_iv" value={formData.cat_iv} onChange={handleInputChange} className="input" placeholder="0" />
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
                <button type="button" onClick={() => setShowSingleModal(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" className="flex-1 btn-primary">Save Entry</button>
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
                <a href="c:/Users/PC/Climeto/PWP-Cement-Automation/cement-co-processing-production-bulk-entry-template.xlsx" download className="text-blue-600 hover:underline text-sm flex items-center gap-1 font-medium">
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
                          <th className="px-4 py-2">From Date</th>
                          <th className="px-4 py-2">To Date</th>
                          <th className="px-4 py-2 text-right">Clinker (MT)</th>
                          <th className="px-4 py-2 text-right">Energy %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkPreview.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2">{r.from_date}</td>
                            <td className="px-4 py-2">{r.to_date}</td>
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
            
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => {setShowBulkModal(false); setBulkPreview([]); setBulkFile(null);}} className="btn-secondary">Cancel</button>
              <button onClick={submitBulk} disabled={!bulkPreview.length} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                Import Records
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
