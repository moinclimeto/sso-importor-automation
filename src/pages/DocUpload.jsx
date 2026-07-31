import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import {
  SALE_TABLE_COLUMNS,
  PURCHASE_TABLE_COLUMNS,
} from '../utils/excelImport.js';
import InvoiceDetailsModal, {
  ViewInvoiceButton,
} from '../components/InvoiceDetailsModal.jsx';
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
function FileRow({ file, onRemove, status, statusTone }) {
  const tone =
    statusTone === 'ok'
      ? 'text-green-600'
      : statusTone === 'fail'
        ? 'text-red-600'
        : statusTone === 'skip'
          ? 'text-slate-500'
          : statusTone === 'run'
            ? 'text-amber-600'
            : 'text-slate-400';
  const pages = Number(file.pageCount) || 1;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
          statusTone === 'ok'
            ? 'bg-green-50 text-green-700'
            : statusTone === 'fail'
              ? 'bg-red-50 text-red-600'
              : statusTone === 'skip'
                ? 'bg-slate-100 text-slate-500'
                : 'bg-green-50 text-green-700'
        }`}
      >
        {statusTone === 'ok' ? (
          <CheckCircle2 size={18} />
        ) : statusTone === 'fail' ? (
          <XCircle size={18} />
        ) : (
          <FileText size={18} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
        <p className={`text-xs ${tone}`}>
          {pages} page{pages === 1 ? '' : 's'}
          {file.size ? ` · ${(file.size / 1024).toFixed(1)} KB` : ''}
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

function ProgressPanel({ progress }) {
  if (!progress) return null;
  const total = Math.max(
    0,
    Number(progress.total || progress.totalPages || 0)
  );
  const current = Math.max(0, Number(progress.current || 0));
  const processed = Math.max(0, Number(progress.processed || 0));
  const displayCount =
    progress.stage === 'complete' ? processed : current || processed;
  const percent =
    total > 0
      ? Math.min(
          100,
          Math.round(
            ((progress.stage === 'complete' ? processed : current) / total) * 100
          )
        )
      : 0;
  const done = progress.stage === 'complete';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-800">{progress.message}</span>
        <span className="text-slate-500 tabular-nums font-medium">
          {displayCount}/{total || '—'} pages
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-600' : 'bg-green-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {progress.trackId ? (
        <p className="text-[10px] font-mono text-slate-400 truncate" title={progress.trackId}>
          trackId: {progress.trackId}
        </p>
      ) : null}
      {(progress.fileCount != null || progress.totalPages != null) && (
        <p className="text-[11px] text-slate-400">
          {progress.fileCount != null ? `${progress.fileCount} file(s)` : ''}
          {progress.fileCount != null && progress.totalPages != null ? ' · ' : ''}
          {progress.totalPages != null ? `${progress.totalPages} page(s) total` : ''}
        </p>
      )}
      {progress.currentFile ? (
        <p className="text-xs text-slate-500 truncate" title={progress.currentFile}>
          {done ? 'Last' : 'Processing'}: {progress.currentFile}
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        {Number(progress.successCount || 0)} success
        {Number(progress.failedCount || 0) > 0 ? ` · ${progress.failedCount} failed` : ''}
        {Number(progress.skippedCount || 0) > 0 ? ` · ${progress.skippedCount} skipped` : ''}
      </p>
    </div>
  );
}
function emptyPurchase() {
  return {
    category_of_plastic: '',
    supplier_name: '',
    address_line_1: '',
    address_line_2: '',
    state: '',
    city: '',
    pin_code: '',
    is_supplier_gst_available: 'No',
    supplier_gst_number: '',
    supplier_mobile_number: '',
    procurement_date: '',
    quantity_mt: '',
    invoice_number: '',
    hsn_code: '',
    invoice_filename: '',
  };
}
function emptySale() {
  return {
    s_no: '1',
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
  };
}
function lineCount(row) {
  return Array.isArray(row?.data?.lineItems) ? row.data.lineItems.length : 0;
}
export default function DocUpload() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const unsubRef = useRef(null);
  const fyOptions = useMemo(() => getFyOptions(), []);
  const [docType] = useState(location.state?.type === 'sale' ? 'sale' : 'purchase');
  const isPurchase = docType === 'purchase';
  const columns = isPurchase ? PURCHASE_TABLE_COLUMNS : SALE_TABLE_COLUMNS;
  const [financialYear, setFinancialYear] = useState('all');
  const [files, setFiles] = useState([]);
  const [fileStatus, setFileStatus] = useState({});
  const [stage, setStage] = useState('upload');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [form, setForm] = useState(isPurchase ? emptyPurchase() : emptySale());
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [pageJobs, setPageJobs] = useState([]);
  const [inspecting, setInspecting] = useState(false);

  const totalPages = useMemo(() => {
    if (pageJobs.length) return pageJobs.length;
    return files.reduce((sum, f) => sum + (Number(f.pageCount) || 1), 0);
  }, [files, pageJobs]);

  useEffect(() => {
    return () => {
      if (typeof unsubRef.current === 'function') unsubRef.current();
    };
  }, []);

  // Count PDF pages whenever queue files change (10+1 => 11 pages)
  useEffect(() => {
    let cancelled = false;
    const paths = files.map((f) => f.path).filter(Boolean);
    if (!paths.length) {
      setPageJobs([]);
      return undefined;
    }
    if (!window.pwp?.ocr?.inspectPaths) {
      setPageJobs(
        files.map((f) => ({
          displayName: f.name,
          sourceFileName: f.name,
          pageNumber: 1,
          pageCount: 1,
          filePath: f.path,
        }))
      );
      return undefined;
    }
    setInspecting(true);
    window.pwp.ocr
      .inspectPaths(paths)
      .then((info) => {
        if (cancelled) return;
        setPageJobs(info?.jobs || []);
        setFiles((prev) =>
          prev.map((f) => {
            const meta = (info?.files || []).find(
              (x) => x.path === f.path || x.name === f.name
            );
            return { ...f, pageCount: meta?.pageCount || f.pageCount || 1 };
          })
        );
      })
      .catch(() => {
        if (!cancelled) setPageJobs([]);
      })
      .finally(() => {
        if (!cancelled) setInspecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [files.map((f) => f.path || f.name).join('|')]);
  const addBrowserFiles = (list) => {
    const next = Array.from(list || [])
      .filter((f) => {
        const name = f.name.toLowerCase();
        return (
          name.endsWith('.pdf') ||
          name.endsWith('.png') ||
          name.endsWith('.jpg') ||
          name.endsWith('.jpeg') ||
          name.endsWith('.webp')
        );
      })
      .map((f) => ({
        name: f.name,
        path: f.path || null,
        size: f.size,
        file: f,
      }));
    if (!next.length) {
      setError('Please select PDF, JPG, or PNG files.');
      return;
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => String(f.name).toLowerCase()));
      const added = [];
      for (const f of next) {
        const key = String(f.name).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        added.push(f);
      }
      if (!added.length) {
        setError('Duplicate file(s) already in queue — skipped.');
        return prev;
      }
      setError('');
      return [...prev, ...added];
    });
  };
  const handleSelectFiles = async () => {
    if (!window.pwp?.ocr?.selectFiles) {
      inputRef.current?.click();
      return;
    }
    try {
      const paths = await window.pwp.ocr.selectFiles();
      if (!paths?.length) return;
      setFiles((prev) => {
        const seen = new Set(prev.map((f) => String(f.name).toLowerCase()));
        const added = [];
        for (const p of paths) {
          const name = p.split(/[/\\]/).pop();
          const key = String(name).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          added.push({ name, path: p, size: 0 });
        }
        if (!added.length) {
          setError('Duplicate file(s) already in queue — skipped.');
          return prev;
        }
        setError('');
        return [...prev, ...added];
      });
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
      setFiles((prev) => {
        const seen = new Set(prev.map((f) => String(f.name).toLowerCase()));
        const added = [];
        for (const p of paths) {
          const name = p.split(/[/\\]/).pop();
          const key = String(name).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          added.push({ name, path: p, size: 0 });
        }
        if (!added.length) {
          setError('Duplicate file(s) already in queue — skipped.');
          return prev;
        }
        setError('');
        return [...prev, ...added];
      });
    } catch (err) {
      setError(err?.message || 'Failed to select folder');
    }
  };
  const handleDrop = (e) => {
    e.preventDefault();
    addBrowserFiles(e.dataTransfer.files);
  };
  const loadFormFromResult = (row) => {
    if (!row?.data) {
      setForm(isPurchase ? emptyPurchase() : emptySale());
      return;
    }
    const d = row.data;
    if (isPurchase) {
      setForm({
        ...emptyPurchase(),
        ...Object.fromEntries(
          PURCHASE_TABLE_COLUMNS.map((c) => [
            c.key,
            d[c.key] === undefined || d[c.key] === null ? '' : String(d[c.key]),
          ])
        ),
      });
    } else {
      setForm({
        ...emptySale(),
        ...Object.fromEntries(
          SALE_TABLE_COLUMNS.map((c) => [
            c.key,
            d[c.key] === undefined || d[c.key] === null ? '' : String(d[c.key]),
          ])
        ),
      });
    }
  };
  const handleExtract = async () => {
    if (!files.length) {
      setError('Please upload at least one document.');
      return;
    }
    if (!window.pwp?.ocr?.extractBatch) {
      setError('OCR extraction needs the Electron app. Run with npm run electron:dev');
      return;
    }
    const targets = files.filter((f) => f.path);
    if (!targets.length) {
      setError('Please select files using Browse inside the Electron app (paths required).');
      return;
    }
    setStage('processing');
    setError('');
    setSavedCount(0);
    setResults([]);
    setDetailRow(null);
    setProgress({
      stage: 'start',
      total: totalPages || targets.length,
      processed: 0,
      current: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      message: `Starting queue · ${totalPages || targets.length} page(s)…`,
      currentFile: '',
      trackId: '',
      totalPages: totalPages || targets.length,
      fileCount: targets.length,
    });
    const statusMap = {};
    // Seed status for every page job (not just files)
    const jobs =
      pageJobs.length > 0
        ? pageJobs
        : targets.map((f) => ({
            displayName: f.name,
            sourceFileName: f.name,
          }));
    jobs.forEach((j) => {
      statusMap[j.displayName || j.sourceFileName] = {
        label: 'Queued',
        tone: 'run',
      };
    });
    targets.forEach((f) => {
      statusMap[f.name] = {
        label: `${f.pageCount || 1} page(s) queued`,
        tone: 'run',
      };
    });
    setFileStatus(statusMap);
    if (typeof unsubRef.current === 'function') unsubRef.current();
    if (window.pwp.ocr.onProgress) {
      unsubRef.current = window.pwp.ocr.onProgress((p) => {
        setProgress(p);
        if (p.fileStatus?.fileName) {
          setFileStatus((prev) => {
            const next = {
              ...prev,
              [p.fileStatus.fileName]: {
                label: p.fileStatus.label,
                tone: p.fileStatus.tone || 'run',
              },
            };
            // Also roll up status onto source PDF name
            const src = p.fileStatus.sourceFileName || p.pageInfo?.sourceFileName;
            if (src && src !== p.fileStatus.fileName) {
              next[src] = {
                label: p.fileStatus.label,
                tone: p.fileStatus.tone || 'run',
              };
            }
            return next;
          });
        }
      });
    }
    try {
      const batch = await window.pwp.ocr.extractBatch({
        filePaths: targets.map((t) => t.path),
        type: docType,
        financialYear,
      });
      const nextStatus = { ...statusMap };
      for (const r of batch.results || []) {
        if (r.skipped) {
          nextStatus[r.fileName] = {
            label: r.message || 'Skipped',
            tone: 'skip',
          };
        } else if (r.ok) {
          const lines = lineCount(r);
          nextStatus[r.fileName] = {
            label: `Success · ${r.qr?.priorityApplied ? 'QR+OCR · ' : ''}${lines} line(s)`,
            tone: 'ok',
          };
        } else {
          nextStatus[r.fileName] = {
            label: `Failed · ${r.message || 'error'}`,
            tone: 'fail',
          };
        }
      }
      setFileStatus(nextStatus);
      const okRows = (batch.results || []).filter((r) => r.ok && !r.skipped);
      setResults(batch.results || []);
      setActiveIdx(0);
      if (okRows[0]) loadFormFromResult(okRows[0]);
      setStage('results');
      if (batch.trackId) {
        setProgress((prev) => ({ ...(prev || {}), trackId: batch.trackId, stage: 'complete' }));
      }
      if (!okRows.length) {
        const skipped = Number(batch.skippedCount || 0);
        setError(
          skipped
            ? `No new invoices extracted · ${skipped} duplicate/already-extracted skipped. trackId: ${batch.trackId || '—'}`
            : `No invoices extracted. trackId: ${batch.trackId || '—'} · check Gemini key / QR scanner.`
        );
      }
    } catch (err) {
      setStage('upload');
      setError(err?.message || 'Batch extraction failed');
    } finally {
      if (typeof unsubRef.current === 'function') {
        unsubRef.current();
        unsubRef.current = null;
      }
    }
  };
  const okResults = results.filter((r) => r.ok && !r.skipped);
  const failResults = results.filter((r) => !r.ok && !r.skipped);
  const skippedResults = results.filter((r) => r.skipped);
  const selectResult = (idxInOk) => {
    setActiveIdx(idxInOk);
    loadFormFromResult(okResults[idxInOk]);
  };
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const buildSavePayload = (data, sourceRow) => {
    const lineItems = sourceRow?.data?.lineItems || data.lineItems || [];
    const extraction = sourceRow?.data?.extraction || data.extraction || null;
    if (isPurchase) {
      const gst = String(data.supplier_gst_number || '').trim().toUpperCase();
      const isGst =
        data.is_supplier_gst_available === 'Yes' || data.is_supplier_gst_available === 'No'
          ? data.is_supplier_gst_available
          : gst
            ? 'Yes'
            : 'No';
      return {
        ...data,
        company_id: null,
        record_type: 'purchase_epr',
        is_supplier_gst_available: isGst,
        supplier_gst_number: gst,
        quantity_mt: parseFloat(data.quantity_mt) || 0,
        vendor_name: data.supplier_name,
        vendor_gstin: gst,
        invoice_no: data.invoice_number,
        invoice_date: data.procurement_date,
        quantity: parseFloat(data.quantity_mt) || 0,
        unit: 'MT',
        total_amount: sourceRow?.data?.total_amount || 0,
        lineItems,
        extraction,
      };
    }
    return {
      ...data,
      company_id: null,
      record_type: 'sale_epr',
      recycled_plastic_percent: parseFloat(data.recycled_plastic_percent) || 0,
      conversion_factor: parseFloat(data.conversion_factor) || 0,
      available_quantity_mt: parseFloat(data.available_quantity_mt) || 0,
      quantity_sold_mt: parseFloat(data.quantity_sold_mt) || 0,
      gst_other_charges: parseFloat(data.gst_other_charges) || 0,
      customer_name: data.entity_name,
      invoice_no: data.application_number || data.invoice_file_name,
      quantity: parseFloat(data.quantity_sold_mt) || 0,
      unit: 'MT',
      total_amount: parseFloat(data.gst_other_charges) || 0,
      lineItems,
      extraction,
    };
  };
  const validateForm = (data) => {
    if (isPurchase) {
      if (!data.supplier_name?.trim()) return 'Name of Supplier is required.';
      if (!data.invoice_number?.trim()) return 'Invoice Number is required.';
      if (!data.procurement_date) return 'Procurement Date is required.';
      if (!data.invoice_filename?.trim()) return 'Invoice Filename is required.';
      const isGst = data.is_supplier_gst_available === 'Yes' ? 'Yes' : 'No';
      if (isGst === 'Yes' && !data.supplier_gst_number?.trim()) {
        return 'Supplier GST Number is required when GST Available is Yes.';
      }
      if (isGst === 'No' && !data.supplier_mobile_number?.trim()) {
        return 'Supplier Mobile is required when GST is unavailable.';
      }
    } else if (!data.entity_name?.trim()) {
      return 'Name of the Entity is required.';
    } else if (!data.invoice_file_name?.trim()) {
      return 'Invoice File Name is required.';
    }
    return '';
  };
  const handleSaveCurrent = async () => {
    setError('');
    const v = validateForm(form);
    if (v) return setError(v);
    setSaving(true);
    try {
      const payload = buildSavePayload(form, okResults[activeIdx]);
      if (isPurchase) await window.pwp.purchases.add(payload);
      else await window.pwp.sales.add(payload);
      setSavedCount((c) => c + 1);
      if (activeIdx < okResults.length - 1) selectResult(activeIdx + 1);
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAll = async () => {
    setError('');
    setSaving(true);
    let saved = 0;
    try {
      for (let i = 0; i < okResults.length; i += 1) {
        const data =
          i === activeIdx
            ? form
            : Object.fromEntries(
                columns.map((c) => [
                  c.key,
                  okResults[i].data?.[c.key] === undefined || okResults[i].data?.[c.key] === null
                    ? ''
                    : String(okResults[i].data[c.key]),
                ])
              );
        const v = validateForm(data);
        if (v) {
          setActiveIdx(i);
          loadFormFromResult(okResults[i]);
          setError(`File ${okResults[i].fileName}: ${v}`);
          setSaving(false);
          return;
        }
        const payload = buildSavePayload(data, okResults[i]);
        if (isPurchase) await window.pwp.purchases.add(payload);
        else await window.pwp.sales.add(payload);
        saved += 1;
      }
      setSavedCount(saved);
      setTimeout(() => navigate('/doc-table', { state: { type: docType } }), 800);
    } catch (err) {
      setError(err?.message || 'Save all failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {isPurchase ? 'Procurement' : 'Post Consumer'} · multi-invoice
          </p>
          <p className="text-sm text-slate-500 mt-0.5">
            Compact Gemini · line items · QR overrides OCR when present
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/doc-table', { state: { type: docType } })}
          className="text-sm text-green-600 hover:text-green-700 font-medium"
        >
          View table →
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedCount > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 size={16} />
          Saved {savedCount} record(s).
        </div>
      )}
      {(stage === 'upload' || stage === 'processing') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="sm:w-52">
            <label className="block text-[11px] font-semibold tracking-wide text-slate-600 uppercase mb-1.5">
              Target Financial Year
            </label>
            <div className="relative">
              <Calendar
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <select
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                disabled={stage === 'processing'}
                className="input pl-9"
              >
                {fyOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={stage === 'processing' ? undefined : handleDrop}
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 hover:border-green-400 hover:bg-green-50/30 transition"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 flex-shrink-0">
                  <Upload size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    Drag &amp; drop multiple invoices
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    PDF / JPG / PNG · batch extract with live progress
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={stage === 'processing'}
                  onClick={handleSelectFiles}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
                >
                  Browse files
                </button>
                <button
                  type="button"
                  disabled={stage === 'processing'}
                  onClick={handleSelectFolder}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5 disabled:opacity-60"
                >
                  <FolderOpen size={15} />
                  Browse folder
                </button>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              multiple
              className="hidden"
              onChange={(e) => addBrowserFiles(e.target.files)}
            />
          </div>
          {stage === 'processing' && <ProgressPanel progress={progress} />}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Queue · {files.length} file{files.length === 1 ? '' : 's'} ·{' '}
                  <span className="text-slate-800 normal-case font-bold tracking-normal">
                    {inspecting ? '…' : totalPages} page{totalPages === 1 ? '' : 's'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  Multi-page PDF = multiple invoices (1 page each)
                </p>
              </div>
              {files.map((f, idx) => (
                <FileRow
                  key={`${f.name}-${idx}`}
                  file={f}
                  status={fileStatus[f.name]?.label}
                  statusTone={fileStatus[f.name]?.tone}
                  onRemove={
                    stage === 'processing'
                      ? undefined
                      : () => setFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                />
              ))}
              {stage === 'upload' && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={inspecting || !totalPages}
                    className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    <Sparkles size={16} />
                    Start extraction ({totalPages} page{totalPages === 1 ? '' : 's'})
                  </button>
                </div>
              )}
              {stage === 'processing' && (
                <div className="flex justify-center pt-4">
                  <Loader2 className="animate-spin text-green-600" size={28} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {stage === 'results' && (
        <div className="space-y-4">
          <ProgressPanel progress={progress} />
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Extracted invoices</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {okResults.length} ready · {failResults.length} failed
                  {skippedResults.length ? ` · ${skippedResults.length} skipped` : ''}
                  {' '}· use View for line items
                  {progress?.trackId ? (
                    <span className="block text-[10px] font-mono text-slate-400 mt-1">
                      trackId: {progress.trackId}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setStage('upload');
                    setResults([]);
                    setProgress(null);
                  }}
                >
                  New batch
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || !okResults.length}
                  onClick={handleSaveAll}
                >
                  {saving ? 'Saving…' : `Save all (${okResults.length})`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="th">#</th>
                    <th className="th">File</th>
                    <th className="th">Invoice / App No</th>
                    <th className="th">Party</th>
                    <th className="th">Date</th>
                    <th className="th text-right">Lines</th>
                    <th className="th">Source</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {okResults.map((r, i) => {
                    const d = r.data || {};
                    const invNo = isPurchase
                      ? d.invoice_number || d.invoice_no
                      : d.application_number || d.invoice_no;
                    const party = isPurchase
                      ? d.supplier_name || d.vendor_name
                      : d.entity_name || d.customer_name;
                    const date = d.procurement_date || d.invoice_date;
                    return (
                      <tr
                        key={`${r.fileName}-${i}`}
                        className={`border-b border-slate-100 hover:bg-slate-50/60 ${
                          i === activeIdx ? 'bg-green-50/40' : ''
                        }`}
                      >
                        <td className="td">{i + 1}</td>
                        <td className="td max-w-[180px] truncate" title={r.fileName}>
                          {r.fileName}
                        </td>
                        <td className="td font-mono text-xs">{invNo || '—'}</td>
                        <td className="td max-w-[160px] truncate">{party || '—'}</td>
                        <td className="td whitespace-nowrap">{date || '—'}</td>
                        <td className="td text-right tabular-nums">{lineCount(r)}</td>
                        <td className="td">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              r.qr?.priorityApplied
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.qr?.priorityApplied ? 'QR + OCR' : 'OCR'}
                          </span>
                        </td>
                        <td className="td text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <ViewInvoiceButton
                              onClick={() => setDetailRow(r)}
                              disabled={!lineCount(r)}
                              title={
                                lineCount(r)
                                  ? 'View invoice + line items'
                                  : 'No line items'
                              }
                            />
                            <button
                              type="button"
                              onClick={() => selectResult(i)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!okResults.length && (
                    <tr>
                      <td colSpan={8} className="td text-center text-slate-500 py-8">
                        No successful extractions
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {failResults.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 space-y-1 bg-red-50/40">
                {failResults.map((r) => (
                  <p key={r.fileName} className="text-xs text-red-700 flex items-center gap-1.5">
                    <XCircle size={12} />
                    {r.fileName}: {r.message}
                    {r.trackId ? ` · ${r.trackId}` : ''}
                  </p>
                ))}
              </div>
            )}
            {skippedResults.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 space-y-1 bg-slate-50">
                {skippedResults.map((r) => (
                  <p key={`skip-${r.fileName}`} className="text-xs text-slate-600">
                    Skipped · {r.fileName}: {r.message}
                  </p>
                ))}
              </div>
            )}
          </div>
          {okResults.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Edit · {okResults[activeIdx]?.fileName || 'invoice'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {lineCount(okResults[activeIdx])} line item(s) · fields marked “from QR” win
                    over OCR
                  </p>
                </div>
                <ViewInvoiceButton
                  onClick={() => setDetailRow(okResults[activeIdx])}
                  disabled={!lineCount(okResults[activeIdx])}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={
                      col.key === 'address' || col.key === 'address_line_1' ? 'sm:col-span-2' : ''
                    }
                  >
                    <label className="label">{col.label}</label>
                    {col.key === 'is_supplier_gst_available' ? (
                      <select
                        name={col.key}
                        value={form[col.key] || 'No'}
                        onChange={handleChange}
                        className="input"
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : col.key === 'procurement_date' ? (
                      <input
                        type="date"
                        name={col.key}
                        value={form[col.key] || ''}
                        onChange={handleChange}
                        className="input"
                      />
                    ) : (
                      <input
                        name={col.key}
                        value={form[col.key] || ''}
                        onChange={handleChange}
                        className="input"
                      />
                    )}
                    {okResults[activeIdx]?.data?._source_fields?.[col.key] === 'qr' && (
                      <p className="text-[10px] text-green-600 mt-0.5">from QR</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={handleSaveCurrent}
                >
                  Save this invoice
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={handleSaveAll}
                >
                  Save all
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <InvoiceDetailsModal
        open={Boolean(detailRow)}
        invoice={detailRow}
        docType={docType}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}
