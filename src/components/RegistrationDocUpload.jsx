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
  REQUIRED_REGISTRATION_DOCS,
} from '../utils/registrationDataMapper.js';

const REGISTRATION_DOC_TYPES = new Set([
  'gst', 'person_pan', 'company_pan', 'cto', 'cin', 'udyam', 'iec',
]);

const DOC_TYPE_LABELS = {
  gst: 'GST Certificate',
  person_pan: 'Person PAN',
  company_pan: 'Company PAN',
  cto: 'CTO Certificate',
  cin: 'CIN Certificate',
  udyam: 'Udyam Certificate',
  iec: 'IEC Certificate',
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
    validity_date: data.validity_date || '',
    billing_month: data.billing_month || '',
    amount: data.amount || 0,
    units_consumed: data.units_consumed || 0,
    due_date: data.due_date || '',
    provider: data.provider || '',
    file_path: filePath || '',
    raw_json: JSON.stringify(data),
  };
}

async function notifyExtracted(onExtracted) {
  if (!onExtracted || !window.pwp?.documents?.getAll) return;
  const docs = await window.pwp.documents.getAll();
  const relevant = (docs || []).filter((d) => REGISTRATION_DOC_TYPES.has(d.doc_type));
  onExtracted(buildRegistrationDataFromDocuments(relevant));
}

function normalizeDocType(data) {
  let type = data.doc_type || 'unknown';
  if (type === 'pan') {
    const pan = String(data.document_number || '').toUpperCase();
    type = pan.charAt(3) === 'C' ? 'company_pan' : 'person_pan';
    data.doc_type = type;
  }
  return type;
}

function ProgressPanel({ progress }) {
  if (!progress) return null;
  const total = Math.max(0, Number(progress.total || progress.totalPages || 0));
  const current = Math.max(0, Number(progress.current || 0));
  const processed = Math.max(0, Number(progress.processed || 0));
  const displayCount = progress.stage === 'complete' ? processed : current || processed;
  const percent =
    total > 0
      ? Math.min(100, Math.round(((progress.stage === 'complete' ? processed : current) / total) * 100))
      : 0;
  const done = progress.stage === 'complete';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-800">{progress.message}</span>
        <span className="text-slate-500 tabular-nums font-medium">
          {displayCount}/{total || '—'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-600' : 'bg-green-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {progress.currentFile && (
        <p className="text-xs text-slate-500 truncate">{progress.currentFile}</p>
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

export default function RegistrationDocUpload({ onExtracted, showToast }) {
  const inputRef = useRef(null);
  const unsubRef = useRef(null);
  const dbIdsByType = useRef({});

  const [docList, setDocList] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [removingId, setRemovingId] = useState(null);

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

        const items = relevant.map((doc) => {
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
        setDocList(items);
        if (onExtracted) {
          onExtracted(buildRegistrationDataFromDocuments(relevant));
        }
      } catch {
        /* ignore */
      }
    };
    loadExisting();
  }, [onExtracted]);

  const upsertDocInList = (item) => {
    setDocList((prev) => {
      let next = [...prev];

      if (item.filePath) {
        const procIdx = next.findIndex(
          (d) => d.filePath === item.filePath && d.status === 'processing'
        );
        if (procIdx >= 0) {
          next[procIdx] = item;
        } else {
          next.push(item);
        }
      } else {
        next.push(item);
      }

      if (item.status === 'done' && item.docType) {
        let found = false;
        next = next.filter((d) => {
          if (d.docType === item.docType && d.status === 'done') {
            if (!found && d.id === item.id) {
              found = true;
              return true;
            }
            if (d.id === item.id) return true;
            return false;
          }
          return true;
        });
      }

      return next;
    });
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
    const targets = fileEntries.filter((f) => f.path);
    if (!targets.length) {
      showToast?.('No valid file paths found. Use Browse inside the Electron app.', 'error');
      return;
    }

    if (!window.pwp?.ocr?.extractBatch) {
      showToast?.('OCR extraction needs the Electron app.', 'error');
      return;
    }

    setProcessing(true);
    setProgress({
      stage: 'start',
      total: targets.length,
      processed: 0,
      current: 0,
      message: `Processing ${targets.length} document(s)…`,
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
      unsubRef.current = window.pwp.ocr.onProgress((p) => setProgress(p));
    }

    let savedCount = 0;
    let failedCount = 0;

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
          continue;
        }

        const data = { ...(r.data || {}) };
        const docType = normalizeDocType(data);

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
      }

      setProgress((prev) => ({
        ...(prev || {}),
        stage: 'complete',
        message: `Done · ${savedCount} saved${failedCount ? ` · ${failedCount} failed` : ''}`,
      }));

      if (savedCount > 0) {
        showToast?.(`${savedCount} document(s) extracted and saved`, 'success');
      }
      if (failedCount > 0 && savedCount === 0) {
        showToast?.('Could not extract documents. Check files and try again.', 'error');
      }
    } catch (err) {
      showToast?.(err?.message || 'Batch extraction failed', 'error');
      setProgress(null);
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

  const savedDocs = docList.filter((d) => d.status === 'done');
  const uploadedTypes = new Set(savedDocs.map((d) => d.docType));
  const uploadedCount = REQUIRED_REGISTRATION_DOCS.filter((t) => uploadedTypes.has(t)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-md font-medium text-slate-800">Registration Documents</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload GST, Person PAN, Company PAN &amp; CTO together — type is detected automatically
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          {uploadedCount}/{REQUIRED_REGISTRATION_DOCS.length} ready
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
          accept=".pdf,.png,.jpg,.jpeg,.webp,.zip"
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
          Upload all 4 documents — extracted data will auto-fill the form below
        </div>
      )}
    </div>
  );
}

export function getRegistrationDocKeys() {
  return ['gst', 'person_pan', 'company_pan', 'cto'];
}
