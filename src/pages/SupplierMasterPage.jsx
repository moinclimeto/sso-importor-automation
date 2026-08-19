import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useToast } from '../components/Toast.jsx';

export default function SupplierMasterPage({ embedded = false }) {
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setPageHeader, clearPageHeader } = usePageHeader();
  const { showToast } = useToast();

  useEffect(() => {
    if (embedded) return undefined;
    setPageHeader({
      title: 'Supplier Master',
      icon: Users,
      description: 'Manage supplier profiles and registrations'
    });
    return clearPageHeader;
  }, [embedded, setPageHeader, clearPageHeader]);

  const load = async () => {
    if (!window.pwp?.supplierMaster) { setLoading(false); return; }
    setLoading(true);
    try {
      const [data, comps] = await Promise.all([
        window.pwp.supplierMaster.getAll(),
        window.pwp.companies.getAll(),
      ]);
      setRecords(data || []);
      setCompanies(comps || []);
    } catch (e) {
      showToast('Error loading suppliers', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!window.pwp?.supplierMaster) return;
    
    const formData = new FormData(e.target);
    const form = Object.fromEntries(formData.entries());

    try {
      if (modal?.id) {
        await window.pwp.supplierMaster.update({ ...form, id: modal.id });
        showToast('Supplier updated', 'success');
      } else {
        await window.pwp.supplierMaster.add(form);
        showToast('Supplier added', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this supplier?')) return;
    try {
      await window.pwp.supplierMaster.delete(id);
      showToast('Supplier deleted', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" />
          Suppliers
        </h2>
        <button
          onClick={() => setModal({})}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">GST Number</th>
                <th className="px-4 py-3 font-medium">Trade Name</th>
                <th className="px-4 py-3 font-medium">Entity Type</th>
                <th className="px-4 py-3 font-medium">Registration</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">No suppliers found.</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{companies.find(c => c.id === Number(r.company_id))?.name || r.company_id}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{r.gst_number}</td>
                  <td className="px-4 py-3 text-slate-700">{r.trade_name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.entity_type}</td>
                  <td className="px-4 py-3 text-slate-600">{r.registration_type}</td>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{modal.id ? 'Edit Supplier' : 'New Supplier'}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Company</label>
                  <select name="company_id" defaultValue={modal.company_id} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                    <option value="">Select Company</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">GST Number</label>
                  <input type="text" name="gst_number" defaultValue={modal.gst_number} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Trade Name</label>
                  <input type="text" name="trade_name" defaultValue={modal.trade_name} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Address</label>
                  <textarea name="address" defaultValue={modal.address} rows={2} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"></textarea>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Entity Type</label>
                    <select name="entity_type" defaultValue={modal.entity_type} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="">Select Entity Type</option>
                      <option value="Producer">Producer</option>
                      <option value="Importer">Importer</option>
                      <option value="Brand Owner">Brand Owner</option>
                      <option value="PWP">PWP</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Registration</label>
                    <select name="registration_type" defaultValue={modal.registration_type || 'Unregistered'} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="Registered">Registered</option>
                      <option value="Unregistered">Unregistered</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors">
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
