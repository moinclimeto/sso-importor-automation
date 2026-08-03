import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Building2, X, Loader2, LayoutDashboard } from 'lucide-react';
import { Toast, useToast } from '../components/Toast.jsx';
import { getApi } from '../utils/pwpApi.js';
import ScrapedDashboard from '../components/ScrapedDashboard.jsx';

const EMPTY = { name: '', gstin: '', pan: '', account_number: '', ifsc_code: '' };

/** PAN = characters 3–12 of a 15-char GSTIN */
function extractPanFromGstin(gstin) {
  const g = String(gstin || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (g.length < 12) return '';
  return g.slice(2, 12);
}

function CompanyModal({ company, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name: company?.name || '',
    gstin: company?.gstin || '',
    pan: company?.pan || extractPanFromGstin(company?.gstin) || '',
    account_number: company?.account_number || '',
    ifsc_code: company?.ifsc_code || '',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'gstin') {
      const gstin = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
      setForm({
        ...form,
        gstin,
        pan: extractPanFromGstin(gstin),
      });
      return;
    }
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Company name is required.'); return; }
    if (!form.gstin.trim()) { setError('GSTIN is required.'); return; }
    if (form.gstin.trim().length !== 15) {
      setError('GSTIN must be 15 characters.');
      return;
    }
    const pan = extractPanFromGstin(form.gstin);
    if (!pan || pan.length !== 10) {
      setError('Could not extract PAN from GSTIN.');
      return;
    }
    onSave({
      name: form.name.trim(),
      gstin: form.gstin.trim().toUpperCase(),
      pan,
      account_number: form.account_number.trim(),
      ifsc_code: form.ifsc_code.trim().toUpperCase(),
      ...(company?.entity_type != null ? { entity_type: company.entity_type } : {}),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-lg text-slate-800">
            {company?.id ? 'Edit Company' : 'Add Company'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div>
            <label className="label">Company Name *</label>
            <input
              name="name"
              value={form.name || ''}
              onChange={handleChange}
              className="input"
              placeholder="ABC Traders"
              disabled={saving}
            />
          </div>
          <div>
            <label className="label">GSTIN *</label>
            <input
              name="gstin"
              value={form.gstin || ''}
              onChange={handleChange}
              className="input uppercase"
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              disabled={saving}
            />
          </div>

          <div>
            <label className="label">PAN</label>
            <input
              name="pan"
              value={form.pan || ''}
              className="input uppercase bg-slate-50 text-slate-600"
              placeholder="Auto from GSTIN"
              readOnly
            />
            <p className="text-[11px] text-slate-400 mt-1">Extracted automatically from GSTIN</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary inline-flex items-center justify-center gap-2">
              {saving && <Loader2 size={16} className="animate-spin" />}
              {company?.id ? 'Update' : 'Add Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const load = async () => {
    try {
      const api = getApi();
      let data = await api.companies.getAll();
      console.log("Initial JSON data:", data);
      
      // Auto-sync from SQLite scraped profile
      const scrapedProfile = await api.scraper.getProfile();
      console.log("Scraped Profile:", scrapedProfile);
      if (scrapedProfile) {
        // Find if this scraped company already exists in local JSON db
        const exists = data.find(c => c.name === scrapedProfile.company_name);
        if (!exists) {
           console.log("Auto-adding missing company...");
           // Auto-add it to local JSON DB
           const pan = extractPanFromGstin(scrapedProfile.company_name) || "AUTO12345X"; // Default fallback PAN if missing
           await api.companies.add({
             name: scrapedProfile.company_name,
             gstin: "", // It might not be in profile, but we add it if found
             pan: pan,
             isScraped: true
           });
           data = await api.companies.getAll();
           console.log("Data after auto-add:", data);
        } else {
           console.log("Company already exists in JSON.");
           // Tag it as scraped for UI highlighting
           exists.isScraped = true; 
        }
      }

      setCompanies(data || []);
    } catch (err) {
      console.error("Failed to load companies:", err);
      setCompanies([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAddModal = () => setModal(EMPTY);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      const api = getApi();
      const isEdit = Boolean(modal?.id);
      if (isEdit) {
        const existing = companies.find((c) => c.id === modal.id);
        await api.companies.update({
          ...existing,
          ...form,
          id: modal.id,
        });
        setModal(null);
        await load();
        showToast('Company updated successfully');
      } else {
        await api.companies.add(form);
        setModal(null);
        await load();
        showToast('Company added successfully');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to save company', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this company?')) return;
    try {
      await getApi().companies.delete(id);
      await load();
      showToast('Company deleted successfully');
    } catch (err) {
      showToast(err?.message || 'Failed to delete company', 'error');
    }
  };

  // If a company is selected for the dashboard, show the detail view
  if (selectedCompany) {
    return <ScrapedDashboard company={selectedCompany} onBack={() => setSelectedCompany(null)} />;
  }

  return (
    <div className="space-y-5 animate-in fade-in">
      <Toast toast={toast} onClose={hideToast} />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-slate-500 text-sm">{companies.length} companies registered</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={openAddModal}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} /> Add Company
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="th">#</th>
                  <th className="th">Company Name</th>
                  <th className="th">GSTIN</th>
                  <th className="th">PAN</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="td text-center py-12 text-slate-500">
                      <Building2 size={36} className="mx-auto text-slate-300 mb-2" />
                      No companies yet. Click <span className="font-medium text-slate-700">Add Company</span> to create one.
                    </td>
                  </tr>
                ) : (
                  companies.map((c, i) => (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="td text-slate-400">{i + 1}</td>
                      <td className="td font-medium text-slate-800 flex items-center gap-2">
                        {c.name}
                        {c.isScraped && (
                           <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">SCRAPED DATA</span>
                        )}
                      </td>
                      <td className="td font-mono text-xs">{c.gstin || '—'}</td>
                      <td className="td font-mono text-xs">
                        {c.pan || extractPanFromGstin(c.gstin) || '—'}
                      </td>
                      <td className="td text-right flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedCompany(c)}
                          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1 font-medium text-xs px-2"
                        >
                          <LayoutDashboard size={15} /> Dashboard
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal(c)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <CompanyModal
          company={modal?.id ? modal : null}
          onSave={handleSave}
          onClose={() => !saving && setModal(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
