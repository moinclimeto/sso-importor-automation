import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
  XCircle,
  AlertCircle,
} from 'lucide-react';

import {
  buildRegistrationDataFromDocuments,
} from '../utils/registrationDataMapper.js';
import {
  normalizeCompanyDocumentExtraction,
  resolveGstDocType,
} from '../utils/companyDocNormalize.js';
import ReadinessGuidelinesModal from './ReadinessGuidelinesModal.jsx';

const REGISTRATION_DOC_TYPES = new Set([
  'gst', 'person_pan', 'company_pan', 'cto', 'cin', 'udyam', 'iec',
  'unit_gst', 'supporting_category_doc', 'operations_details',
  'plastic_packaging_picture', 'covering_letter', 'signature', 'self_declaration'
]);

const DOC_TYPE_LABELS = {
  gst: 'Company GST',
  unit_gst: 'Unit GST',
  person_pan: 'Person PAN',
  company_pan: 'Company PAN',
  cto: 'CTO Certificate',
  cin: 'CIN Certificate',
  udyam: 'Udyam Certificate',
  iec: 'IEC Certificate',
  supporting_category_doc: 'Supporting Category Doc',
  operations_details: 'Operations Details (3a)',
  plastic_packaging_picture: 'Plastic Packaging Pic (3b)',
  covering_letter: 'Covering Letter',
  signature: 'Signature',
  self_declaration: 'Self Declaration (Any Other Info)',
  unknown: 'Unknown Document',
};

function buildDocumentPayload(data, filePath) {
  const docType = data.doc_type || '';
  const isPersonPan = docType === 'person_pan';
  const dobValue = data.dob || data.date_of_birth || data.dateOfBirth || data.birth_date || '';

  return {
    doc_type: docType,
    document_number: data.document_number || '',
    entity_name: data.entity_name || data.legal_name || data.name || '',
    issue_date: isPersonPan
      ? (dobValue || data.issue_date || '')
      : (data.issue_date || data.registration_date || data.date_of_incorporation || dobValue || ''),
    constitution_of_business: data.constitution_of_business || '',
    address: data.address || '',
    date_of_liability: data.date_of_liability || data.date_of_commencement || '',
    enterprise_type: data.enterprise_type || '',
    social_category: data.social_category || '',
    date_of_incorporation: data.date_of_incorporation || '',
    date_of_commencement: data.date_of_commencement || '',
    industry_category: data.industry_category || '',
    allowed_capacity: data.allowed_capacity || '',
    validity_date: data.validity_date || data.valid_upto || '',
    billing_month: data.billing_month || '',
    amount: Number(data.amount) || 0,
    units_consumed: Number(data.units_consumed) || 0,
    due_date: data.due_date || '',
    provider: data.provider || data.vendor_name || '',
    file_path: filePath || '',
    fileHash: data.fileHash || '',
    raw_json: JSON.stringify(data),
  };
}

async function notifyExtracted(onExtracted) {
  if (!onExtracted || !window.pwp?.documents?.getAll) return;
  const docs = await window.pwp.documents.getAll();
  const relevant = (docs || []).filter((d) => REGISTRATION_DOC_TYPES.has(d.doc_type));
  onExtracted(buildRegistrationDataFromDocuments(relevant));
}

function normalizeDocType(data, fileName = '', gstContext = {}) {
  normalizeCompanyDocumentExtraction(data, fileName);
  resolveGstDocType(data, fileName, gstContext);
  return data.doc_type || 'unknown';
}

async function repairStoredDocument(doc) {
  if (!window.pwp?.documents?.add || !window.pwp?.documents?.delete) return doc;

  let parsed = {};
  try {
    parsed = JSON.parse(doc.raw_json || '{}');
  } catch {
    parsed = {};
  }

  const fileName = doc.file_path?.split(/[/\\]/).pop() || '';
  const merged = normalizeCompanyDocumentExtraction(
    {
      ...parsed,
      doc_type: doc.doc_type,
      document_number: doc.document_number || parsed.document_number,
      entity_name: doc.entity_name || parsed.entity_name,
    },
    fileName,
    { allowFilenameReclassify: false }
  );

  const docTypeChanged = merged.doc_type !== doc.doc_type;
  const numberAdded = !doc.document_number && merged.document_number;
  if (!docTypeChanged && !numberAdded) return doc;

  await window.pwp.documents.delete(doc.id);
  const payload = buildDocumentPayload(merged, doc.file_path || '');
  const saved = await window.pwp.documents.add(payload);
  return { ...doc, ...saved, doc_type: merged.doc_type, document_number: merged.document_number, entity_name: merged.entity_name, id: saved.id };
}

function ProgressPanel({ progress }) {
  if (!progress) return null;
  const total = Math.max(
    0,
    Number(progress.batchTotal || progress.selectedTotal || progress.total || progress.totalPages || 0)
  );
  const processed = Math.max(0, Number(progress.processed || progress.current || 0));
  const success = Math.max(0, Number(progress.successCount || 0));
  const failed = Math.max(0, Number(progress.failedCount || 0));
  const remaining = Math.max(
    0,
    Number.isFinite(progress.remaining)
      ? progress.remaining
      : total - processed
  );
  const currentFile = progress.currentFile || progress.currentFile || '';
  const displayCount = progress.stage === 'complete' ? total || processed : processed;
  const percent = total > 0 ? Math.min(100, Math.round((displayCount / total) * 100)) : 0;
  const done = progress.stage === 'complete';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-800">
          {progress.message || (done ? 'Processing complete' : 'Processing documents…')}
        </span>
        <span className="text-slate-500 tabular-nums font-medium">
          {done ? `${success} extracted` : `${remaining} remaining`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{success} extracted successfully{failed > 0 ? ` · ${failed} failed` : ''}</span>
        <span>{processed}/{total || '—'} processed</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-600' : 'bg-green-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {currentFile && (
        <p className="text-xs text-slate-500 truncate">{currentFile}</p>
      )}
    </div>
  );
}

function DocListRow({ item, onRemove, removing }) {
  const tone =
    item.status === 'done'
      ? 'text-green-600'
      : item.status === 'failed'
        ? 'text-red-600'
        : item.status === 'processing'
          ? 'text-amber-600'
          : 'text-slate-400';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
          item.status === 'done'
            ? 'bg-green-50 text-green-700'
            : item.status === 'failed'
              ? 'bg-red-50 text-red-600'
              : item.status === 'processing'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-100 text-slate-500'
        }`}
      >
        {item.status === 'processing' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : item.status === 'done' ? (
          <CheckCircle2 size={16} />
        ) : item.status === 'failed' ? (
          <XCircle size={16} />
        ) : (
          <FileText size={16} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="truncate text-sm font-medium text-slate-800">{item.fileName}</p>
          {item.docType && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {DOC_TYPE_LABELS[item.docType] || item.docType}
            </span>
          )}
        </div>
        <p className={`text-xs ${tone} mt-0.5`}>
          {item.status === 'done' && item.documentNumber && (
            <span>No: {item.documentNumber}</span>
          )}
          {item.status === 'done' && item.entityName && (
            <span>{item.documentNumber ? ' · ' : ''}Name: {item.entityName}</span>
          )}
          {item.status === 'failed' && (item.error || 'Extraction failed')}
          {item.status === 'processing' && 'Extracting…'}
        </p>
      </div>
      {onRemove && item.status !== 'processing' && (
        <button
          type="button"
          disabled={removing}
          onClick={() => onRemove(item)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

/** Same physical upload — the row keeps its identity across processing → done/failed. */
function isSameUpload(a, b) {
  const pathA = String(a.filePath || '').toLowerCase();
  const pathB = String(b.filePath || '').toLowerCase();
  if (pathA && pathB) return pathA === pathB;
  const nameA = String(a.fileName || '').toLowerCase();
  const nameB = String(b.fileName || '').toLowerCase();
  return Boolean(nameA) && nameA === nameB;
}

function mergeDocItem(existing, incoming) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === '') continue;
    merged[key] = value;
  }
  if (incoming.status) merged.status = incoming.status;
  merged.error = merged.status === 'done' ? '' : incoming.error || existing.error || '';
  if (existing.dbId && !incoming.dbId) merged.id = existing.id;
  return merged;
}

function dedupeDocList(list) {
  const out = [];
  for (const item of list) {
    const idx = out.findIndex((d) => {
      if (d.dbId && item.dbId) return d.dbId === item.dbId;
      if (isSameUpload(d, item)) return true;
      return (
        item.status === 'done' &&
        d.status === 'done' &&
        Boolean(item.docType) &&
        d.docType === item.docType
      );
    });
    if (idx >= 0) out[idx] = mergeDocItem(out[idx], item);
    else out.push(item);
  }
  return out;
}

export default function RegistrationDocUpload({ onExtracted, showToast }) {
  const inputRef = useRef(null);
  const unsubRef = useRef(null);
  const dbIdsByType = useRef({});

  const [docList, setDocList] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [batchCount, setBatchCount] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [showGuidelines, setShowGuidelines] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof unsubRef.current === 'function') unsubRef.current();
    };
  }, []);

  useEffect(() => {
    const loadExisting = async () => {
      if (!window.pwp?.documents?.getAll) return;
      try {
        const docs = await window.pwp.documents.getAll();
        const relevant = (docs || []).filter((d) => REGISTRATION_DOC_TYPES.has(d.doc_type));
        if (!relevant.length) return;

        const repaired = await Promise.all(relevant.map((doc) => repairStoredDocument(doc)));
        const items = repaired.map((doc) => {
          dbIdsByType.current[doc.doc_type] = doc.id;
          return {
            id: `db-${doc.id}`,
            dbId: doc.id,
            fileName: doc.file_path?.split(/[/\\]/).pop() || 'Uploaded document',
            filePath: doc.file_path || '',
            docType: doc.doc_type,
            documentNumber: doc.document_number,
            entityName: doc.entity_name,
            status: 'done',
            error: '',
          };
        });
        setDocList(dedupeDocList(items));
        await notifyExtracted(onExtracted);
      } catch {
        /* ignore */
      }
    };
    loadExisting();
  }, [onExtracted]);

  const upsertDocInList = (item) => {
    setDocList((prev) => dedupeDocList([...prev, item]));
  };

  const saveDocument = async (data, filePath) => {
    const docType = data.doc_type;
    if (!REGISTRATION_DOC_TYPES.has(docType)) {
      throw new Error(`Document type "${docType}" is not required for registration`);
    }

    const prevId = dbIdsByType.current[docType];
    if (prevId && window.pwp.documents.delete) {
      await window.pwp.documents.delete(prevId);
      setDocList((prev) => prev.filter((d) => d.dbId !== prevId));
    }

    const payload = buildDocumentPayload(data, filePath);
    const saved = await window.pwp.documents.add(payload);
    dbIdsByType.current[docType] = saved.id;

    await notifyExtracted(onExtracted);
    return saved;
  };

  const processBatch = async (fileEntries) => {
    const seenPaths = new Set();
    const targets = fileEntries.filter((f) => {
      if (!f.path) return false;
      const key = String(f.path).toLowerCase();
      if (seenPaths.has(key)) return false;
      seenPaths.add(key);
      return true;
    });
    if (!targets.length) {
      showToast?.('No valid file paths found. Use Browse inside the Electron app.', 'error');
      return;
    }

    if (!window.pwp?.ocr?.extractBatch) {
      showToast?.('OCR extraction needs the Electron app.', 'error');
      return;
    }

    setProcessing(true);
    const batchTotal = targets.length;
    setBatchCount({ total: batchTotal, success: 0, failed: 0, remaining: batchTotal });
    setProgress({
      stage: 'start',
      batchTotal,
      total: batchTotal,
      selectedTotal: batchTotal,
      processed: 0,
      current: 0,
      successCount: 0,
      failedCount: 0,
      remaining: batchTotal,
      message: `Processing ${batchTotal} document(s)…`,
      currentFile: '',
    });

    targets.forEach((f) => {
      upsertDocInList({
        id: `proc-${f.path}`,
        fileName: f.name,
        filePath: f.path,
        docType: null,
        status: 'processing',
        error: '',
      });
    });

    if (typeof unsubRef.current === 'function') unsubRef.current();
    if (window.pwp.ocr.onProgress) {
      unsubRef.current = window.pwp.ocr.onProgress((p) => {
        const total = Math.max(0, Number(p.selectedTotal || p.total || batchTotal));
        const processed = Math.max(0, Number(p.processed || p.current || 0));
        const success = Math.max(0, Number(p.successCount || 0));
        const failed = Math.max(0, Number(p.failedCount || 0));
        const remaining = Math.max(0, total - processed);
        setBatchCount({ total, success, failed, remaining });
        setProgress({
          ...p,
          batchTotal: total,
          total,
          processed,
          successCount: success,
          failedCount: failed,
          remaining,
          message: p.message || `${success} extracted · ${remaining} remaining`,
        });
        const fs = p.fileStatus;
        if (!fs) return;
        const name = fs.sourceFileName || fs.fileName;
        if (!name) return;
        const status =
          fs.status === 'success' || fs.status === 'ok'
            ? 'done'
            : fs.status === 'failed' || fs.status === 'fail'
              ? 'failed'
              : fs.status === 'skipped'
                ? 'failed'
                : 'processing';
        upsertDocInList({
          id: `proc-${name}`,
          fileName: name,
          filePath: '',
          docType: null,
          status,
          error: status === 'failed' ? fs.label || '' : '',
        });
      });
    }

    let savedCount = 0;
    let failedCount = 0;

    let companyGstNumber = null;
    let hasCompanyGst = false;
    try {
      const existingDocs = await window.pwp.documents.getAll();
      const existingGst = (existingDocs || []).find((d) => d.doc_type === 'gst');
      if (existingGst?.document_number) {
        companyGstNumber = String(existingGst.document_number).toUpperCase();
        hasCompanyGst = true;
      }
    } catch {
      /* ignore */
    }

    try {
      const batch = await window.pwp.ocr.extractBatch({
        filePaths: targets.map((t) => t.path),
        type: 'company_document',
        companyDocType: 'auto',
      });

      for (const r of batch.results || []) {
        const sourcePath = r.filePath || '';
        const fileName = r.fileName || sourcePath.split(/[/\\]/).pop() || 'Document';

        if (!r.ok || r.skipped) {
          failedCount += 1;
          upsertDocInList({
            id: `fail-${fileName}-${Date.now()}`,
            fileName,
            filePath: sourcePath,
            docType: null,
            status: 'failed',
            error: r.message || 'Extraction failed',
          });
          const processedSoFar = savedCount + failedCount;
          const remainingNow = Math.max(0, batchTotal - processedSoFar);
          setBatchCount({
            total: batchTotal,
            success: savedCount,
            failed: failedCount,
            remaining: remainingNow,
          });
          continue;
        }

        const data = { ...(r.data || {}) };
        const docType = normalizeDocType(data, fileName, { companyGstNumber, hasCompanyGst });

        if (data.doc_type === 'gst' && data.document_number) {
          companyGstNumber = String(data.document_number).toUpperCase();
          hasCompanyGst = true;
        }

        try {
          const saved = await saveDocument(data, sourcePath);
          savedCount += 1;
          upsertDocInList({
            id: `db-${saved.id}`,
            dbId: saved.id,
            fileName,
            filePath: sourcePath,
            docType,
            documentNumber: data.document_number,
            entityName: data.entity_name,
            status: 'done',
            error: '',
          });
        } catch (err) {
          failedCount += 1;
          upsertDocInList({
            id: `fail-${fileName}-${Date.now()}`,
            fileName,
            filePath: sourcePath,
            docType,
            status: 'failed',
            error: err?.message || 'Save failed',
          });
        }

        const processedSoFar = savedCount + failedCount;
        const remainingNow = Math.max(0, batchTotal - processedSoFar);
        setBatchCount({
          total: batchTotal,
          success: savedCount,
          failed: failedCount,
          remaining: remainingNow,
        });
        setProgress((prev) => ({
          ...(prev || {}),
          batchTotal,
          total: batchTotal,
          processed: processedSoFar,
          successCount: savedCount,
          failedCount: failedCount,
          remaining: remainingNow,
          message: `${savedCount} extracted · ${remainingNow} remaining`,
        }));
      }

      const allDocs = await window.pwp.documents.getAll();
      const relevant = (allDocs || []).filter((d) => REGISTRATION_DOC_TYPES.has(d.doc_type));
      const processedTotal = savedCount + failedCount;
      const remaining = Math.max(0, batchTotal - processedTotal);

      setBatchCount({
        total: batchTotal,
        success: savedCount,
        failed: failedCount,
        remaining: 0,
      });

      setProgress((prev) => ({
        ...(prev || {}),
        stage: 'complete',
        batchTotal,
        total: batchTotal,
        processed: processedTotal,
        successCount: savedCount,
        failedCount: failedCount,
        remaining: 0,
        message: `Done · ${savedCount} extracted${failedCount ? ` · ${failedCount} failed` : ''}${remaining > 0 ? ` · ${remaining} skipped` : ''}`,
      }));

      if (savedCount > 0) {
        showToast?.(
          `${savedCount} new document(s) saved · ${relevant.length} total uploaded`,
          'success'
        );
      }
      if (failedCount > 0 && savedCount === 0) {
        showToast?.('Could not extract documents. Check files and try again.', 'error');
      }
    } catch (err) {
      showToast?.(err?.message || 'Batch extraction failed', 'error');
      setProgress(null);
      setBatchCount(null);
    } finally {
      setProcessing(false);
      if (typeof unsubRef.current === 'function') {
        unsubRef.current();
        unsubRef.current = null;
      }
    }
  };

  const resolveAndProcess = async (paths) => {
    if (!paths?.length) return;

    if (window.pwp?.ocr?.resolveUploads) {
      setResolving(true);
      try {
        const resolved = await window.pwp.ocr.resolveUploads(paths);
        const files = (resolved?.files || []).map((f) => ({
          name: f.name,
          path: f.path,
          size: f.size,
        }));
        if (!files.length) {
          showToast?.('No PDF / image files found.', 'warning');
          return;
        }
        await processBatch(files);
      } catch (err) {
        showToast?.(err?.message || 'Failed to read uploads', 'error');
      } finally {
        setResolving(false);
      }
      return;
    }

    await processBatch(paths.map((p) => ({ name: p.split(/[/\\]/).pop(), path: p })));
  };

  const addBrowserFiles = async (list) => {
    const arr = Array.from(list || []);
    if (!arr.length) return;

    const paths = [];
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
    }

    if (!paths.length) {
      showToast?.('Could not read file paths. Use Browse inside the Electron app.', 'warning');
      return;
    }
    await resolveAndProcess(paths);
  };

  const handleBrowse = async () => {
    if (window.pwp?.ocr?.selectUploads || window.pwp?.ocr?.selectFiles) {
      try {
        const picker = window.pwp.ocr.selectUploads || window.pwp.ocr.selectFiles;
        const paths = await picker();
        if (!paths?.length) return;
        await resolveAndProcess(paths);
      } catch (err) {
        showToast?.(err?.message || 'Failed to browse files', 'error');
      }
      return;
    }
    inputRef.current?.click();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (processing || resolving) return;
    addBrowserFiles(e.dataTransfer.files);
  };

  const handleRemove = async (item) => {
    if (item.dbId && window.pwp.documents.delete) {
      setRemovingId(item.id);
      try {
        await window.pwp.documents.delete(item.dbId);
        if (item.docType) delete dbIdsByType.current[item.docType];
        setDocList((prev) => prev.filter((d) => d.id !== item.id));
        await notifyExtracted(onExtracted);
        showToast?.('Document removed', 'success');
      } catch (err) {
        showToast?.(err?.message || 'Failed to remove', 'error');
      } finally {
        setRemovingId(null);
      }
      return;
    }
    setDocList((prev) => prev.filter((d) => d.id !== item.id));
  };

  const savedDocs = docList.filter((d) => d.status === 'done' && (d.dbId || d.docType));
  const totalUploaded = savedDocs.length;
  const countLabel = resolving
    ? 'Reading files…'
    : processing
      ? `${batchCount?.remaining ?? batchCount?.total ?? 0} remaining`
      : `${totalUploaded} uploaded`;

  return (
    <div className="space-y-4 relative">
      <ReadinessGuidelinesModal 
        isOpen={showGuidelines} 
        onClose={() => setShowGuidelines(false)} 
      />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-md font-medium text-slate-800">Registration Documents</h3>
            <button 
              onClick={() => setShowGuidelines(true)}
              className="p-1 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="View Readiness Guidelines"
            >
              <AlertCircle size={16} />
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload GST, Person PAN, &amp; Company PAN together — type is detected automatically
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          {countLabel}
        </span>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed transition-colors px-5 py-8 ${
          processing || resolving
            ? 'border-slate-200 bg-slate-50 opacity-60 pointer-events-none'
            : 'border-slate-300 bg-slate-50/80 hover:border-green-400 hover:bg-green-50/30'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 flex-shrink-0">
              {processing || resolving ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Upload size={22} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                Drag &amp; drop all registration documents here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                GST · Person PAN · Company PAN · CTO (+ CIN/Udyam if available) · PDF or images
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={processing || resolving}
            onClick={handleBrowse}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60 flex-shrink-0"
          >
            <Upload size={15} />
            Browse files
          </button>
        </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            multiple
            className="hidden"
            onChange={(e) => {
              addBrowserFiles(e.target.files);
              e.target.value = '';
            }}
          />
      </div>

      {(processing || resolving) && (
        <div className="space-y-2">
          {resolving && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin text-green-600" />
              Reading files…
            </div>
          )}
          <ProgressPanel progress={progress} />
        </div>
      )}

      {!processing && progress?.stage === 'complete' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 size={16} />
          {progress.message}
        </div>
      )}

      {docList.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Documents · {docList.length}
          </p>
          <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
            {docList.map((item) => (
              <DocListRow
                key={item.id}
                item={item}
                onRemove={handleRemove}
                removing={removingId === item.id}
              />
            ))}
          </div>
        </div>
      )}

      {docList.length === 0 && !processing && (
        <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
          <AlertCircle size={14} />
          Upload documents — extracted data will auto-fill the form below
        </div>
      )}
    </div>
  );
}

export function getRegistrationDocKeys() {
  return ['gst', 'person_pan', 'company_pan', 'cto'];
}
