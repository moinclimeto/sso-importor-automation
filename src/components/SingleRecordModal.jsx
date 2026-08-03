import { useEffect, useState } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import { PLASTIC_CATEGORIES } from '../utils/excelImport.js';
import { getApi } from '../utils/pwpApi.js';

const GST_OPTIONS = ['Yes', 'No'];

/** Indian states/UTs for CPCB-style State dropdown */
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyPurchase = (buyerGst = '') => ({
  invoice_file: null,
  invoice_filename: '',
  category_of_plastic: '',
  supplier_name: '',
  address_line_1: '',
  address_line_2: '',
  state: '',
  city: '',
  pin_code: '',
  buyer_gst: buyerGst,
  is_supplier_gst_available: '',
  supplier_gst_number: '',
  hsn_code: '',
  invoice_number: '',
  irn_no: '',
  quantity_mt: '',
  quantity_kg: '',
  date_of_entry: todayIso(),
  procurement_date: '',
});

const emptySale = () => ({
  s_no: '',
  category_of_plastic: '',
  process_code: '',
  plastic_type: '',
  product_type: '',
  recycled_plastic_percent: '',
  conversion_factor: '',
  available_quantity_mt: '',
  quantity_sold_mt: '',
  registration_type: '',
  entity_name: '',
  address: '',
  state: '',
  district: '',
  account_number: '',
  ifsc_code: '',
  gst_other_charges: '',
  invoice_file_name: '',
  application_number: '',
});

function Field({ label, required, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {hint && <p className="text-[11px] text-slate-400 -mt-0.5 mb-1">{hint}</p>}
      {children}
    </div>
  );
}

export default function SingleRecordModal({ type, initialData, onClose, onSaved }) {
  const isPurchase = type !== 'sale';
  const isEdit = Boolean(initialData?.id);
  const title = isPurchase 
    ? (isEdit ? 'Edit Procurement Details' : 'Add Procurement Details') 
    : (isEdit ? 'Edit Post Consumer' : 'Add Post Consumer');

  const [form, setForm] = useState(() => {
    if (initialData) {
      if (isPurchase) {
        return {
          ...emptyPurchase(),
          ...initialData,
          invoice_filename: initialData.invoice_filename || initialData.invoice_file_name || '',
          invoice_number: initialData.invoice_number || initialData.invoice_no || '',
          supplier_name: initialData.supplier_name || initialData.vendor_name || '',
          supplier_gst_number: initialData.supplier_gst_number || initialData.vendor_gstin || '',
        };
      } else {
        return {
          ...emptySale(),
          ...initialData,
        };
      }
    }
    return isPurchase ? emptyPurchase() : emptySale();
  });
  
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isPurchase || isEdit) return;
    (async () => {
      try {
        const companies = await getApi().companies.getAll();
        const gst = companies?.[0]?.gstin || '';
        if (gst) setForm((prev) => ({ ...prev, buyer_gst: gst }));
      } catch {
        /* ignore */
      }
    })();
  }, [isPurchase, isEdit]);

  const set = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'quantity_mt') {
        const mt = parseFloat(value);
        next.quantity_kg = Number.isFinite(mt) ? String(Number((mt * 1000).toFixed(3))) : '';
      }
      if (key === 'invoice_file' && value?.name) {
        next.invoice_filename = value.name;
      }
      return next;
    });
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const errCls = (key) =>
    fieldErrors[key] ? 'input border-red-400 focus:ring-red-400' : 'input';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const fe = {};

    if (isPurchase) {
      if (!isEdit && !form.invoice_filename?.trim() && !form.invoice_file) {
        fe.invoice_filename = 'Please upload invoice / GST e-invoice';
      }
      if (!form.category_of_plastic) fe.category_of_plastic = 'Please Select Categories of Plastic';
      if (!form.supplier_name.trim()) fe.supplier_name = 'Please Enter Name of Supplier';
      if (!form.address_line_1.trim()) fe.address_line_1 = 'Please Enter Address Line 1';
      if (!form.state) fe.state = 'Please Select State';
      if (!form.city.trim()) fe.city = 'Please Select City';
      if (!form.pin_code.trim()) fe.pin_code = 'Please Enter PIN Code';
      if (!isEdit && !form.is_supplier_gst_available) {
        fe.is_supplier_gst_available = 'Please Select Is Supplier GST Available?';
      }
      if (!isEdit && form.is_supplier_gst_available === 'Yes' && !form.supplier_gst_number.trim()) {
        fe.supplier_gst_number = 'Please Enter Supplier GST';
      }
      if (!form.hsn_code.trim()) fe.hsn_code = 'Please Enter HSN Code';
      if (!form.invoice_number.trim()) {
        fe.invoice_number = 'Please Enter Invoice No./GST E-Invoice Number';
      }
      if (form.quantity_mt === '' || form.quantity_mt === null) {
        fe.quantity_mt = 'Please Enter quantity';
      }
      if (!form.procurement_date) fe.procurement_date = 'Please Select Procurement date';

      setFieldErrors(fe);
      if (Object.keys(fe).length) {
        setError('Please fill all required fields.');
        return;
      }

      const qty = parseFloat(form.quantity_mt) || 0;
      const qtyKg = parseFloat(form.quantity_kg) || Number((qty * 1000).toFixed(3));
      const payload = {
        company_id: null,
        record_type: 'purchase_epr',
        category_of_plastic: form.category_of_plastic,
        supplier_name: form.supplier_name.trim(),
        address_line_1: form.address_line_1.trim(),
        address_line_2: form.address_line_2.trim(),
        state: form.state,
        city: form.city.trim(),
        pin_code: form.pin_code.trim(),
        buyer_gst: form.buyer_gst.trim().toUpperCase(),
        is_supplier_gst_available: form.is_supplier_gst_available,
        supplier_gst_number: form.supplier_gst_number.trim().toUpperCase(),
        hsn_code: form.hsn_code.trim(),
        invoice_number: form.invoice_number.trim(),
        irn_no: form.irn_no.trim(),
        quantity_mt: qty,
        quantity_kg: qtyKg,
        date_of_entry: form.date_of_entry || todayIso(),
        procurement_date: form.procurement_date,
        invoice_filename: form.invoice_filename.trim(),
        // compat
        vendor_name: form.supplier_name.trim(),
        vendor_gstin: form.supplier_gst_number.trim().toUpperCase(),
        invoice_no: form.invoice_number.trim(),
        invoice_date: form.procurement_date,
        item_name: form.category_of_plastic,
        quantity: qty,
        unit: 'MT',
        total_amount: 0,
      };

      if (isEdit && initialData) {
        payload.lineItems = initialData.line_items || initialData.lineItems;
        payload.extraction = initialData.extraction;
        payload._source_fields = initialData._source_fields;
        payload._routing = initialData._routing;
        payload.fileHash = initialData.file_hash || initialData.fileHash;
      }

      setSaving(true);
      try {
        if (isEdit) {
          payload.id = initialData.id;
          await getApi().purchases.update(payload);
        } else {
          await getApi().purchases.add(payload);
        }
        onSaved?.();
        onClose();
      } catch (err) {
        setError(err?.message || 'Failed to save record');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Sale (unchanged structure)
    if (!form.category_of_plastic) {
      setError('Categories of Plastic is required.');
      return;
    }
    if (!form.entity_name.trim()) return setError('Name of the Entity is required.');

    const sold = parseFloat(form.quantity_sold_mt) || 0;
    const payload = {
      company_id: null,
      record_type: 'sale_epr',
      s_no: form.s_no.trim(),
      category_of_plastic: form.category_of_plastic,
      process_code: form.process_code.trim(),
      plastic_type: form.plastic_type.trim(),
      product_type: form.product_type.trim(),
      recycled_plastic_percent: parseFloat(form.recycled_plastic_percent) || 0,
      conversion_factor: parseFloat(form.conversion_factor) || 0,
      available_quantity_mt: parseFloat(form.available_quantity_mt) || 0,
      quantity_sold_mt: sold,
      registration_type: form.registration_type.trim(),
      entity_name: form.entity_name.trim(),
      address: form.address.trim(),
      state: form.state.trim(),
      district: form.district.trim(),
      account_number: form.account_number.trim(),
      ifsc_code: form.ifsc_code.trim().toUpperCase(),
      gst_other_charges: parseFloat(form.gst_other_charges) || 0,
      invoice_file_name: form.invoice_file_name.trim(),
      application_number: form.application_number.trim(),
      customer_name: form.entity_name.trim(),
      invoice_no: form.application_number.trim() || form.invoice_file_name.trim(),
      item_name: form.product_type.trim() || form.plastic_type.trim() || form.category_of_plastic,
      quantity: sold,
      unit: 'MT',
      total_amount: parseFloat(form.gst_other_charges) || 0,
    };

    if (isEdit && initialData) {
      payload.lineItems = initialData.line_items || initialData.lineItems;
      payload.extraction = initialData.extraction;
      payload._source_fields = initialData._source_fields;
      payload._routing = initialData._routing;
      payload.fileHash = initialData.file_hash || initialData.fileHash;
    }

    setSaving(true);
    try {
      if (isEdit) {
        payload.id = initialData.id;
        await getApi().sales.update(payload);
      } else {
        await getApi().sales.add(payload);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-700">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              {isPurchase && (
                <p className="text-xs text-slate-500">Single Entry — match CPCB procurement form</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {isPurchase ? (
            <div className="space-y-4">
              {/* Full width: Upload Invoice (Hidden in edit mode) */}
              {!isEdit && (
                <Field
                  label="Upload Invoice / GST E-Invoice"
                  required
                  hint="# As Applicable As Per GST Act 2017 (As Amended)"
                >
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className={errCls('invoice_filename')}
                    onChange={(e) => set('invoice_file', e.target.files?.[0] || null)}
                  />
                  {form.invoice_filename && (
                    <p className="text-xs text-slate-500 mt-1">Selected: {form.invoice_filename}</p>
                  )}
                  {fieldErrors.invoice_filename && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.invoice_filename}</p>
                  )}
                </Field>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Categories of Plastic" required>
                  <select
                    className={errCls('category_of_plastic')}
                    value={form.category_of_plastic}
                    onChange={(e) => set('category_of_plastic', e.target.value)}
                  >
                    <option value="">Select</option>
                    {PLASTIC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {fieldErrors.category_of_plastic && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.category_of_plastic}</p>
                  )}
                </Field>

                <Field label="Name of Supplier" required>
                  <input
                    className={errCls('supplier_name')}
                    placeholder="Enter name of supplier"
                    value={form.supplier_name}
                    onChange={(e) => set('supplier_name', e.target.value)}
                  />
                  {fieldErrors.supplier_name && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.supplier_name}</p>
                  )}
                </Field>

                <Field label="Address Line 1" required>
                  <input
                    className={errCls('address_line_1')}
                    placeholder="Enter address"
                    value={form.address_line_1}
                    onChange={(e) => set('address_line_1', e.target.value)}
                  />
                  {fieldErrors.address_line_1 && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.address_line_1}</p>
                  )}
                </Field>

                <Field label="Address Line 2">
                  <input
                    className="input"
                    placeholder="Enter address"
                    value={form.address_line_2}
                    onChange={(e) => set('address_line_2', e.target.value)}
                  />
                </Field>

                <Field label="State" required>
                  <select
                    className={errCls('state')}
                    value={form.state}
                    onChange={(e) => set('state', e.target.value)}
                  >
                    <option value="">Select</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {fieldErrors.state && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.state}</p>
                  )}
                </Field>

                <Field label="City" required>
                  <input
                    className={errCls('city')}
                    placeholder="Enter city"
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                  />
                  {fieldErrors.city && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.city}</p>
                  )}
                </Field>

                <Field label="PIN Code" required>
                  <input
                    className={errCls('pin_code')}
                    placeholder="Enter PIN Code"
                    value={form.pin_code}
                    onChange={(e) => set('pin_code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                  />
                  {fieldErrors.pin_code && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.pin_code}</p>
                  )}
                </Field>

                <Field label="Buyer GST">
                  <input
                    className="input bg-slate-100 text-slate-600"
                    placeholder="Enter Buyer GST"
                    value={form.buyer_gst}
                    readOnly
                    disabled
                  />
                </Field>

                {!isEdit && (
                  <Field label="Is Supplier GST Available?" required>
                    <select
                      className={errCls('is_supplier_gst_available')}
                      value={form.is_supplier_gst_available}
                      onChange={(e) => set('is_supplier_gst_available', e.target.value)}
                    >
                      <option value="">Select</option>
                      {GST_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    {fieldErrors.is_supplier_gst_available && (
                      <p className="text-xs text-red-500 mt-1">{fieldErrors.is_supplier_gst_available}</p>
                    )}
                  </Field>
                )}

                <Field label="HSN Code" required>
                  <input
                    className={errCls('hsn_code')}
                    placeholder="Enter HSN Code"
                    value={form.hsn_code}
                    onChange={(e) => set('hsn_code', e.target.value)}
                  />
                  {fieldErrors.hsn_code && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.hsn_code}</p>
                  )}
                </Field>

                {(isEdit || form.is_supplier_gst_available === 'Yes') && (
                  <Field label="Supplier GST" className="sm:col-span-2">
                    <input
                      className={errCls('supplier_gst_number')}
                      placeholder="Enter Supplier GST"
                      value={form.supplier_gst_number}
                      onChange={(e) => set('supplier_gst_number', e.target.value.toUpperCase())}
                      maxLength={15}
                    />
                    {fieldErrors.supplier_gst_number && (
                      <p className="text-xs text-red-500 mt-1">{fieldErrors.supplier_gst_number}</p>
                    )}
                  </Field>
                )}

                <Field label="Invoice No./GST E-Invoice Number" required>
                  <input
                    className={errCls('invoice_number')}
                    placeholder="Enter Invoice No./GST E-Invoice Number"
                    value={form.invoice_number}
                    onChange={(e) => set('invoice_number', e.target.value)}
                  />
                  {fieldErrors.invoice_number && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.invoice_number}</p>
                  )}
                </Field>

                <Field label="Qty. of Waste Plastic (MT)" required>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className={errCls('quantity_mt')}
                    placeholder="Enter quantity"
                    value={form.quantity_mt}
                    onChange={(e) => set('quantity_mt', e.target.value)}
                  />
                  {fieldErrors.quantity_mt && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.quantity_mt}</p>
                  )}
                </Field>

                <Field label="Qty. of Waste Plastic (Kg)" required>
                  <input
                    className="input bg-slate-100 text-slate-600"
                    placeholder="Auto from MT"
                    value={form.quantity_kg}
                    readOnly
                    disabled
                  />
                </Field>

                <Field label="Date of Entry" required>
                  <input
                    type="date"
                    className="input bg-slate-100 text-slate-600"
                    value={form.date_of_entry}
                    readOnly
                    disabled
                  />
                </Field>

                <Field label="Procurement date" required>
                  <input
                    type="date"
                    className={errCls('procurement_date')}
                    value={form.procurement_date}
                    onChange={(e) => set('procurement_date', e.target.value)}
                  />
                  {fieldErrors.procurement_date && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.procurement_date}</p>
                  )}
                </Field>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Category of Plastic" required>
                <select className="input" value={form.category_of_plastic} onChange={(e) => set('category_of_plastic', e.target.value)}>
                  <option value="">Select Category</option>
                  {PLASTIC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plastic Type">
                <input className="input" value={form.plastic_type} onChange={(e) => set('plastic_type', e.target.value)} />
              </Field>
              <Field label="Product Type">
                <select className="input" value={form.product_type} onChange={(e) => set('product_type', e.target.value)}>
                  <option value="">Select Product Type</option>
                  <option value="Cement">Cement</option>
                  <option value="Clinker">Clinker</option>
                </select>
              </Field>
              <Field label="(%) of Recycled Plastic">
                <input type="number" step="any" className="input" value={form.recycled_plastic_percent} onChange={(e) => set('recycled_plastic_percent', e.target.value)} />
              </Field>
              <Field label="Conversion Factor">
                <input type="number" step="any" className="input" value={form.conversion_factor} onChange={(e) => set('conversion_factor', e.target.value)} />
              </Field>
              <Field label="Available Quantity (MT)">
                <input type="number" step="any" className="input" value={form.available_quantity_mt} onChange={(e) => set('available_quantity_mt', e.target.value)} />
              </Field>
              <Field label="Quantity Sold (MT)">
                <input type="number" step="any" className="input" value={form.quantity_sold_mt} onChange={(e) => set('quantity_sold_mt', e.target.value)} />
              </Field>
              <Field label="Name of the Entity" required>
                <input className="input" value={form.entity_name} onChange={(e) => set('entity_name', e.target.value)} />
              </Field>

              <Field label="Address" className="sm:col-span-2">
                <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="State">
                <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} />
              </Field>
              <Field label="District">
                <input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} />
              </Field>
              <Field label="Account Number">
                <input className="input" value={form.account_number} onChange={(e) => set('account_number', e.target.value)} />
              </Field>
              <Field label="IFSC Code">
                <input className="input uppercase" value={form.ifsc_code} onChange={(e) => set('ifsc_code', e.target.value.toUpperCase())} />
              </Field>
              <Field label="GST & Other Charges">
                <input type="number" step="any" className="input" value={form.gst_other_charges} onChange={(e) => set('gst_other_charges', e.target.value)} />
              </Field>
              <Field label="Application Number">
                <input className="input" value={form.application_number} onChange={(e) => set('application_number', e.target.value)} />
              </Field>
            </div>
          )}
        </form>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {isPurchase ? 'Preview / Save' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
