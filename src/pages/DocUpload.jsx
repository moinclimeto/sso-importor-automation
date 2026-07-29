import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar, FileText, FolderOpen, Loader2, Sparkles, Trash2, Upload, CheckCircle2
} from 'lucide-react';

const EMPTY = {
  company_id: '',
  invoice_no: '',
  invoice_date: '',
  vendor_name: '',
  vendor_gstin: '',
  customer_name: '',
  customer_gstin: '',
  item_name: '',
  hsn_code: '',
  quantity: '',
  unit: 'PCS',
  rate: '',
  taxable_amount: '',
  cgst_rate: '0',
  sgst_rate: '0',
  igst_rate: '0',
  cgst_amount: '0',
  sgst_amount: '0',
  igst_amount: '0',
  total_amount: '',
  notes: '',
};

function getFyOptions() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options = [{ value: 'all', label: 'All' }];
  for (let y = year; y >= year - 4; y -= 1) {
    const label = `${y}-${String(y + 1).slice(-2)}`;
    options.push({ value: label, label });
  }
  return options;
}

function FileRow({ file, onRemove, status }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-700">
        <FileText size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
        <p className="text-xs text-slate-400">
          {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Local file'}
          {status ? ` · ${status}` : ''}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

export default function DocUpload() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const fyOptions = useMemo(() => getFyOptions(), []);

  const [docType] = useState(
    location.state?.type === 'sale' ? 'sale' : 'purchase'
  );
  const isPurchase = docType === 'purchase';

  const [financialYear, setFinancialYear] = useState('all');
  const [files, setFiles] = useState([]);
  const [stage, setStage] = useState('upload');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (window.pwp?.companies?.getAll) {
      window.pwp.companies.getAll().then(setCompanies).catch(() => {});
    }
  }, []);

  const addBrowserFiles = (list) => {
    const next = Array.from(list || [])
      .filter((f) => {
        const name = f.name.toLowerCase();
        return (
          name.endsWith('.pdf') ||
          name.endsWith('.png') ||
          name.endsWith('.jpg') ||
          name.endsWith('.jpeg') ||
          name.endsWith('.webp') ||
          name.endsWith('.zip')
        );
      })
      .map((f) => ({
        name: f.name,
        path: f.path || null,
        size: f.size,
        file: f,
      }));
    if (!next.length) {
      setError('Please select PDF, JPG, PNG, or ZIP files.');
      return;
    }
    setFiles((prev) => [...prev, ...next]);
    setError('');
  };

  const handleSelectFiles = async () => {
    if (!window.pwp?.ocr?.selectFiles) {
      inputRef.current?.click();
      return;
    }
    try {
      const paths = await window.pwp.ocr.selectFiles();
      if (!paths?.length) return;
      setFiles((prev) => [
        ...prev,
        ...paths.map((p) => ({
          name: p.split(/[/\\]/).pop(),
          path: p,
          size: 0,
        })),
      ]);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to select files');
    }
  };

  const handleSelectFolder = async () => {
    if (!window.pwp?.ocr?.selectFolder) {
      setError('Folder browse needs the Electron app. Run with npm run electron:dev');
      return;
    }
    try {
      const paths = await window.pwp.ocr.selectFolder();
      if (!paths?.length) return;
      setFiles((prev) => [
        ...prev,
        ...paths.map((p) => ({
          name: p.split(/[/\\]/).pop(),
          path: p,
          size: 0,
        })),
      ]);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to select folder');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    addBrowserFiles(e.dataTransfer.files);
  };

  const handleExtract = async () => {
    if (!files.length) {
      setError('Please upload at least one document.');
      return;
    }
    if (!window.pwp?.ocr?.extract) {
      setError('OCR extraction needs the Electron app. Run with npm run electron:dev');
      return;
    }

    const target = files[0];
    if (!target.path) {
      setError('Please select files using Browse inside the Electron app.');
      return;
    }

    setStage('processing');
    setError('');
    setProgress('Reading document with Gemini OCR…');

    try {
      const result = await window.pwp.ocr.extract({
        filePath: target.path,
        type: docType,
        financialYear,
      });

      if (!result?.success) {
        throw new Error(result?.message || 'Extraction failed');
      }

      const notesExtra =
        financialYear && financialYear !== 'all'
          ? `FY: ${financialYear}`
          : '';

      setForm({
        ...EMPTY,
        ...result.data,
        company_id: result.data?.company_id || '',
        notes: [result.data?.notes, notesExtra].filter(Boolean).join(' | '),
      });
      setStage('review');
      setProgress('');
    } catch (err) {
      setStage('upload');
      setProgress('');
      setError(err?.message || 'Gemini extraction failed');
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSave = async () => {
    setError('');
    setSaved(false);

    const partyField = isPurchase ? 'vendor_name' : 'customer_name';
    if (!form.invoice_no?.trim()) return setError('Invoice number is required.');
    if (!form.invoice_date) return setError('Invoice date is required.');
    if (!form[partyField]?.trim()) {
      return setError(`${isPurchase ? 'Vendor' : 'Customer'} name is required.`);
    }
    if (!form.item_name?.trim()) return setError('Item name is required.');

    const payload = {
      ...form,
      company_id: form.company_id || null,
      quantity: parseFloat(form.quantity) || 0,
      rate: parseFloat(form.rate) || 0,
      taxable_amount: parseFloat(form.taxable_amount) || 0,
      cgst_rate: parseFloat(form.cgst_rate) || 0,
      sgst_rate: parseFloat(form.sgst_rate) || 0,
      igst_rate: parseFloat(form.igst_rate) || 0,
      cgst_amount: parseFloat(form.cgst_amount) || 0,
      sgst_amount: parseFloat(form.sgst_amount) || 0,
      igst_amount: parseFloat(form.igst_amount) || 0,
      total_amount: parseFloat(form.total_amount) || 0,
    };

    try {
      if (isPurchase) {
        await window.pwp.purchases.add(payload);
      } else {
        await window.pwp.sales.add(payload);
      }
      setSaved(true);
      setTimeout(() => navigate('/doc-processor'), 900);
    } catch (err) {
      setError(err?.message || 'Failed to save record');
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 size={16} />
          Saved successfully. Redirecting…
        </div>
      )}

      {stage === 'upload' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="sm:w-52">
              <label className="block text-[11px] font-semibold tracking-wide text-slate-600 uppercase mb-1.5">
                Target Financial Year <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={financialYear}
                  onChange={(e) => setFinancialYear(e.target.value)}
                  className="input pl-9"
                >
                  {fyOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-xs text-amber-800 self-start sm:self-end">
              Match the FY printed on your invoice
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 hover:border-green-400 hover:bg-green-50/30 transition"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 flex-shrink-0">
                  <Upload size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    Drag &amp; drop files or folders here
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    PDF, JPG, PNG, or ZIP · up to 20MB each · unlimited files
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleSelectFiles}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 transition-colors"
                >
                  Browse files
                </button>
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5 transition-colors"
                >
                  <FolderOpen size={15} />
                  Browse folder
                </button>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.zip"
              multiple
              className="hidden"
              onChange={(e) => addBrowserFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Queue ({files.length})
              </p>
              {files.map((f, idx) => (
                <FileRow
                  key={`${f.name}-${idx}`}
                  file={f}
                  onRemove={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleExtract}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  Start extraction
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === 'processing' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center text-center">
          <Loader2 className="animate-spin text-green-600 mb-4" size={36} />
          <p className="text-base font-semibold text-slate-800">Extracting with Gemini…</p>
          <p className="text-sm text-slate-500 mt-1">{progress}</p>
        </div>
      )}

      {stage === 'review' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Review extracted data</h2>
            <p className="text-sm text-slate-500 mt-1">
              Edit fields if needed, then save to local DB ({isPurchase ? 'Procurement' : 'Post Consumer'}).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Company</label>
              <select name="company_id" value={form.company_id || ''} onChange={handleChange} className="input">
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Invoice No</label>
              <input name="invoice_no" value={form.invoice_no || ''} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">Invoice Date</label>
              <input type="date" name="invoice_date" value={form.invoice_date || ''} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">{isPurchase ? 'Vendor Name' : 'Customer Name'}</label>
              <input
                name={isPurchase ? 'vendor_name' : 'customer_name'}
                value={isPurchase ? form.vendor_name || '' : form.customer_name || ''}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">{isPurchase ? 'Vendor GSTIN' : 'Customer GSTIN'}</label>
              <input
                name={isPurchase ? 'vendor_gstin' : 'customer_gstin'}
                value={isPurchase ? form.vendor_gstin || '' : form.customer_gstin || ''}
                onChange={handleChange}
                className="input"
              />
            </div>
            <div>
              <label className="label">Item Name</label>
              <input name="item_name" value={form.item_name || ''} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">HSN Code</label>
              <input name="hsn_code" value={form.hsn_code || ''} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">Quantity</label>
              <input name="quantity" value={form.quantity || ''} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">Unit</label>
              <input name="unit" value={form.unit || 'PCS'} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">Rate</label>
              <input name="rate" value={form.rate || ''} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">Taxable Amount</label>
              <input name="taxable_amount" value={form.taxable_amount || ''} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">CGST %</label>
              <input name="cgst_rate" value={form.cgst_rate || '0'} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">SGST %</label>
              <input name="sgst_rate" value={form.sgst_rate || '0'} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">IGST %</label>
              <input name="igst_rate" value={form.igst_rate || '0'} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">Total Amount</label>
              <input name="total_amount" value={form.total_amount || ''} onChange={handleChange} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <input name="notes" value={form.notes || ''} onChange={handleChange} className="input" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setStage('upload')}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={handleSave}>
              Save {isPurchase ? 'Procurement' : 'Post Consumer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
