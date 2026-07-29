import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Building2, X } from 'lucide-react';

const EMPTY = { name: '', gstin: '', address: '', city: '', state: '', pincode: '', phone: '', email: '' };

function CompanyModal({ company, onSave, onClose }) {
  const [form, setForm] = useState(company || EMPTY);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Company name is required.'); return; }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-lg text-slate-800">
            {company?.id ? 'Edit Company' : 'Add Company'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Company Name *</label>
              <input name="name" value={form.name} onChange={handleChange} className="input" placeholder="ABC Traders" />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input name="gstin" value={form.gstin} onChange={handleChange} className="input" placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} className="input" placeholder="9876543210" />
            </div>
            <div className="col-span-2">
              <label className="label">Email</label>
              <input name="email" value={form.email} onChange={handleChange} className="input" placeholder="info@abc.com" />
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <input name="address" value={form.address} onChange={handleChange} className="input" placeholder="123 Main Street" />
            </div>
            <div>
              <label className="label">City</label>
              <input name="city" value={form.city} onChange={handleChange} className="input" placeholder="Mumbai" />
            </div>
            <div>
              <label className="label">State</label>
              <input name="state" value={form.state} onChange={handleChange} className="input" placeholder="Maharashtra" />
            </div>
            <div>
              <label className="label">Pincode</label>
              <input name="pincode" value={form.pincode} onChange={handleChange} className="input" placeholder="400001" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">
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
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (window.pwp) {
      const data = await window.pwp.companies.getAll();
      setCompanies(data);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (!window.pwp) return;
    if (modal?.id) {
      await window.pwp.companies.update({ ...form, id: modal.id });
    } else {
      await window.pwp.companies.add(form);
    }
    setModal(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this company?')) return;
    await window.pwp.companies.delete(id);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Companies</h1>
          <p className="text-slate-500 text-sm">{companies.length} companies registered</p>
        </div>
        <button onClick={() => setModal(EMPTY)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Company
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center shadow-sm border border-slate-100">
          <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No companies yet. Add your first company.</p>
          <button onClick={() => setModal(EMPTY)} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus size={16} /> Add Company
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="th">#</th>
                <th className="th">Company Name</th>
                <th className="th">GSTIN</th>
                <th className="th">City</th>
                <th className="th">State</th>
                <th className="th">Phone</th>
                <th className="th">Email</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="td text-slate-400">{i + 1}</td>
                  <td className="td font-medium text-slate-800">{c.name}</td>
                  <td className="td font-mono text-xs">{c.gstin || '—'}</td>
                  <td className="td">{c.city || '—'}</td>
                  <td className="td">{c.state || '—'}</td>
                  <td className="td">{c.phone || '—'}</td>
                  <td className="td">{c.email || '—'}</td>
                  <td className="td text-right">
                    <button onClick={() => setModal(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg mr-1 transition-colors">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <CompanyModal
          company={modal?.id ? modal : null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
