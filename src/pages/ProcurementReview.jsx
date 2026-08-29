import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Package,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import PdfViewer from '../components/PdfViewer';
import { usePageHeader } from '../context/PageHeaderContext';
import { Toast, useToast } from '../components/Toast';
import {
  CF_MODE_OPTIONS,
  CF_SETUP_OPTION_VALUE,
  LINE_STATUS_OPTIONS,
  CONVERSION_METHOD,
  applyPackagingMasterToDraft,
  resolveFinancialYear,
  getConversionMethodLabel,
  itemToLineDraft,
  lineDraftToPersist,
  lookupPackagingMasterRow,
  recalcLineOnCfModeChange,
  resolveLineMt,
  resolveUomSelectOptions,
  sumLineProcessedMt,
} from '../../shared/procurementConversionFactor';
import ConversionFactorSetupModal from '../components/ConversionFactorSetupModal';
import {
  buildStateOptions,
  buildMaterialOptions,
  EditableHeaderField,
  EditableHeaderSelect,
  EditableHeaderTextarea,
  ENTITY_TYPE_OPTIONS,
  ReadonlyHeaderField,
  REGISTRATION_TYPE_OPTIONS,
} from '../components/ReviewDocumentHeaderFields';
import { resolveState } from '../../shared/gstStateCodes';
import { resolveProcurementSource } from '../../shared/importerPurchaseSaleMatch';
import {
  buildProcurementHeaderFromRow,
  enrichReviewLines,
  applyBulkPlasticToLines,
  normalizePlasticMaterial,
  resolveInvoiceNumberFromRecord,
  validateReviewDocument,
} from '../../shared/reviewEnrichment';
import { PLASTIC_CATEGORIES } from '../utils/excelImport';
import RegisteredEntityVerify from '../components/RegisteredEntityVerify.jsx';

const PLASTIC_MATERIALS = ['HDPE', 'PET', 'PP', 'PS', 'LDPE', 'LLDPE', 'MLP', 'Others', 'PLA', 'PBAT', 'PVC', 'Multi-layer'];

function fmtMt(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 6 });
}

function buildHeaderFromRow(row) {
  return buildProcurementHeaderFromRow(row);
}

export default function ProcurementReview() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'inbox';
  const navigate = useNavigate();
  const { setPageHeader, clearPageHeader } = usePageHeader();
  const { toast, showToast, hideToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState(null);
  const [navRows, setNavRows] = useState([]);
  const [header, setHeader] = useState({});
  const [lines, setLines] = useState([]);
  const [packagingRows, setPackagingRows] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [bulkCat, setBulkCat] = useState('');
  const [bulkMaterial, setBulkMaterial] = useState('');
  const [selectedLines, setSelectedLines] = useState(() => new Set());
  const [editingLine, setEditingLine] = useState(null);
  const [cfSetupLineIdx, setCfSetupLineIdx] = useState(null);
  const [cfSetupLoading, setCfSetupLoading] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const skipDirtyRef = useRef(true);

  const isPublished = tab === 'published';
  const draftStatus = isPublished ? 'published' : 'inbox';
  const readOnly = false;

  const validation = useMemo(
    () =>
      validateReviewDocument({
        header,
        lines,
        record: record || {},
        packagingRows,
        mode: 'purchase',
      }),
    [header, lines, record, packagingRows],
  );

  const validateCurrentDocument = useCallback(
    () => validateReviewDocument({
      header,
      lines,
      record: record || {},
      packagingRows,
      mode: 'purchase',
    }),
    [header, lines, record, packagingRows],
  );

  const ensurePublishReady = useCallback((docStatus) => {
    if (docStatus !== 'published') return true;
    const result = validateCurrentDocument();
    if (!result.ok) {
      showToast(result.errors.join(' · ') || 'Complete required fields before publishing', 'error');
      return false;
    }
    return true;
  }, [validateCurrentDocument, showToast]);

  const applyValidationDraft = useCallback(() => {
    const { headerDraft, enrichedLines } = validation;
    if (
      headerDraft.invoice_number !== header.invoice_number ||
      headerDraft.financial_year !== header.financial_year
    ) {
      setHeader(headerDraft);
    }
    setLines(enrichedLines);
  }, [validation, header.invoice_number, header.financial_year]);

  const markUnsaved = useCallback(() => {
    if (readOnly || skipDirtyRef.current) return;
    setDirty(true);
  }, [readOnly]);

  const patchHeader = useCallback((patch) => {
    setHeader((h) => ({ ...h, ...patch }));
    markUnsaved();
  }, [markUnsaved]);

  const applyVerifiedEntity = useCallback((entity) => {
    if (!entity) return;
    patchHeader({
      registration_type: entity.registration_type || header.registration_type,
      entity_type: entity.entity_type || '',
      supplier_name: entity.trade_name || header.supplier_name,
      address_line_1: entity.address || header.address_line_1,
      supplier_mobile_number: entity.mobile || header.supplier_mobile_number,
      state: resolveState('', header.supplier_gst_number) || header.state,
      ...(entity.recycled_plastic_percent != null && entity.recycled_plastic_percent !== ''
        ? { recycled_plastic_percent: entity.recycled_plastic_percent }
        : {}),
    });
    showToast('Fields updated from verification — click Save to persist.', 'success');
  }, [patchHeader, header.registration_type, header.entity_type, header.supplier_name, header.address_line_1, header.supplier_mobile_number, header.supplier_gst_number, header.state, showToast]);

  const isLineEditable = useCallback(
    (idx) => {
      if (readOnly) return false;
      return lines.length === 1 || selectedLines.has(idx) || editingLine === idx;
    },
    [readOnly, lines.length, selectedLines, editingLine],
  );

  useEffect(() => {
    setPageHeader({
      title: 'Procurement Document Processing',
      subtitle: isPublished ? 'Published — editable' : 'OCR Review',
      onBack: () => navigate('/doc-table', { state: { type: 'purchase', tab } }),
    });
    return clearPageHeader;
  }, [isPublished, tab, navigate, setPageHeader, clearPageHeader]);

  const loadRecord = useCallback(async () => {
    if (!window.pwp?.purchases || !id) return;
    setLoading(true);
    try {
      const [all, pkg] = await Promise.all([
        window.pwp.purchases.getAll({ doc_status: tab }),
        window.pwp.packagingMaster?.getAll?.() || [],
      ]);
      const rows = (all || []).filter((r) => (r.doc_status || 'inbox') === tab);
      setNavRows(rows);
      const row = rows.find((r) => String(r.id) === String(id)) || (all || []).find((r) => String(r.id) === String(id));
      if (!row) {
        showToast('Document not found', 'error');
        navigate('/doc-table', { state: { type: 'purchase' } });
        return;
      }
      setRecord(row);
      const items = row.line_items || row.lineItems || [];
      let drafts = enrichReviewLines(
        items.map((li, i) => itemToLineDraft(li, i)),
        row,
        pkg || [],
      );
      skipDirtyRef.current = true;
      setHeader(buildHeaderFromRow(row));
      setLines(drafts);
      setBulkCat(row.category_of_plastic || 'Cat-II');
      setBulkMaterial(normalizePlasticMaterial(row.plastic_type) || 'Others');
      setBulkStatus('');
      setDirty(false);
      setPackagingRows(pkg || []);
      requestAnimationFrame(() => {
        skipDirtyRef.current = false;
      });
    } catch (e) {
      showToast(e.message || 'Failed to load document', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, tab, navigate, showToast]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      setPreviewUrl(null);
      const localPath =
        record?._source_fields?.local_pdf_path ||
        record?.local_pdf_path ||
        null;
      const fileName = record?.invoice_filename;
      if (!localPath && !fileName) return;
      try {
        const path = localPath || fileName;
        if (window.pwp?.fs?.readFileBase64 && path) {
          const base64 = await window.pwp.fs.readFileBase64(path);
          if (!cancelled && base64) {
            setPreviewUrl(`data:application/pdf;base64,${base64}`);
          }
        }
      } catch {
        /* preview optional */
      }
    };
    if (record) loadPreview();
    return () => { cancelled = true; };
  }, [record]);

  const navIndex = navRows.findIndex((r) => String(r.id) === String(id));
  const navPos = navIndex >= 0 ? navIndex + 1 : 1;
  const navTotal = navRows.length || 1;

  const totals = useMemo(() => ({
    totalPlasticMt: sumLineProcessedMt(lines),
  }), [lines]);

  const updateLine = (idx, patch) => {
    setLines((prev) => {
      const next = [...prev];
      let draft = { ...next[idx], ...patch };
      if (patch.processedQuantity != null && !patch.quantityDerivationType) {
        draft.quantityDerivationType = 'manual';
        draft.conversionMethodUsed = CONVERSION_METHOD.MANUAL;
        draft.masterSource = 'manual';
        draft.conversionFactorApplied = '';
        draft.conversionFactor = '';
      }
      if (patch.quantityDerivationType) {
        draft = recalcLineOnCfModeChange(draft, patch.quantityDerivationType);
      } else {
        const mt = resolveLineMt(draft);
        if (mt != null && draft.quantityDerivationType !== 'manual') {
          draft.processedQuantity = String(mt);
        }
      }
      next[idx] = draft;
      return next;
    });
    markUnsaved();
  };

  const applyMasterToLine = async (idx) => {
    const line = lines[idx];
    const master =
      lookupPackagingMasterRow(packagingRows, line, 'purchase') ||
      (await window.pwp?.packagingMaster?.lookup?.({
        company_id: record?.company_id,
        product_description: line.productDescription,
        hsn: line.hsn,
        list_type: 'purchase',
      }));
    if (!master) {
      showToast('No packaging master match for this line', 'info');
      return false;
    }
    updateLine(idx, applyPackagingMasterToDraft(line, master));
    showToast('Applied packaging master', 'success');
    return true;
  };

  const handleCfSetupApplyMaster = async () => {
    if (cfSetupLineIdx == null) return;
    setCfSetupLoading(true);
    try {
      const ok = await applyMasterToLine(cfSetupLineIdx);
      if (ok) setCfSetupLineIdx(null);
    } finally {
      setCfSetupLoading(false);
    }
  };

  const handleCfSetupApplyManual = (cfValue) => {
    if (cfSetupLineIdx == null) return;
    updateLine(cfSetupLineIdx, {
      quantityDerivationType: 'conversion_factor',
      conversionMethodUsed: CONVERSION_METHOD.MANUAL,
      conversionFactor: cfValue,
      conversionFactorApplied: cfValue,
      masterSource: 'manual',
    });
    setCfSetupLineIdx(null);
    showToast('Manual conversion factor applied', 'success');
  };

  const handleCfSetupApplyFormula = (formula) => {
    if (cfSetupLineIdx == null) return;
    updateLine(cfSetupLineIdx, {
      quantityDerivationType: 'auto_function',
      conversionMethodUsed: CONVERSION_METHOD.AUTO_FUNCTION,
      cfFormula: formula,
      masterSource: 'auto_function',
    });
    setCfSetupLineIdx(null);
    showToast('Auto-Function formula applied', 'success');
  };

  const applyBulkPlastic = () => {
    const { lines: nextLines, updated } = applyBulkPlasticToLines(lines, bulkCat, bulkMaterial);
    if (!bulkCat && !bulkMaterial) {
      setBulkStatus('');
      showToast('Select category or material for bulk update', 'info');
      return;
    }
    if (!nextLines.length) {
      setBulkStatus('');
      showToast('No line items to update', 'info');
      return;
    }
    setLines(nextLines);
    markUnsaved();
    const msg = updated > 0
      ? `Updated ${updated} line(s) — check Category/Material columns in the table →`
      : 'All lines already have the selected category/material';
    setBulkStatus(msg);
    showToast(updated > 0 ? `Bulk update applied to ${updated} line item(s)` : msg, updated > 0 ? 'success' : 'info');
  };

  const runValidation = () => {
    applyValidationDraft();
    if (!validation.ok) {
      showToast('Validation failed — check highlighted fields', 'error');
      return false;
    }
    showToast('Document passed validation', 'success');
    return true;
  };

  const buildSavePayload = (docStatus) => {
    const lineItems = lines.map(lineDraftToPersist);
    const totalMt = sumLineProcessedMt(lines);
    const first = lineItems[0];
    return {
      ...record,
      ...header,
      vendor_name: header.supplier_name,
      vendor_gstin: header.supplier_gst_number,
      invoice_no: header.invoice_number,
      procurement_date: header.invoice_date,
      invoice_date: header.invoice_date,
      quantity_mt: totalMt,
      quantity: totalMt,
      lineItems,
      item_name: first?.productDescription || record.item_name,
      hsn_code: first?.hsn || record.hsn_code,
      category_of_plastic: bulkCat || first?.plasticCategory || record.category_of_plastic,
      plastic_type: bulkMaterial || first?.plasticMaterial || record.plastic_type,
      procurement_source: resolveProcurementSource({ ...record, ...header }),
      doc_status: docStatus || record.doc_status || tab,
    };
  };

  const handleSave = async (docStatus, { silent = false, skipReload = false } = {}) => {
    if (!record?.id) return;
    if (!ensurePublishReady(docStatus)) return;
    setSaving(true);
    try {
      const payload = buildSavePayload(docStatus);
      const result = await window.pwp.purchases.update(payload);
      const savedLines = result?.lineItems ?? payload.lineItems;
      setRecord((prev) => (prev ? {
        ...prev,
        ...payload,
        line_items: savedLines,
        lineItems: savedLines,
        quantity_mt: result?.quantity_mt ?? payload.quantity_mt,
        quantity: result?.quantity ?? payload.quantity,
      } : prev));
      setDirty(false);
      if (silent) {
        showToast(
          result?.packagingSynced > 0
            ? `Draft saved · ${result.packagingSynced} product(s) synced to Packaging`
            : 'Draft saved',
          'success',
        );
      } else {
        showToast(
          docStatus === 'published' && tab === 'published'
            ? 'Changes saved'
            : docStatus === 'published'
              ? 'Published successfully'
              : result?.packagingSynced > 0
                ? `Saved · ${result.packagingSynced} product(s) synced to Packaging Master`
                : 'Saved',
          'success',
        );
      }
      if (docStatus === 'published' && tab !== 'published') {
        navigate('/doc-table', { state: { type: 'purchase', tab: 'published' } });
      } else if (!skipReload) {
        await loadRecord();
      }
    } catch (e) {
      if (!silent) showToast(e.message || 'Save failed', 'error');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    applyValidationDraft();
    const result = validateCurrentDocument();
    if (!result.ok) {
      showToast(result.errors.join(' · ') || 'Complete required fields before publishing', 'error');
      return;
    }
    await handleSave('published');
  };

  const handleReject = async () => {
    if (!record?.id) return;
    setSaving(true);
    try {
      await window.pwp.purchases.updateStatus({ id: record.id, doc_status: 'rejected' });
      showToast('Moved to Reject', 'success');
      navigate('/doc-table', { state: { type: 'purchase', tab: 'rejected' } });
    } catch (e) {
      showToast(e.message || 'Reject failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!record?.id) return;
    setSaving(true);
    try {
      await window.pwp.purchases.updateStatus({ id: record.id, doc_status: 'inbox' });
      showToast('Moved back to Inbox', 'success');
      navigate('/doc-table', { state: { type: 'purchase', tab: 'inbox' } });
    } catch (e) {
      showToast(e.message || 'Unpublish failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const goNav = async (delta) => {
    const next = navRows[navIndex + delta];
    if (!next) return;
    if (dirty && record?.id) {
      const saveFirst = window.confirm('You have unsaved changes. Save before moving to the next document?');
      if (!saveFirst) return;
      try {
        await handleSave(draftStatus, { skipReload: true });
      } catch {
        return;
      }
    }
    navigate(`/procurement-review/${next.id}?tab=${tab}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-500 gap-2">
        <Loader2 className="animate-spin" size={20} /> Loading document…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] min-h-0 gap-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
            {isPublished ? 'Published' : 'OCR Review'}
          </span>
          <span className="text-sm text-slate-500">
            {navPos} / {navTotal}
          </span>
          {dirty ? (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
              Unsaved changes
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={navIndex <= 0} onClick={() => goNav(-1)} className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40">
            <ChevronLeft size={16} /> Previous
          </button>
          <button type="button" disabled={navIndex < 0 || navIndex >= navRows.length - 1} onClick={() => goNav(1)} className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40">
            Next <ChevronRight size={16} />
          </button>
          <button type="button" onClick={() => navigate('/master-data?tab=packaging')} className="btn-secondary text-sm py-1.5 px-3">
            <Package size={15} /> Manage Packaging
          </button>
          {!isPublished && (
            <button type="button" onClick={handleReject} disabled={saving} className="btn-secondary text-sm py-1.5 px-3 text-red-600 border-red-100 hover:bg-red-50">
              <XCircle size={15} /> Move to Reject
            </button>
          )}
          {isPublished && (
            <button type="button" onClick={handleUnpublish} disabled={saving} className="btn-secondary text-sm py-1.5 px-3">
              Unpublish to Inbox
            </button>
          )}
          <button type="button" onClick={() => navigate('/doc-table', { state: { type: 'purchase', tab } })} className="btn-secondary text-sm py-1.5 px-3">
            <Inbox size={15} /> Back to Inbox
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-3 flex-col lg:flex-row">
        {/* Invoice preview */}
        <div className="w-full lg:w-[42%] lg:shrink-0 flex flex-col h-[38vh] lg:h-auto lg:min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">
            Invoice Preview
          </div>
          <div className="flex-1 min-h-0">
            {previewUrl ? (
              <PdfViewer url={previewUrl} className="h-full w-full rounded-none border-0" />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400 text-sm">No preview available</div>
            )}
          </div>
        </div>

        {/* Right panel — single scroll so line items always render */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
          {/* Document header — no Verify Supplier */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold text-slate-800">Document Header</h3>
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => handleSave(draftStatus, { skipReload: true })}
                className="btn-primary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                {saving ? <Loader2 size={14} className="animate-spin inline" /> : null}
                {' '}Save
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <ReadonlyHeaderField label="Name" value={header.supplier_name} />
              <EditableHeaderTextarea
                label="Address"
                value={header.address_line_1}
                onChange={(v) => patchHeader({ address_line_1: v })}
                readOnly={readOnly}
              />
              <EditableHeaderField
                label="GST Number"
                value={header.supplier_gst_number}
                onChange={(v) => patchHeader({
                  supplier_gst_number: v.toUpperCase(),
                  state: resolveState('', v),
                })}
                readOnly={readOnly}
                required
                placeholder="15-character GSTIN"
              />
              <RegisteredEntityVerify
                gst={header.supplier_gst_number}
                companyId={record?.company_id}
                entityName={header.supplier_name}
                entityType={header.entity_type}
                state={header.state}
                disabled={readOnly}
                onApply={applyVerifiedEntity}
              />
              <EditableHeaderField
                label="Document Number"
                value={header.invoice_number}
                onChange={(v) => patchHeader({ invoice_number: v })}
                readOnly={readOnly}
                required
              />
              <EditableHeaderSelect
                label="Registration Type"
                value={header.registration_type}
                onChange={(v) => patchHeader({ registration_type: v })}
                options={REGISTRATION_TYPE_OPTIONS}
                readOnly={false}
                disabled={readOnly}
              />
              <EditableHeaderField
                label="Document Date"
                type="date"
                value={header.invoice_date}
                onChange={(v) => patchHeader({
                  invoice_date: v,
                  financial_year: resolveFinancialYear(v, header.financial_year),
                })}
                readOnly={readOnly}
                required
              />
              <EditableHeaderSelect
                label="Entity Type"
                value={header.entity_type}
                onChange={(v) => patchHeader({ entity_type: v })}
                options={ENTITY_TYPE_OPTIONS}
                readOnly={false}
                disabled={readOnly}
                placeholder="Select Entity Type"
              />
              <ReadonlyHeaderField
                label="Procurement Source"
                value={
                  (header.procurement_source || 'domestic') === 'import'
                    ? 'Import'
                    : 'Domestic'
                }
              />
              {header.procurement_source === 'import' && (
                <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-100 rounded-md px-2 py-1.5 md:col-span-2">
                  Auto-detected as <strong>Import</strong> from invoice address/country — this purchase can be matched to domestic sales in Importer Section 3a.
                </p>
              )}
              {header.procurement_source === 'domestic' && (
                <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5 md:col-span-2">
                  Auto-detected as <strong>Domestic</strong> from Indian supplier GST, address, or country on the invoice.
                </p>
              )}
              <ReadonlyHeaderField label="Financial Year" value={header.financial_year} />
              <EditableHeaderSelect
                label="State"
                value={header.state}
                onChange={(v) => patchHeader({ state: v })}
                options={buildStateOptions(header.state)}
                readOnly={false}
                disabled={readOnly}
                placeholder="Select State"
              />
              <ReadonlyHeaderField label="Total Plastic Weight" value={fmtMt(totals.totalPlasticMt) + ' MT'} />
              <EditableHeaderField
                label="Mobile"
                value={header.supplier_mobile_number}
                onChange={(v) => patchHeader({ supplier_mobile_number: v })}
                readOnly={false}
                disabled={readOnly}
              />
            </div>
          </section>

          {/* Plastic categorization bulk */}
          {!readOnly && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Plastic Categorization</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label text-xs">Category</label>
                  <select className="input text-sm" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
                    <option value="">—</option>
                    {PLASTIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Plastic Material</label>
                  <select className="input text-sm" value={bulkMaterial} onChange={(e) => setBulkMaterial(e.target.value)}>
                    <option value="">—</option>
                    {PLASTIC_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <button type="button" onClick={applyBulkPlastic} className="btn-primary text-sm py-2 px-4">Bulk Update</button>
                <p className="text-[11px] text-slate-500 w-full">Applies to all {lines.length} line item(s). Scroll right in the table to see Category / Material.</p>
                {bulkStatus ? (
                  <p className={`text-xs w-full ${bulkStatus.startsWith('Updated') ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                    {bulkStatus}
                  </p>
                ) : null}
              </div>
            </section>
          )}

          {/* Line items */}
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-800">Line Items ({lines.length})</h3>
              {!readOnly && (
                <p className="text-[11px] text-slate-500">Double-click a row or tick checkbox to edit UOM / CF Mode</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1100px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {!readOnly && <th className="th w-8"><span className="sr-only">Select</span></th>}
                    <th className="th">Line</th>
                    <th className="th min-w-[140px]">Description</th>
                    <th className="th">HSN</th>
                    <th className="th">UOM</th>
                    <th className="th">Qty</th>
                    <th className="th">Rate</th>
                    <th className="th">CF Mode</th>
                    <th className="th">Method</th>
                    <th className="th">Qty MT</th>
                    <th className="th">Status</th>
                    <th className="th">Master</th>
                    <th className="th">Category</th>
                    <th className="th">Material</th>
                    {!readOnly && <th className="th">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const mt = resolveLineMt(line);
                    const method = getConversionMethodLabel(
                      line.conversionMethodUsed ||
                      (line.quantityDerivationType === 'conversion_factor'
                        ? CONVERSION_METHOD.AUTO_MASTER
                        : line.quantityDerivationType === 'auto_function'
                          ? CONVERSION_METHOD.AUTO_FUNCTION
                          : line.quantityDerivationType === 'manual'
                            ? CONVERSION_METHOD.MANUAL
                            : CONVERSION_METHOD.DEFAULT),
                    );
                    const isEditing = isLineEditable(idx);
                    return (
                      <tr
                        key={idx}
                        className={`border-b border-slate-100 hover:bg-slate-50/80 ${isEditing ? 'bg-emerald-50/40' : ''}`}
                        title={isEditing ? 'Editing row' : 'Double-click to edit row'}
                        onDoubleClick={() => !readOnly && setEditingLine(idx)}
                      >
                        {!readOnly && (
                          <td className="td">
                            <input
                              type="checkbox"
                              checked={selectedLines.has(idx)}
                              onChange={(e) => {
                                setSelectedLines((prev) => {
                                  const n = new Set(prev);
                                  if (e.target.checked) n.add(idx);
                                  else {
                                    n.delete(idx);
                                    if (editingLine === idx) setEditingLine(null);
                                  }
                                  return n;
                                });
                              }}
                            />
                          </td>
                        )}
                        <td className="td">{line.lineNo ?? idx + 1}</td>
                        <td className="td">
                          {isEditing && !readOnly ? (
                            <input className="input text-xs py-1" value={line.productDescription} onChange={(e) => updateLine(idx, { productDescription: e.target.value })} />
                          ) : line.productDescription || '—'}
                        </td>
                        <td className="td">{isEditing && !readOnly ? <input className="input text-xs py-1 w-20" value={line.hsn} onChange={(e) => updateLine(idx, { hsn: e.target.value })} /> : line.hsn || '—'}</td>
                        <td className="td">
                          {isEditing && !readOnly ? (
                            <select
                              className="input text-xs py-1 min-w-[72px]"
                              value={line.unit || line.uom || ''}
                              onChange={(e) => updateLine(idx, {
                                unit: e.target.value,
                                uom: e.target.value,
                                unitInInvoice: e.target.value,
                              })}
                            >
                              <option value="">Select</option>
                              {resolveUomSelectOptions(line.unit || line.uom).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (line.unit || line.uom || '—')}
                        </td>
                        <td className="td">{line.quantity || '—'}</td>
                        <td className="td">{line.rate || '—'}</td>
                        <td className="td">
                          {isEditing && !readOnly ? (
                            <select
                              className="input text-xs py-1 min-w-[88px]"
                              value={line.quantityDerivationType || 'default'}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === CF_SETUP_OPTION_VALUE) {
                                  setCfSetupLineIdx(idx);
                                  return;
                                }
                                updateLine(idx, { quantityDerivationType: value });
                              }}
                            >
                              {CF_MODE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                              <option disabled>──────────</option>
                              <option value={CF_SETUP_OPTION_VALUE}>+ Conversion Factor Setup</option>
                            </select>
                          ) : CF_MODE_OPTIONS.find((o) => o.value === line.quantityDerivationType)?.label || line.quantityDerivationType}
                        </td>
                        <td className="td"><span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium">{method}</span></td>
                        <td className="td font-medium text-emerald-700">
                          {line.quantityDerivationType === 'manual' && isEditing && !readOnly ? (
                            <input className="input text-xs py-1 w-16" value={line.processedQuantity} onChange={(e) => updateLine(idx, { processedQuantity: e.target.value })} />
                          ) : fmtMt(mt)}
                        </td>
                        <td className="td">
                          {isEditing && !readOnly ? (
                            <select className="input text-xs py-1" value={line.lineStatus} onChange={(e) => updateLine(idx, { lineStatus: e.target.value })}>
                              {LINE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : LINE_STATUS_OPTIONS.find((o) => o.value === line.lineStatus)?.label || line.lineStatus}
                        </td>
                        <td className="td"><span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100">{line.masterSource || 'none'}</span></td>
                        <td className="td">
                          {!readOnly ? (
                            <select className="input text-xs py-1" value={line.plasticCategory || ''} onChange={(e) => updateLine(idx, { plasticCategory: e.target.value })}>
                              <option value="">—</option>
                              {PLASTIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (line.plasticCategory || '—')}
                        </td>
                        <td className="td">
                          {!readOnly ? (
                            <select className="input text-xs py-1" value={line.plasticMaterial || ''} onChange={(e) => updateLine(idx, { plasticMaterial: e.target.value })}>
                              <option value="">—</option>
                              {buildMaterialOptions(line.plasticMaterial, PLASTIC_MATERIALS).map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          ) : (line.plasticMaterial || '—')}
                        </td>
                        {!readOnly && (
                          <td className="td">
                            <button type="button" className="text-[10px] text-indigo-600 hover:underline" onClick={() => applyMasterToLine(idx)}>Apply Master</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!readOnly && (
              <p className="text-[11px] text-slate-400 px-4 py-2 border-t border-slate-100">
                Double-click a row to edit. CF is <strong>kg per invoice unit</strong> (MT = qty × CF ÷ 1000). Total Plastic Weight = sum of line Qty (MT).
              </p>
            )}
          </section>

          {/* Footer actions */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              {validation.errors.length ? (
                <span className="text-red-600">{validation.errors.join(' · ')}</span>
              ) : validation.ok ? (
                <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} /> {isPublished ? 'Valid — save changes when ready' : 'Ready to publish'}</span>
              ) : (
                isPublished
                  ? 'Fix highlighted fields, then save changes.'
                  : 'Complete required fields, then Publish to move from Inbox to Published.'
              )}
            </div>
            <div className="flex gap-2">
              {isPublished ? (
                <>
                  <button type="button" disabled={saving || !validation.ok} onClick={() => handleSave('published')} className="btn-primary text-sm py-2 px-5 disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin inline" /> : null} Save Changes
                  </button>
                  <button type="button" disabled={saving} onClick={runValidation} className="btn-secondary text-sm py-2 px-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50">Validate</button>
                </>
              ) : (
                <>
                  <button type="button" disabled={saving} onClick={() => handleSave('inbox')} className="btn-secondary text-sm py-2 px-4">Save Draft</button>
                  <button type="button" disabled={saving} onClick={runValidation} className="btn-secondary text-sm py-2 px-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50">Validate</button>
                  <button type="button" disabled={saving || !validation.ok} onClick={handlePublish} className="btn-primary text-sm py-2 px-5 disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin inline" /> : null} Publish
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConversionFactorSetupModal
        open={cfSetupLineIdx != null}
        line={cfSetupLineIdx != null ? lines[cfSetupLineIdx] : null}
        loading={cfSetupLoading}
        onClose={() => !cfSetupLoading && setCfSetupLineIdx(null)}
        onApplyMaster={handleCfSetupApplyMaster}
        onApplyManual={handleCfSetupApplyManual}
        onApplyFormula={handleCfSetupApplyFormula}
      />
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}
