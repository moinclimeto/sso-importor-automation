import { useEffect, useState, useRef } from 'react';
import { X, Loader2, Plus, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { PLASTIC_CATEGORIES } from '../utils/excelImport.js';
import { FINANCIAL_YEAR_OPTIONS } from '../../shared/procurementConversionFactor.js';
import { enrichSaleRecord } from '../../shared/reviewEnrichment.js';
import { PURCHASE_ENTITY_TYPES } from '../../shared/entityRegistrationTypes.js';
import { getApi } from '../utils/pwpApi.js';
import {
  calcTotalPlasticQuantityMt,
  enrichLineItemsWithWeightMt,
  totalPlasticQuantityHint,
  weightToMt,
} from '../utils/procurementQuantity.js';
import PdfViewer from './PdfViewer';

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

const PLASTIC_MATERIAL_TYPES = ['PET', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS', 'Multi-layer', 'Other'];

const COUNTRY_OPTIONS = [
  'India', 'Germany', 'China', 'United States', 'United Kingdom', 'France', 'Italy',
  'Japan', 'South Korea', 'Singapore', 'United Arab Emirates', 'Other',
];

const emptyPurchase = () => ({
  invoice_file: null,
  invoice_filename: '',
  registration_type: '',
  entity_type: '',
  supplier_name: '',
  country: '',
  address_line_1: '',
  supplier_mobile_number: '',
  plastic_type: '',
  category_of_plastic: 'Cat-II',
  financial_year: '',
  procurement_date: '',
  quantity_mt: '',
  unit: 'MT',
  recycled_plastic_percent: '0',
  conversion_factor: '',
});

const emptySale = () => ({
  s_no: '',
  category_of_plastic: 'Cat-II',
  process_code: '',
  plastic_type: '',
  product_type: '',
  recycled_plastic_percent: '',
  conversion_factor: '',
  available_quantity_mt: '',
  quantity_sold_mt: '',
  registration_type: '',
  entity_type: '',
  financial_year: '',
  mobile_number: '',
  entity_name: '',
  customer_gstin: '',
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

export default function SingleRecordModal({ type, initialData, onClose, onSaved, hasNext, onSaveAndNext, hasPrev, onNext, onPrev }) {
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
          supplier_name: initialData.supplier_name || initialData.vendor_name || '',
          address_line_1: initialData.address_line_1 || initialData.address || '',
          plastic_type: initialData.plastic_type || '',
          country: initialData.country || '',
          unit: initialData.unit || 'MT',
          recycled_plastic_percent:
            initialData.recycled_plastic_percent != null
              ? String(initialData.recycled_plastic_percent)
              : '0',
          procurement_date: initialData.procurement_date || initialData.invoice_date || '',
          conversion_factor:
            initialData.conversion_factor != null && initialData.conversion_factor !== ''
              ? String(initialData.conversion_factor)
              : '',
        };
      } else {
        return enrichSaleRecord({
          ...emptySale(),
          ...initialData,
        });
      }
    }
    return isPurchase ? emptyPurchase() : emptySale();
  });
  
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [fetchedConversionFactor, setFetchedConversionFactor] = useState('');
  const [lineItems, setLineItems] = useState(() =>
    enrichLineItemsWithWeightMt(initialData?.line_items || initialData?.lineItems || [])
  );

  const effectiveConversionFactor =
    parseFloat(form.conversion_factor) || parseFloat(fetchedConversionFactor) || 0;

  useEffect(() => {
    if (!isPurchase || !lineItems.length) return;
    const totalMt = calcTotalPlasticQuantityMt(lineItems, effectiveConversionFactor);
    setForm((prev) => {
      if (totalMt == null) {
        return prev.quantity_mt === '' ? prev : { ...prev, quantity_mt: '', unit: 'MT' };
      }
      const next = String(totalMt);
      if (prev.quantity_mt === next) return prev;
      return { ...prev, quantity_mt: next, unit: 'MT' };
    });
  }, [isPurchase, lineItems, effectiveConversionFactor]);

  useEffect(() => {
    if (!isPurchase) return;
    const fetchCF = async () => {
      try {
        if (window.pwp?.eprData?.getConversionFactor) {
          const cfData = await window.pwp.eprData.getConversionFactor();
          if (cfData?.length > 0) {
            setFetchedConversionFactor(cfData[0].conversion_factor?.toString() || '');
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchCF();
  }, [isPurchase]);

  const updateLineItem = (index, key, value) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [key]: value };
        if (key === 'weight' || key === 'weight_unit') {
          const w = weightToMt(next.weight, next.weight_unit || 'kg');
          if (w != null) next.weight_mt = w;
        }
        if (key === 'weight_mt') {
          next.weight_mt = value === '' ? null : parseFloat(value) || null;
        }
        return next;
      })
    );
  };

  // Sync form state when initialData changes (e.g., when navigating Next/Prev)
  useEffect(() => {
    if (initialData) {
      if (isPurchase) {
        setForm({
          ...emptyPurchase(),
          ...initialData,
          invoice_filename: initialData.invoice_filename || initialData.invoice_file_name || '',
          supplier_name: initialData.supplier_name || initialData.vendor_name || '',
          address_line_1: initialData.address_line_1 || initialData.address || '',
          plastic_type: initialData.plastic_type || '',
          country: initialData.country || '',
          unit: initialData.unit || 'MT',
          recycled_plastic_percent:
            initialData.recycled_plastic_percent != null
              ? String(initialData.recycled_plastic_percent)
              : '0',
          procurement_date: initialData.procurement_date || initialData.invoice_date || '',
          conversion_factor:
            initialData.conversion_factor != null && initialData.conversion_factor !== ''
              ? String(initialData.conversion_factor)
              : '',
        });
        setLineItems(enrichLineItemsWithWeightMt(initialData.line_items || initialData.lineItems || []));
      } else {
        setForm(enrichSaleRecord({
          ...emptySale(),
          ...initialData,
        }));
      }
      setError('');
      setFieldErrors({});
    }
  }, [initialData, isPurchase]);

  const [formWidth, setFormWidth] = useState(50);
  const [pdfOnLeft, setPdfOnLeft] = useState(false);
  const isResizing = useRef(false);

  const startResize = (e) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  };

  const handleMouseMove = (e) => {
    if (!isResizing.current) return;
    const modalElement = document.getElementById('single-record-modal-content');
    if (!modalElement) return;
    const rect = modalElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let newWidthPct = (mouseX / rect.width) * 100;
    if (pdfOnLeft) {
      newWidthPct = 100 - newWidthPct;
    }
    setFormWidth(Math.max(25, Math.min(75, newWidthPct)));
  };

  const stopResize = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
    };
  }, [pdfOnLeft]);

  const [previewUrl, setPreviewUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (form.invoice_file instanceof File) {
      const url = URL.createObjectURL(form.invoice_file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (isEdit && initialData) {
      const getFile = async () => {
        let filePath = initialData.filePath || initialData.local_pdf_path;
        if (!filePath && initialData._source_fields) {
           let sf = initialData._source_fields;
           if (typeof sf === 'string') {
              try { sf = JSON.parse(sf); } catch(e){}
           }
           filePath = sf?.local_pdf_path;
        }
        if (!filePath) return;
        
        setLoadingFile(true);
        try {
          const base64 = await window.pwp?.fs?.readFileBase64(filePath);
          if (base64) {
            const ext = filePath.split('.').pop().toLowerCase();
            const mime = ext === 'pdf' ? 'application/pdf' : 
                         ext === 'png' ? 'image/png' : 
                         (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'application/pdf';
            setPreviewUrl(`data:${mime};base64,${base64}`);
          }
        } catch(e) {
          console.error('Failed to load file preview:', e);
        } finally {
          setLoadingFile(false);
        }
      };
      getFile();
    } else {
      setPreviewUrl(null);
    }
  }, [form.invoice_file, isEdit, initialData]);

  const set = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
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

  const handleSubmit = async (e, isSaveAndNext = false) => {
    e.preventDefault();
    setError('');
    const fe = {};

    if (isPurchase) {
      if (!isEdit && !(form.invoice_filename || '').trim() && !form.invoice_file) {
        fe.invoice_filename = 'Please upload invoice / GST e-invoice';
      }
      if (!form.registration_type) fe.registration_type = 'Please select Registration Type';
      if (!form.entity_type) fe.entity_type = 'Please select Entity Type';
      if (!(form.supplier_name || '').trim()) fe.supplier_name = 'Please enter Name of the Entity';
      if (!form.country) fe.country = 'Please select Country';
      if (!(form.address_line_1 || '').trim()) fe.address_line_1 = 'Please enter Address';
      if (!(form.supplier_mobile_number || '').trim()) fe.supplier_mobile_number = 'Please enter Mobile Number';
      if (!form.plastic_type) fe.plastic_type = 'Please select Plastic Material Type';
      if (!form.category_of_plastic) fe.category_of_plastic = 'Please select Category of Plastic';
      if (!form.financial_year) fe.financial_year = 'Please select Financial Year';
      if (!form.procurement_date) fe.procurement_date = 'Please select Date';
      if (form.quantity_mt === '' || form.quantity_mt === null) {
        fe.quantity_mt = 'Please enter Total Plastic Quantity';
      }
      if (form.recycled_plastic_percent === '' || form.recycled_plastic_percent === null) {
        fe.recycled_plastic_percent = 'Please enter Recycled Plastic %';
      }

      setFieldErrors(fe);
      if (Object.keys(fe).length) {
        setError('Please fill all required fields.');
        return;
      }

      const qty = parseFloat(form.quantity_mt) || 0;
      const payload = {
        company_id: initialData?.company_id ?? null,
        record_type: 'purchase_epr',
        registration_type: (form.registration_type || '').trim(),
        entity_type: (form.entity_type || '').trim(),
        supplier_name: (form.supplier_name || '').trim(),
        vendor_name: (form.supplier_name || '').trim(),
        country: (form.country || '').trim(),
        address_line_1: (form.address_line_1 || '').trim(),
        supplier_mobile_number: (form.supplier_mobile_number || '').trim(),
        plastic_type: (form.plastic_type || '').trim(),
        category_of_plastic: form.category_of_plastic,
        financial_year: (form.financial_year || '').trim(),
        procurement_date: form.procurement_date,
        invoice_date: form.procurement_date,
        quantity_mt: qty,
        quantity: qty,
        unit: 'MT',
        recycled_plastic_percent: parseFloat(form.recycled_plastic_percent) || 0,
        conversion_factor:
          parseFloat(form.conversion_factor) || parseFloat(fetchedConversionFactor) || 0,
        invoice_filename: (form.invoice_filename || '').trim(),
        item_name: (form.plastic_type || form.category_of_plastic || '').trim(),
        lineItems,
      };

      if (isEdit && initialData) {
        payload.extraction = initialData.extraction;
        payload._source_fields = initialData._source_fields;
        payload._routing = initialData._routing;
        payload.fileHash = initialData.file_hash || initialData.fileHash;
        payload.buyer_gst = initialData.buyer_gst || null;
        payload.company_name = initialData.company_name || null;
        payload.invoice_number = initialData.invoice_number || initialData.invoice_no || null;
        payload.invoice_no = initialData.invoice_no || initialData.invoice_number || null;
        payload.irn_no = initialData.irn_no || null;
        payload.supplier_gst_number = initialData.supplier_gst_number || initialData.vendor_gstin || null;
        payload.vendor_gstin = initialData.vendor_gstin || initialData.supplier_gst_number || null;
        payload.is_supplier_gst_available = initialData.is_supplier_gst_available || null;
        payload.account_number = initialData.account_number || null;
        payload.ifsc_code = initialData.ifsc_code || null;
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

  
    if (!(form.entity_name || '').trim()) return setError('Name of the Entity is required.');

    const sold = parseFloat(form.quantity_sold_mt) || 0;
    const payload = {
      company_id: null,
      record_type: 'sale_epr',
      s_no: (form.s_no || '').trim(),
      category_of_plastic: form.category_of_plastic,
      process_code: (form.process_code || '').trim(),
      plastic_type: (form.plastic_type || '').trim(),
      product_type: (form.product_type || '').trim(),
      recycled_plastic_percent: parseFloat(form.recycled_plastic_percent) || 0,
      conversion_factor: parseFloat(form.conversion_factor) || 0,
      available_quantity_mt: parseFloat(form.available_quantity_mt) || 0,
      quantity_sold_mt: sold,
      registration_type: (form.registration_type || '').trim(),
      entity_name: (form.entity_name || '').trim(),
      address: (form.address || '').trim(),
      state: (form.state || '').trim(),
      district: (form.district || '').trim(),
      account_number: (form.account_number || '').trim(),
      ifsc_code: (form.ifsc_code || '').trim().toUpperCase(),
      gst_other_charges: parseFloat(form.gst_other_charges) || 0,
      invoice_file_name: (form.invoice_file_name || '').trim(),
      entity_type: (form.entity_type || '').trim(),
      financial_year: (form.financial_year || '').trim(),
      mobile_number: (form.mobile_number || '').trim(),
      application_number: (form.application_number || '').trim(),
      customer_name: (form.entity_name || '').trim(),
      customer_gstin: (form.customer_gstin || '').trim().toUpperCase(),
      invoice_no: (form.application_number || '').trim() || (form.invoice_file_name || '').trim(),
      item_name: (form.product_type || '').trim() || (form.plastic_type || '').trim() || form.category_of_plastic,
      quantity: sold,
      unit: 'MT',
      total_amount: parseFloat(form.gst_other_charges) || 0,
    };

    if (isEdit && initialData) {
      payload.lineItems = initialData.line_items || initialData.lineItems;
      const baseExtraction =
        initialData.extraction && typeof initialData.extraction === 'object'
          ? { ...initialData.extraction }
          : {};
      const gstNum = parseFloat(form.gst_other_charges);
      payload.extraction = {
        ...baseExtraction,
        district: (form.district || '').trim() || baseExtraction.district,
        dist: (form.district || '').trim() || baseExtraction.dist,
        ...(Number.isFinite(gstNum) && gstNum !== 0
          ? { totalInvoiceAmount: gstNum, tot: gstNum, gst_other_charges: gstNum }
          : {}),
      };
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
      <div id="single-record-modal-content" className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[95vw] lg:w-[90vw] h-[95vh] lg:h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-700">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              {isPurchase && (
                <p className="text-xs text-slate-500">
                  Plastic Raw Material/Packaging Procured — supplier party fields from document
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg mr-2">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!hasPrev || saving}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-l-lg transition-colors border-r border-slate-200"
                  title="Previous Record"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext || saving}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-r-lg transition-colors"
                  title="Next Record"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            {previewUrl && (
              <button
                type="button"
                onClick={() => setPdfOnLeft(!pdfOnLeft)}
                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 flex items-center gap-1 text-sm font-medium transition-colors"
                title="Swap PDF Position"
              >
                <ArrowLeftRight size={16} />
                <span className="hidden sm:inline">Swap Sides</span>
              </button>
            )}
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
            <X size={18} />
          </button>
          </div>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col ${pdfOnLeft ? 'lg:flex-row-reverse' : 'lg:flex-row'}`} style={{ '--form-width': `${formWidth}%` }}>
        <form onSubmit={(e) => handleSubmit(e, false)} className={`overflow-y-auto p-5 space-y-4 ${previewUrl ? 'lg:w-[var(--form-width)]' : 'w-full'}`}>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {isPurchase ? (
            <div className="space-y-4">
              {!isEdit && (
                <Field
                  label="Upload Invoice / GST E-Invoice"
                  required
                  hint="Please upload a scanned copy of invoice (max 1MB)"
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
                <Field label="Registration Type" required>
                  <select
                    className={errCls('registration_type') + ' bg-white'}
                    value={form.registration_type || ''}
                    onChange={(e) => set('registration_type', e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Registered">Registered</option>
                    <option value="Unregistered">Unregistered</option>
                  </select>
                  {fieldErrors.registration_type && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.registration_type}</p>
                  )}
                </Field>

                <Field label="Entity Type" required>
                  <select
                    className={errCls('entity_type') + ' bg-white'}
                    value={form.entity_type || ''}
                    onChange={(e) => set('entity_type', e.target.value)}
                  >
                    <option value="">Select Entity Type</option>
                    {PURCHASE_ENTITY_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {fieldErrors.entity_type && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.entity_type}</p>
                  )}
                </Field>

                <Field label="Name Of The Entity" required>
                  <input
                    className={errCls('supplier_name')}
                    placeholder="Enter Name of the Entity"
                    value={form.supplier_name}
                    onChange={(e) => set('supplier_name', e.target.value)}
                  />
                  {fieldErrors.supplier_name && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.supplier_name}</p>
                  )}
                </Field>

                <Field label="Country" required>
                  <select
                    className={errCls('country') + ' bg-white'}
                    value={form.country || ''}
                    onChange={(e) => set('country', e.target.value)}
                  >
                    <option value="">Select Country</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {fieldErrors.country && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.country}</p>
                  )}
                </Field>

                <Field label="Address" required className="sm:col-span-2">
                  <input
                    className={errCls('address_line_1')}
                    placeholder="Address"
                    value={form.address_line_1}
                    onChange={(e) => set('address_line_1', e.target.value)}
                  />
                  {fieldErrors.address_line_1 && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.address_line_1}</p>
                  )}
                </Field>

                <Field label="Mobile Number" required>
                  <input
                    className={errCls('supplier_mobile_number')}
                    placeholder="Mobile Number"
                    value={form.supplier_mobile_number || ''}
                    onChange={(e) => set('supplier_mobile_number', e.target.value)}
                  />
                  {fieldErrors.supplier_mobile_number && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.supplier_mobile_number}</p>
                  )}
                </Field>

                <Field label="Plastic Material Type" required>
                  <select
                    className={errCls('plastic_type') + ' bg-white'}
                    value={form.plastic_type || ''}
                    onChange={(e) => set('plastic_type', e.target.value)}
                  >
                    <option value="">Select Plastic Material Type</option>
                    {PLASTIC_MATERIAL_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {fieldErrors.plastic_type && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.plastic_type}</p>
                  )}
                </Field>

                <Field label="Category Of Plastic" required>
                  <select
                    className={errCls('category_of_plastic') + ' bg-white'}
                    value={form.category_of_plastic || ''}
                    onChange={(e) => set('category_of_plastic', e.target.value)}
                  >
                    <option value="">Select Category Of Plastic</option>
                    {PLASTIC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {fieldErrors.category_of_plastic && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.category_of_plastic}</p>
                  )}
                </Field>

                <Field label="Financial Year" required>
                  <select
                    className={errCls('financial_year') + ' bg-white'}
                    value={form.financial_year || ''}
                    onChange={(e) => set('financial_year', e.target.value)}
                  >
                    <option value="">Financial Year</option>
                    {FINANCIAL_YEAR_OPTIONS.map((fy) => (
                      <option key={fy} value={fy}>{fy}</option>
                    ))}
                  </select>
                  {fieldErrors.financial_year && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.financial_year}</p>
                  )}
                </Field>

                <Field label="Date" required>
                  <input
                    type="date"
                    className={errCls('procurement_date')}
                    value={form.procurement_date || ''}
                    onChange={(e) => set('procurement_date', e.target.value)}
                  />
                  {fieldErrors.procurement_date && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.procurement_date}</p>
                  )}
                </Field>

                <Field
                  label="Total Plastic Quantity"
                  required
                  hint={totalPlasticQuantityHint(
                    lineItems,
                    effectiveConversionFactor,
                    form.quantity_mt
                  )}
                >
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className={errCls('quantity_mt') + ' flex-1'}
                      placeholder="Enter Total Plastic Quantity"
                      value={form.quantity_mt}
                      onChange={(e) => set('quantity_mt', e.target.value)}
                    />
                    <select
                      className="input bg-white w-24"
                      value={form.unit || 'MT'}
                      onChange={(e) => set('unit', e.target.value)}
                    >
                      <option value="MT">MT</option>
                      <option value="Ton">Ton</option>
                      <option value="Kg">Kg</option>
                    </select>
                  </div>
                  {fieldErrors.quantity_mt && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.quantity_mt}</p>
                  )}
                </Field>

                <Field label="Recycled Plastic % (0 for virgin material)" required>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className={errCls('recycled_plastic_percent')}
                    placeholder="0"
                    value={form.recycled_plastic_percent ?? '0'}
                    onChange={(e) => set('recycled_plastic_percent', e.target.value)}
                  />
                  {fieldErrors.recycled_plastic_percent && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.recycled_plastic_percent}</p>
                  )}
                </Field>

                <Field
                  label="Conversion Factor"
                  hint={
                    fetchedConversionFactor && !form.conversion_factor
                      ? `Default from scraped data: ${fetchedConversionFactor}`
                      : undefined
                  }
                >
                  <input
                    type="number"
                    step="any"
                    className="input"
                    placeholder={fetchedConversionFactor || '0'}
                    value={form.conversion_factor ?? ''}
                    onChange={(e) => set('conversion_factor', e.target.value)}
                  />
                </Field>
              </div>

              {lineItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-800">Line Items</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">#</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Product</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Description</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Qty</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Unit</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Weight (MT)</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, index) => (
                          <tr key={item.lineNo || index} className="border-b border-slate-100">
                            <td className="px-3 py-2">{item.lineNo || index + 1}</td>
                            <td className="px-3 py-2">
                              <input
                                className="input py-1.5 text-xs"
                                value={item.product || ''}
                                onChange={(e) => updateLineItem(index, 'product', e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2 min-w-[12rem]">
                              <input
                                className="input py-1.5 text-xs"
                                value={item.productDescription || ''}
                                onChange={(e) => updateLineItem(index, 'productDescription', e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                className="input py-1.5 text-xs w-20"
                                value={item.quantity || ''}
                                onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                className="input py-1.5 text-xs w-16"
                                value={item.unit || ''}
                                onChange={(e) => updateLineItem(index, 'unit', e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="any"
                                className="input py-1.5 text-xs w-24"
                                value={item.weight_mt ?? ''}
                                onChange={(e) => updateLineItem(index, 'weight_mt', e.target.value)}
                                title={
                                  item.weight
                                    ? `Raw: ${item.weight} ${item.weight_unit || 'kg'}`
                                    : 'Line weight in MT'
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                className="input py-1.5 text-xs w-24"
                                value={item.rate ?? ''}
                                onChange={(e) => updateLineItem(index, 'rate', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Category of Plastic" required>
                  <select className="input" value={form.category_of_plastic || 'Cat-II'} onChange={(e) => set('category_of_plastic', e.target.value)}>
                    <option value="">Select Category</option>
                    {PLASTIC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              <Field label="Plastic Type">
                <select className="input" value={form.plastic_type} onChange={(e) => set('plastic_type', e.target.value)}>
                  <option value="">Select Plastic Type</option>
                  <option value="PET">PET</option>
                  <option value="HDPE">HDPE</option>
                  <option value="PVC">PVC</option>
                  <option value="LDPE">LDPE</option>
                  <option value="PP">PP</option>
                  <option value="PS">PS</option>
                  <option value="Other">Other</option>
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
              <Field label="GST Number">
                <input className="input uppercase" value={form.customer_gstin || ''} onChange={(e) => set('customer_gstin', e.target.value.toUpperCase())} maxLength={15} />
              </Field>
              <Field label="District">
                <input className="input" value={form.district || ''} onChange={(e) => set('district', e.target.value)} />
              </Field>
              <Field label="GST & Other Charges">
                <input type="number" step="any" className="input" value={form.gst_other_charges ?? ''} onChange={(e) => set('gst_other_charges', e.target.value)} />
              </Field>

              <Field label="Entity Type">
                <select className="input bg-white" value={form.entity_type || ''} onChange={(e) => set('entity_type', e.target.value)}>
                  <option value="">Select Entity Type</option>
                  {PURCHASE_ENTITY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Registration Type">
                <select className="input bg-white" value={form.registration_type || ''} onChange={(e) => set('registration_type', e.target.value)}>
                  <option value="">Select</option>
                  <option value="Registered">Registered</option>
                  <option value="Unregistered">Unregistered</option>
                </select>
              </Field>
              <Field label="Mobile Number">
                <input className="input" value={form.mobile_number || ''} onChange={(e) => set('mobile_number', e.target.value)} />
              </Field>
              <Field label="Financial Year">
                <select className="input bg-white" value={form.financial_year || ''} onChange={(e) => set('financial_year', e.target.value)}>
                  <option value="">Select Financial Year</option>
                  {FINANCIAL_YEAR_OPTIONS.map((fy) => (
                    <option key={fy} value={fy}>{fy}</option>
                  ))}
                </select>
              </Field>

              <Field label="Address" className="sm:col-span-2">
                <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="State">
                <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} />
              </Field>
              <Field label="Account Number">
                <input className="input" value={form.account_number} onChange={(e) => set('account_number', e.target.value)} />
              </Field>
              <Field label="IFSC Code">
                <input className="input uppercase" value={form.ifsc_code} onChange={(e) => set('ifsc_code', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Application Number">
                <input className="input" value={form.application_number} onChange={(e) => set('application_number', e.target.value)} />
              </Field>
            </div>
          )}
        </form>

        {previewUrl && (
          <div
            className="hidden lg:flex w-2 bg-slate-200 hover:bg-slate-300 cursor-col-resize items-center justify-center flex-shrink-0 relative z-10 transition-colors"
            onMouseDown={startResize}
            title="Drag to resize"
          >
            <div className="w-0.5 h-8 bg-slate-400 rounded-full" />
          </div>
        )}

        <div className="flex-1 min-h-0 bg-slate-100/50 flex flex-col relative overflow-hidden border-t lg:border-t-0 lg:border-l border-slate-200">
          {previewUrl ? (
            <PdfViewer url={previewUrl} className="w-full h-full rounded-none" />
          ) : (
            <div className="w-full h-full rounded-none border-0 bg-white flex flex-col items-center justify-center text-slate-400">
              {loadingFile ? (
                <span>Loading invoice preview...</span>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-20"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span className="text-sm">No preview available</span>
                  <span className="text-xs mt-1">The PDF file was not found on the local disk.</span>
                </>
              )}
            </div>
          )}
        </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, isEdit && hasNext)}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {isEdit && hasNext ? 'Save & Next' : (isPurchase ? 'Preview / Save' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
