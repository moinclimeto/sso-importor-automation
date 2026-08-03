import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import InvoiceDetailsModal, {
  ViewInvoiceButton,
} from '../components/InvoiceDetailsModal.jsx';
import { getApi } from '../utils/pwpApi.js';
import { applyCompanyRoutingToResults } from '../utils/companyInvoiceMatch.js';
import { Toast, useToast } from '../components/Toast.jsx';
import ZipPreviewModal from '../components/ZipPreviewModal.jsx';
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
          {file.fromZip ? `From ${file.fromZip} · ` : ''}
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
function lineCount(row) {
  return Array.isArray(row?.data?.lineItems) ? row.data.lineItems.length : 0;
}

function resultOutcome(r) {
  if (r?.skipped) return 'skipped';
  if (!r?.ok) return 'failed';
  if (r?.rejected) return 'rejected';
  if (r?.saveError) return 'save_failed';
  if (r?.saved) return 'saved';
  if (r?.decidedType) return 'matched';
  return 'unknown';
}

function outcomeReason(r) {
  const outcome = resultOutcome(r);
  if (outcome === 'skipped') return r.message || 'Skipped (duplicate / already extracted)';
  if (outcome === 'failed') return r.message || 'OCR failed';
  if (outcome === 'rejected') return r.routing?.reason || 'Not matched to Company Profile';
  if (outcome === 'save_failed') return r.saveError || 'Save failed';
  if (outcome === 'saved') {
    const route = r.decidedType === 'purchase' ? 'Purchase' : 'Sale';
    const co = r.routing?.companyName ? ` · ${r.routing.companyName}` : '';
    return `Auto-saved to ${route}${co}`;
  }
  if (outcome === 'matched') return r.routing?.reason || 'Matched';
  return '—';
}

function outcomeBadge(outcome) {
  switch (outcome) {
    case 'saved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'rejected':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'failed':
    case 'save_failed':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'skipped':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function outcomeLabel(outcome, r) {
  if (outcome === 'saved') {
    return r?.decidedType === 'purchase' ? 'Saved · Purchase' : 'Saved · Sale';
  }
  if (outcome === 'save_failed') return 'Save failed';
  if (outcome === 'rejected') return 'Rejected';
  if (outcome === 'failed') return 'Failed';
  if (outcome === 'skipped') return 'Skipped';
  return outcome;
}
export default function DocUpload() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, showToast, hideToast } = useToast();
  const inputRef = useRef(null);
  const unsubRef = useRef(null);
  const fyOptions = useMemo(() => getFyOptions(), []);
  const [docType] = useState(location.state?.type === 'sale' ? 'sale' : 'purchase');
  const isPurchase = docType === 'purchase';
  const [financialYear, setFinancialYear] = useState('all');
  const [files, setFiles] = useState([]);
  const [fileStatus, setFileStatus] = useState({});
  const [stage, setStage] = useState('upload');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [pageJobs, setPageJobs] = useState([]);
  const [inspecting, setInspecting] = useState(false);
  const [zipPreview, setZipPreview] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [globalBankDetails, setGlobalBankDetails] = useState(null);

  const totalPages = useMemo(() => {
    if (pageJobs.length) return pageJobs.length;
    return files.reduce((sum, f) => sum + (Number(f.pageCount) || 1), 0);
  }, [files, pageJobs]);

  useEffect(() => {
    window.pwp?.settings?.get('global_bank_details').then(setGlobalBankDetails);
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
  const notifySkipped = (skipped = []) => {
    if (!skipped.length) return;
    const rar = skipped.filter((s) => /rar/i.test(s.reason || '') || /\.rar$/i.test(s.name || ''));
    const other = skipped.filter((s) => !rar.includes(s));
    if (rar.length) {
      const names = rar.slice(0, 3).map((s) => s.name).join(', ');
      showToast(
        `RAR skipped (${rar.length}): ${names}${rar.length > 3 ? '…' : ''}\nOnly ZIP archives are supported.`,
        'warning',
        { duration: 5000 }
      );
    }
    if (other.length) {
      const lines = other.slice(0, 4).map((s) => `• ${s.name}: ${s.reason}`).join('\n');
      showToast(
        `Skipped ${other.length} file(s)\n${lines}${other.length > 4 ? '\n…' : ''}`,
        'warning',
        { duration: 5500 }
      );
    }
  };

  const mergeIntoQueue = (incoming = []) => {
    if (!incoming.length) return 0;
    let addedCount = 0;
    let dupCount = 0;
    setFiles((prev) => {
      const getBase = (n) => String(n || '').replace(/\s*\(\d+\)\s*(?=\.\w+$)/, '').toLowerCase();
      const seen = new Set(prev.map((f) => String(f.path || f.name).toLowerCase()));
      const nameSeen = new Set(prev.map((f) => String(f.name).toLowerCase()));
      const sigSeen = new Set(prev.map((f) => `${f.size || 0}_${getBase(f.name)}`));
      
      const added = [];
      for (const f of incoming) {
        const pathKey = String(f.path || f.name).toLowerCase();
        const nameKey = String(f.name).toLowerCase();
        const sig = `${f.size || 0}_${getBase(f.name)}`;
        
        if (seen.has(pathKey) || nameSeen.has(nameKey) || sigSeen.has(sig)) {
          dupCount += 1;
          continue;
        }
        seen.add(pathKey);
        nameSeen.add(nameKey);
        sigSeen.add(sig);
        added.push({
          name: f.name,
          path: f.path || null,
          size: f.size || 0,
          fromZip: f.fromZip || null,
          zipEntry: f.zipEntry || null,
        });
      }
      addedCount = added.length;
      return added.length ? [...prev, ...added] : prev;
    });
    if (dupCount > 0) {
      showToast(
        `Duplicate file(s) skipped (${dupCount}) — already in queue.`,
        'warning',
        { duration: 4000 }
      );
    }
    return addedCount;
  };

  const ingestResolved = (resolved, { showZipModal = true } = {}) => {
    const nextFiles = resolved?.files || [];
    const skipped = resolved?.skipped || [];
    const zipSummaries = resolved?.zipSummaries || [];

    notifySkipped(skipped);

    if (showZipModal && zipSummaries.length) {
      setZipPreview({
        summaries: zipSummaries,
        skipped,
        pendingFiles: nextFiles,
      });
      return;
    }

    if (!nextFiles.length && !skipped.length) {
      showToast('No PDF / image / ZIP files found.', 'warning');
      return;
    }
    mergeIntoQueue(nextFiles);
  };

  const resolvePaths = async (paths) => {
    if (!paths?.length) return;
    if (!window.pwp?.ocr?.resolveUploads) {
      showToast('ZIP / upload resolve needs the Electron app.', 'error');
      return;
    }
    setResolving(true);
    try {
      const resolved = await window.pwp.ocr.resolveUploads(paths);
      ingestResolved(resolved, { showZipModal: false });
    } catch (err) {
      showToast(err?.message || 'Failed to read uploads', 'error');
    } finally {
      setResolving(false);
    }
  };

  const addBrowserFiles = async (list) => {
    const arr = Array.from(list || []);
    if (!arr.length) return;

    const paths = [];
    const noPath = [];
    for (const f of arr) {
      let realPath = f.path;
      if ((!realPath || realPath === '') && window.pwp?.webUtils?.getPathForFile) {
        try {
          realPath = window.pwp.webUtils.getPathForFile(f);
        } catch {
          realPath = null;
        }
      }
      if (realPath) paths.push(realPath);
      else noPath.push(f.name);
    }

    if (noPath.length) {
      const names = noPath.slice(0, 3).join(', ');
      showToast(
        `Could not read path for: ${names}${noPath.length > 3 ? '…' : ''}\nUse Browse inside the Electron app.`,
        'warning'
      );
    }
    if (!paths.length) return;
    await resolvePaths(paths);
  };

  const handleBrowse = async () => {
    if (!window.pwp?.ocr?.selectUploads && !window.pwp?.ocr?.selectFiles) {
      inputRef.current?.click();
      return;
    }
    try {
      const picker = window.pwp.ocr.selectUploads || window.pwp.ocr.selectFiles;
      const paths = await picker();
      if (!paths?.length) return;
      await resolvePaths(paths);
    } catch (err) {
      showToast(err?.message || 'Failed to browse uploads', 'error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    addBrowserFiles(e.dataTransfer.files);
  };

  const confirmZipPreview = () => {
    if (!zipPreview) return;
    mergeIntoQueue(zipPreview.pendingFiles || []);
    setZipPreview(null);
  };

  const buildSavePayload = (data, sourceRow) => {
    const lineItems = sourceRow?.data?.lineItems || data.lineItems || [];
    const extraction = sourceRow?.data?.extraction || data.extraction || null;
    const decided =
      sourceRow?.decidedType ||
      sourceRow?.routing?.decidedType ||
      (isPurchase ? 'purchase' : 'sale');
    const companyId =
      sourceRow?.data?.company_id ?? sourceRow?.routing?.companyId ?? null;
    const companyName =
      sourceRow?.data?.company_name || sourceRow?.routing?.companyName || '';
    const parties = sourceRow?.data?._parties || data._parties || {};

    if (decided === 'purchase') {
      const gst = String(
        data.supplier_gst_number || data.vendor_gstin || parties.sellerGst || ''
      )
        .trim()
        .toUpperCase();
      const isGst =
        data.is_supplier_gst_available === 'Yes' || data.is_supplier_gst_available === 'No'
          ? data.is_supplier_gst_available
          : gst
            ? 'Yes'
            : 'No';
      const supplierName =
        data.supplier_name || data.vendor_name || parties.sellerName || '';
      return {
        ...data,
        company_id: companyId,
        company_name: companyName,
        record_type: 'purchase_epr',
        is_supplier_gst_available: isGst,
        supplier_gst_number: gst,
        supplier_name: supplierName,
        buyer_gst: String(data.buyer_gst || parties.buyerGst || '').toUpperCase(),
        quantity_mt: parseFloat(data.quantity_mt) || 0,
        vendor_name: supplierName,
        vendor_gstin: gst,
        invoice_no: data.invoice_number || data.invoice_no,
        invoice_number: data.invoice_number || data.invoice_no,
        invoice_date: data.procurement_date || data.invoice_date,
        procurement_date: data.procurement_date || data.invoice_date,
        invoice_filename:
          data.invoice_filename || data.invoice_file_name || sourceRow?.fileName,
        quantity: parseFloat(data.quantity_mt) || 0,
        unit: 'MT',
        total_amount: sourceRow?.data?.total_amount || 0,
        lineItems,
        extraction,
        _routing: sourceRow?.routing || data._routing,
      };
    }

    const entityName =
      data.entity_name || data.customer_name || parties.buyerName || '';
      
    const matchedCompany = sourceRow?.routing?.company || null;
      
    return {
      ...data,
      company_id: companyId,
      company_name: companyName,
      record_type: 'sale_epr',
      entity_name: entityName,
      customer_name: entityName,
      customer_gstin: String(data.customer_gstin || parties.buyerGst || '').toUpperCase(),
      recycled_plastic_percent: parseFloat(data.recycled_plastic_percent) || 0,
      conversion_factor: parseFloat(data.conversion_factor) || 0,
      available_quantity_mt: parseFloat(data.available_quantity_mt) || 0,
      quantity_sold_mt: parseFloat(data.quantity_sold_mt || data.quantity_mt) || 0,
      gst_other_charges: parseFloat(data.gst_other_charges) || 0,
      account_number: String(data.account_number || globalBankDetails?.account_number || '').trim(),
      ifsc_code: String(data.ifsc_code || globalBankDetails?.ifsc_code || '').trim(),
      invoice_no:
        data.application_number ||
        data.invoice_number ||
        data.invoice_no ||
        data.invoice_file_name,
      application_number:
        data.application_number || data.invoice_number || data.invoice_no,
      invoice_file_name:
        data.invoice_file_name || data.invoice_filename || sourceRow?.fileName,
      quantity: parseFloat(data.quantity_sold_mt || data.quantity_mt) || 0,
      unit: 'MT',
      total_amount: parseFloat(data.gst_other_charges || data.total_amount) || 0,
      lineItems,
      extraction,
      _routing: sourceRow?.routing || data._routing,
    };
  };

  const validateRow = (data, sourceRow) => {
    const parties = sourceRow?.data?._parties || data._parties || {};
    const decided =
      sourceRow?.decidedType ||
      sourceRow?.routing?.decidedType ||
      (isPurchase ? 'purchase' : 'sale');
    if (sourceRow?.rejected) {
      return sourceRow?.routing?.reason || 'Invoice rejected — company not matched.';
    }
    if (decided === 'purchase') {
      if (!String(data.supplier_name || data.vendor_name || parties.sellerName || '').trim()) {
        return 'Name of Supplier is required.';
      }
      if (!String(data.invoice_number || data.invoice_no || '').trim()) {
        return 'Invoice Number is required.';
      }
      if (!(data.procurement_date || data.invoice_date)) {
        return 'Procurement Date is required.';
      }
      if (
        !String(
          data.invoice_filename || data.invoice_file_name || sourceRow?.fileName || ''
        ).trim()
      ) {
        return 'Invoice Filename is required.';
      }
    } else if (
      !String(
        data.invoice_file_name || data.invoice_filename || sourceRow?.fileName || ''
      ).trim()
    ) {
      return 'Invoice File Name is required.';
    }
    return '';
  };

  const autoSaveMatched = async (routed) => {
    const out = [];
    let savedPurchase = 0;
    let savedSale = 0;
    let saveFailed = 0;
    const grouped = new Map();
    const unGrouped = [];

    for (const r of routed) {
      if (!r?.ok || r.skipped || r.rejected) {
        out.push(r);
        continue;
      }
      const data = r.data || {};
      const v = validateRow(data, r);
      if (v) {
        saveFailed += 1;
        out.push({ ...r, saved: false, saveError: v });
        continue;
      }
      const payload = buildSavePayload(data, r);
      const decided = r.decidedType || (isPurchase ? 'purchase' : 'sale');
      const invNo = String(payload.invoice_no || '').trim().toLowerCase();
      const compId = payload.company_id || '';
      
      if (invNo && compId) {
        const dupKey = `${decided}_${compId}_${invNo}`;
        if (!grouped.has(dupKey)) grouped.set(dupKey, []);
        grouped.get(dupKey).push({ r, payload, decided });
      } else {
        unGrouped.push({ r, payload, decided });
      }
    }

    const processSave = async (item) => {
      try {
        if (item.decided === 'purchase') {
          await window.pwp.purchases.add(item.payload);
          savedPurchase += 1;
        } else {
          await window.pwp.sales.add(item.payload);
          savedSale += 1;
        }
        out.push({ ...item.r, saved: true, saveError: '' });
      } catch (err) {
        saveFailed += 1;
        out.push({ ...item.r, saved: false, saveError: err?.message || 'Save failed' });
      }
    };

    for (const item of unGrouped) {
      await processSave(item);
    }

    for (const [key, items] of grouped.entries()) {
      const first = items[0];
      if (items.length === 1) {
        await processSave(first);
        continue;
      }
      // Smart Merge for multi-page duplicates / continuations
      let mergedPayload = { ...first.payload };
      let allItems = [...(first.payload.lineItems || [])];
      let maxTotal = Number(first.payload.total_amount) || 0;
      let maxQty = Number(first.payload.quantity || first.payload.quantity_mt) || 0;
      
      const seenItemStrs = new Set(allItems.map(i => JSON.stringify({ ...i, lineNo: undefined })));

      for (let i = 1; i < items.length; i++) {
        const next = items[i];
        const nextTotal = Number(next.payload.total_amount) || 0;
        const nextQty = Number(next.payload.quantity || next.payload.quantity_mt) || 0;
        if (nextTotal > maxTotal) maxTotal = nextTotal;
        if (nextQty > maxQty) maxQty = nextQty;

        const nextItems = next.payload.lineItems || [];
        for (const item of nextItems) {
          const str = JSON.stringify({ ...item, lineNo: undefined });
          if (!seenItemStrs.has(str)) {
            allItems.push(item);
            seenItemStrs.add(str);
          }
        }
        // Mark subsequent pages as merged
        out.push({ ...next.r, skipped: true, saved: false, message: 'Merged into page 1' });
      }
      
      mergedPayload.total_amount = maxTotal;
      if (first.decided === 'purchase') {
         mergedPayload.quantity_mt = maxQty;
         mergedPayload.quantity = maxQty;
      } else {
         mergedPayload.quantity_sold_mt = maxQty;
         mergedPayload.quantity = maxQty;
      }
      
      // Fix line numbers
      mergedPayload.lineItems = allItems.map((item, idx) => ({ ...item, lineNo: idx + 1 }));
      
      await processSave({ ...first, payload: mergedPayload });
    }

    return { results: out, savedPurchase, savedSale, saveFailed };
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
    setSaving(false);
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
      const rawResults = batch.results || [];
      let companies = [];
      try {
        companies = (await getApi().companies.getAll()) || [];
      } catch {
        companies = [];
      }
      const routed = applyCompanyRoutingToResults(rawResults, companies);

      setProgress((prev) => ({
        ...(prev || {}),
        trackId: batch.trackId || prev?.trackId,
        stage: 'saving',
        message: 'Matching company & auto-saving…',
      }));
      setSaving(true);
      const {
        results: finalResults,
        savedPurchase,
        savedSale,
        saveFailed,
      } = await autoSaveMatched(routed);
      setSaving(false);

      for (const r of finalResults) {
        const outcome = resultOutcome(r);
        if (outcome === 'saved') {
          nextStatus[r.fileName] = {
            label: outcomeReason(r),
            tone: 'ok',
          };
        } else if (outcome === 'rejected') {
          nextStatus[r.fileName] = {
            label: `Rejected · ${outcomeReason(r)}`,
            tone: 'fail',
          };
        } else if (outcome === 'save_failed') {
          nextStatus[r.fileName] = {
            label: `Save failed · ${outcomeReason(r)}`,
            tone: 'fail',
          };
        } else if (outcome === 'failed') {
          nextStatus[r.fileName] = {
            label: `Failed · ${outcomeReason(r)}`,
            tone: 'fail',
          };
        } else if (outcome === 'skipped') {
          nextStatus[r.fileName] = {
            label: outcomeReason(r),
            tone: 'skip',
          };
        }
      }
      setFileStatus(nextStatus);
      setResults(finalResults);
      setSavedCount(savedPurchase + savedSale);
      setStage('results');
      const dupSkipped = finalResults.filter(
        (r) =>
          r?.skipped &&
          /(duplicate|already extracted)/i.test(String(r.message || r.reason || ''))
      );
      if (dupSkipped.length) {
        const names = dupSkipped.slice(0, 4).map((r) => `• ${r.fileName || 'file'}`).join('\n');
        showToast(
          `Duplicate invoice(s) skipped (${dupSkipped.length})\n${names}${dupSkipped.length > 4 ? '\n…' : ''}`,
          'warning',
          { duration: 5500 }
        );
      }
      setProgress((prev) => ({
        ...(prev || {}),
        trackId: batch.trackId || prev?.trackId,
        stage: 'complete',
        message: `Done · Saved ${savedPurchase + savedSale} · Purchase ${savedPurchase} · Sale ${savedSale}${
          saveFailed ? ` · Save failed ${saveFailed}` : ''
        }`,
      }));

      if (!companies.length) {
        setError(
          'No companies in Company Profile. Add company (GST / PAN / name) so invoices can be matched.'
        );
      } else if (
        !finalResults.some((r) => r.ok && !r.skipped) &&
        !finalResults.some((r) => r.skipped)
      ) {
        setError(
          `No invoices extracted. trackId: ${batch.trackId || '—'} · check Gemini key / QR scanner.`
        );
      } else {
        setError('');
      }
    } catch (err) {
      setStage('upload');
      setSaving(false);
      setError(err?.message || 'Batch extraction failed');
    } finally {
      if (typeof unsubRef.current === 'function') {
        unsubRef.current();
        unsubRef.current = null;
      }
    }
  };

  const savedResults = results.filter((r) => resultOutcome(r) === 'saved');
  const failResults = results.filter((r) => resultOutcome(r) === 'failed');
  const skippedResults = results.filter((r) => resultOutcome(r) === 'skipped');
  const rejectedResults = results.filter((r) => resultOutcome(r) === 'rejected');
  const saveFailedResults = results.filter((r) => resultOutcome(r) === 'save_failed');
  const purchaseSaved = savedResults.filter((r) => r.decidedType === 'purchase').length;
  const saleSaved = savedResults.filter((r) => r.decidedType === 'sale').length;

  return (
    <div className="space-y-3 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {isPurchase ? 'Procurement' : 'Post Consumer'} · multi-invoice
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
      {savedCount > 0 && stage === 'results' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 size={16} />
          Auto-saved {savedCount} record(s) to table
          {purchaseSaved || saleSaved
            ? ` (Purchase ${purchaseSaved} · Sale ${saleSaved})`
            : ''}
          .
        </div>
      )}
      {(stage === 'upload' || stage === 'processing') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
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
            
            {stage === 'upload' && files.length > 0 && (
              <button
                type="button"
                onClick={handleExtract}
                disabled={inspecting || !totalPages}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-60 h-10 px-6"
              >
                <Sparkles size={16} />
                Start extraction ({totalPages} page{totalPages === 1 ? '' : 's'})
              </button>
            )}
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
                    Drag &amp; drop files, folder, or ZIP
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Auto-detects PDF / images / ZIP / folder · RAR skipped
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={stage === 'processing' || resolving}
                  onClick={handleBrowse}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
                >
                  <Upload size={15} />
                  Browse
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
          {stage === 'processing' && <ProgressPanel progress={progress} />}
          {resolving && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin text-green-600" />
              Reading ZIP / files…
            </div>
          )}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Queue · {files.length} file{files.length === 1 ? '' : 's'} ·{' '}
                  <span className="text-slate-800 normal-case font-bold tracking-normal">
                    {inspecting ? '…' : totalPages} page{totalPages === 1 ? '' : 's'}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={stage === 'processing'}
                  onClick={() => setFiles([])}
                  className="text-[11px] font-medium text-red-500 hover:text-red-600 hover:underline disabled:opacity-50 transition"
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
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
              </div>
              {stage === 'processing' && (
                <div className="flex flex-col items-center gap-2 pt-4">
                  <Loader2 className="animate-spin text-green-600" size={28} />
                  {saving && (
                    <p className="text-xs text-slate-500">Auto-saving matched invoices…</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {stage === 'results' && (
        <div className="space-y-4">
          <ProgressPanel progress={progress} />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
                Processed
              </p>
              <p className="text-2xl font-semibold text-emerald-800 tabular-nums mt-1">
                {savedResults.length}
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                P {purchaseSaved} · S {saleSaved}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold">
                Rejected
              </p>
              <p className="text-2xl font-semibold text-amber-900 tabular-nums mt-1">
                {rejectedResults.length}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/60 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-red-700 font-semibold">
                Failed
              </p>
              <p className="text-2xl font-semibold text-red-800 tabular-nums mt-1">
                {failResults.length + saveFailedResults.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-600 font-semibold">
                Skipped
              </p>
              <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">
                {skippedResults.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-600 font-semibold">
                Total
              </p>
              <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">
                {results.length}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Processing summary</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Matched invoices auto-saved · others listed with reason
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
                    setSavedCount(0);
                    setError('');
                  }}
                >
                  New batch
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate('/doc-table', { state: { type: docType } })}
                >
                  Open table
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[780px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="th">#</th>
                    <th className="th">File</th>
                    <th className="th">Invoice</th>
                    <th className="th">Status</th>
                    <th className="th">Reason</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const d = r.data || {};
                    const invNo =
                      d.invoice_number || d.invoice_no || d.application_number;
                    const outcome = resultOutcome(r);
                    return (
                      <tr
                        key={`${r.fileName}-${i}`}
                        className="border-b border-slate-100 hover:bg-slate-50/60"
                      >
                        <td className="td">{i + 1}</td>
                        <td className="td max-w-[200px] truncate" title={r.fileName}>
                          {r.fileName}
                        </td>
                        <td className="td font-mono text-xs">{invNo || '—'}</td>
                        <td className="td">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border ${outcomeBadge(outcome)}`}
                          >
                            {outcomeLabel(outcome, r)}
                          </span>
                        </td>
                        <td className="td text-xs text-slate-600 max-w-[320px]">
                          <span title={outcomeReason(r)}>{outcomeReason(r)}</span>
                        </td>
                        <td className="td text-right">
                          {r.ok && !r.skipped ? (
                            <ViewInvoiceButton
                              onClick={() => setDetailRow(r)}
                              disabled={!lineCount(r)}
                              title={
                                lineCount(r)
                                  ? 'View invoice + line items'
                                  : 'No line items'
                              }
                            />
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!results.length && (
                    <tr>
                      <td colSpan={6} className="td text-center text-slate-500 py-8">
                        No results
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <ZipPreviewModal
        open={Boolean(zipPreview)}
        summaries={zipPreview?.summaries}
        skipped={zipPreview?.skipped}
        onConfirm={confirmZipPreview}
        onCancel={() => setZipPreview(null)}
      />
      <Toast toast={toast} onClose={hideToast} />
      <InvoiceDetailsModal
        open={Boolean(detailRow)}
        invoice={detailRow}
        docType={detailRow?.decidedType || docType}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}
