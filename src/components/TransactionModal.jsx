import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const EMPTY_PURCHASE = {
  company_id: '', invoice_no: '', invoice_date: '', vendor_name: '', vendor_gstin: '',
  item_name: '', hsn_code: '', quantity: '', unit: 'PCS', rate: '',
  taxable_amount: '', cgst_rate: '0', sgst_rate: '0', igst_rate: '0',
  cgst_amount: '0', sgst_amount: '0', igst_amount: '0', total_amount: '', notes: ''
};

const EMPTY_SALE = {
  company_id: '', invoice_no: '', invoice_date: '', customer_name: '', customer_gstin: '',
  item_name: '', hsn_code: '', quantity: '', unit: 'PCS', rate: '',
  taxable_amount: '', cgst_rate: '0', sgst_rate: '0', igst_rate: '0',
  cgst_amount: '0', sgst_amount: '0', igst_amount: '0', total_amount: '', notes: ''
};

export default function TransactionModal({ type, record, companies, onSave, onClose }) {
  const isPurchase = type === 'purchase';
  const [form, setForm] = useState(record || (isPurchase ? EMPTY_PURCHASE : EMPTY_SALE));
  const [error, setError] = useState('');

  useEffect(() => {
    const qty = parseFloat(form.quantity) || 0;
    const rate = parseFloat(form.rate) || 0;
    const taxable = qty * rate;
    const cgst = (taxable * (parseFloat(form.cgst_rate) || 0)) / 100;
    const sgst = (taxable * (parseFloat(form.sgst_rate) || 0)) / 100;
    const igst = (taxable * (parseFloat(form.igst_rate) || 0)) / 100;
    const total = taxable + cgst + sgst + igst;
    setForm((f) => ({
      ...f,
      taxable_amount: taxable.toFixed(2),
      cgst_amount: cgst.toFixed(2),
      sgst_amount: sgst.toFixed(2),
      igst_amount: igst.toFixed(2),
      total_amount: total.toFixed(2),
    }));
  }, [form.quantity, form.rate, form.cgst_rate, form.sgst_rate, form.igst_rate]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    const partyField = isPurchase ? 'vendor_name' : 'customer_name';
    if (!form.invoice_no.trim()) { setError('Invoice number is required.'); return; }
    if (!form.invoice_date) { setError('Invoice date is required.'); return; }
    if (!form[partyField].trim()) { setError(`${isPurchase ? 'Vendor' : 'Customer'} name is required.`); return; }
    if (!form.item_name.trim()) { setError('Item name is required.'); return; }
    if (!form.quantity || isNaN(form.quantity)) { setError('Valid quantity is required.'); return; }
    if (!form.rate || isNaN(form.rate)) { setError('Valid rate is required.'); return; }
    setError('');

    const data = {
      ...form,
      company_id: form.company_id || null,
      quantity: parseFloat(form.quantity),
      rate: parseFloat(form.rate),
      taxable_amount: parseFloat(form.taxable_amount),
      cgst_rate: parseFloat(form.cgst_rate) || 0,
      sgst_rate: parseFloat(form.sgst_rate) || 0,
      igst_rate: parseFloat(form.igst_rate) || 0,
      cgst_amount: parseFloat(form.cgst_amount) || 0,
      sgst_amount: parseFloat(form.sgst_amount) || 0,
      igst_amount: parseFloat(form.igst_amount) || 0,
      total_amount: parseFloat(form.total_amount),
    };
    onSave(data);
  };

  const partyLabel = isPurchase ? 'Vendor' : 'Customer';
  const partyField = isPurchase ? 'vendor_name' : 'customer_name';
  const gstinField = isPurchase ? 'vendor_gstin' : 'customer_gstin';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-lg text-slate-800">
            {record?.id ? `Edit ${isPurchase ? 'Purchase' : 'Sale'}` : `Add ${isPurchase ? 'Purchase' : 'Sale'}`}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-red-500 text-sm bg-red-50 p-2 rounded-lg">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Company (optional)</label>
              <select name="company_id" value={form.company_id} onChange={handleChange} className="input">
                <option value="">— Select Company —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Invoice No. *</label>
              <input name="invoice_no" value={form.invoice_no} onChange={handleChange} className="input" placeholder="INV-001" />
            </div>
            <div>
              <label className="label">Invoice Date *</label>
              <input type="date" name="invoice_date" value={form.invoice_date} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">{partyLabel} Name *</label>
              <input name={partyField} value={form[partyField]} onChange={handleChange} className="input" placeholder={`${partyLabel} name`} />
            </div>
            <div>
              <label className="label">{partyLabel} GSTIN</label>
              <input name={gstinField} value={form[gstinField]} onChange={handleChange} className="input" placeholder="GSTIN" />
            </div>
            <div>
              <label className="label">Item Name *</label>
              <input name="item_name" value={form.item_name} onChange={handleChange} className="input" placeholder="Product name" />
            </div>
            <div>
              <label className="label">HSN Code</label>
              <input name="hsn_code" value={form.hsn_code} onChange={handleChange} className="input" placeholder="HSN" />
            </div>
            <div>
              <label className="label">Quantity *</label>
              <input type="number" name="quantity" value={form.quantity} onChange={handleChange} className="input" placeholder="0" min="0" step="0.01" />
            </div>
            <div>
              <label className="label">Unit</label>
              <select name="unit" value={form.unit} onChange={handleChange} className="input">
                {['PCS', 'KG', 'LTR', 'MTR', 'BOX', 'SET', 'NOS'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Rate (₹) *</label>
              <input type="number" name="rate" value={form.rate} onChange={handleChange} className="input" placeholder="0.00" min="0" step="0.01" />
            </div>
            <div>
              <label className="label">Taxable Amount</label>
              <input readOnly value={form.taxable_amount} className="input bg-slate-50 text-slate-600" />
            </div>
          </div>

          {/* Tax */}
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Tax Details</p>
            <div className="grid grid-cols-3 gap-3">
              {[['CGST', 'cgst'], ['SGST', 'sgst'], ['IGST', 'igst']].map(([label, key]) => (
                <div key={key}>
                  <label className="label">{label} %</label>
                  <input type="number" name={`${key}_rate`} value={form[`${key}_rate`]} onChange={handleChange} className="input" placeholder="0" min="0" max="100" step="0.5" />
                  <p className="text-xs text-slate-400 mt-1">₹{form[`${key}_amount`]}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-4">
            <span className="font-semibold text-slate-700">Total Amount</span>
            <span className="text-xl font-bold text-blue-600">₹{form.total_amount}</span>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} className="input resize-none" rows={2} placeholder="Optional notes..." />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">
              {record?.id ? 'Update' : `Add ${isPurchase ? 'Purchase' : 'Sale'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
