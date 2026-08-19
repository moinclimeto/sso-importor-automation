import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { PLASTIC_CATEGORIES } from '../utils/excelImport.js';
import {
  formatPackagingConversionFactor,
  resolvePackagingHsn,
  resolvePackagingUom,
} from '../../shared/packagingMasterSync.js';

export default function PackagingMasterPage({ embedded = false }) {
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setPageHeader, clearPageHeader } = usePageHeader();
  const { showToast } = useToast();

  useEffect(() => {
    if (embedded) return undefined;
    setPageHeader({
      title: 'Packaging Master',
      icon: Package,
      description: 'Manage packaging rules, conversion factors, and material details'
    });
    return clearPageHeader;
  }, [embedded, setPageHeader, clearPageHeader]);

  const load = async () => {
    if (!window.pwp?.packagingMaster) { setLoading(false); return; }
    setLoading(true);
    try {
      const [data, comps] = await Promise.all([
        window.pwp.packagingMaster.getAll(),
        window.pwp.companies.getAll(),
      ]);
      setRecords(data || []);
      setCompanies(comps || []);
    } catch (e) {
      showToast('Error loading packaging data', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!window.pwp?.packagingMaster) return;
    
    const formData = new FormData(e.target);
    const form = Object.fromEntries(formData.entries());

    try {
      if (modal?.id) {
        await window.pwp.packagingMaster.update({ ...form, id: modal.id });
        showToast('Packaging record updated', 'success');
      } else {
        await window.pwp.packagingMaster.add(form);
        showToast('Packaging record added', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this packaging record?')) return;
    try {
      await window.pwp.packagingMaster.delete(id);
      showToast('Record deleted', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-500" />
          Packaging Items
        </h2>
        <button
          onClick={() => setModal({})}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Record
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Supplier / Party</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Match Key</th>
                <th className="px-4 py-3 font-medium">Material</th>
                <th className="px-4 py-3 font-medium">Conv. Factor</th>
                <th className="px-4 py-3 font-medium">HSN</th>
                <th className="px-4 py-3 font-medium">UOM</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="8" className="p-8 text-center text-slate-500">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-slate-500">No packaging records found.</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.supplier_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-[200px] group relative">
                    <div className="truncate cursor-pointer">{r.product_description}</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-max max-w-xs z-50 p-2 bg-slate-800 text-white text-xs rounded shadow-lg whitespace-normal pointer-events-none">
                      {r.product_description}
                      <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-800"></div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 max-w-[150px] group relative">
                    <div className="truncate cursor-pointer">{r.product_match_key}</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-max max-w-xs z-50 p-2 bg-slate-800 text-white text-xs rounded shadow-lg whitespace-normal pointer-events-none">
                      {r.product_match_key}
                      <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-800"></div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.plastic_category}
                    {r.plastic_material ? ` (${r.plastic_material})` : ''}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">{formatPackagingConversionFactor(r)}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{resolvePackagingHsn(r) || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{resolvePackagingUom(r) || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setModal(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{modal.id ? 'Edit Packaging Record' : 'New Packaging Record'}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-6">
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Company</label>
                    <select name="company_id" defaultValue={modal.company_id} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="">Select Company</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">List Type</label>
                    <select name="list_type" defaultValue={modal.list_type || 'sales'} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="sales">Sales</option>
                      <option value="purchase">Purchase</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Match Type</label>
                    <select name="match_type" defaultValue={modal.match_type || 'exact'} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="exact">Exact Match</option>
                      <option value="regex">Regex</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Product Description</label>
                    <input type="text" name="product_description" defaultValue={modal.product_description} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Product Match Key</label>
                    <input type="text" name="product_match_key" defaultValue={modal.product_match_key} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">HSN</label>
                    <input type="text" name="hsn" defaultValue={modal.hsn} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">UOM</label>
                    <input type="text" name="uom" defaultValue={modal.uom} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Supplier GST</label>
                    <input type="text" name="supplier_gst" defaultValue={modal.supplier_gst} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Supplier Name</label>
                    <input type="text" name="supplier_name" defaultValue={modal.supplier_name} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Plastic Category</label>
                    <select name="plastic_category" defaultValue={modal.plastic_category || ''} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="">Select Category</option>
                      {PLASTIC_CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Plastic Material</label>
                    <select name="plastic_material" defaultValue={modal.plastic_material || ''} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="">Select Plastic Material</option>
                      <option value="PET">PET</option>
                      <option value="HDPE">HDPE</option>
                      <option value="PVC">PVC</option>
                      <option value="LDPE">LDPE</option>
                      <option value="PP">PP</option>
                      <option value="PS">PS</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Recycled %</label>
                    <input type="text" name="recycled_percent" defaultValue={modal.recycled_percent} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Conv. Factor</label>
                    <input type="number" step="any" name="conversion_factor" defaultValue={modal.conversion_factor} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">CF Base Source</label>
                    <input type="text" name="cf_base_source" defaultValue={modal.cf_base_source} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">CF Date From</label>
                    <input type="date" name="cf_date_from" defaultValue={modal.cf_date_from} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">CF Date To</label>
                    <input type="date" name="cf_date_to" defaultValue={modal.cf_date_to} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                </div>

              </div>
              
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors">
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
