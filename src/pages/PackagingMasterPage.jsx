import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Package, ChevronDown, Download, Upload,
  FileSpreadsheet, Loader2, Search, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { PLASTIC_CATEGORIES } from '../utils/excelImport.js';
import {
  downloadPackagingMasterTemplate,
  exportPackagingMasterExcel,
  parsePackagingMasterExcel,
} from '../utils/packagingMasterExcel.js';
import { buildProductMatchKey } from '../../shared/procurementConversionFactor.js';
import {
  formatConversionFactorWithUnit,
  packagingMasterCompleteness,
  resolvePackagingHsn,
  resolvePackagingUom,
} from '../../shared/packagingMasterSync.js';

const PLASTIC_MATERIALS = ['PET', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS', 'MLP', 'Others'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const LIST_TYPE_TABS = [
  {
    id: 'sales',
    label: 'Sales Packaging',
    hint: 'Products you sell — used for Importer EPR Section 3a packaging MT calculations.',
    partyLabel: 'Customer / Party',
    partyGstLabel: 'Customer GST',
    partyNameLabel: 'Customer Name',
  },
  {
    id: 'purchase',
    label: 'Purchase Packaging',
    hint: 'Products from procurement invoices — auto-synced when purchase invoices are saved or reviewed.',
    partyLabel: 'Supplier / Party',
    partyGstLabel: 'Supplier GST',
    partyNameLabel: 'Supplier Name',
  },
];

function normalizeRecordListType(listType) {
  const lt = String(listType || 'purchase').toLowerCase();
  if (lt === 'gpl') return 'purchase';
  return lt === 'sales' ? 'sales' : 'purchase';
}

function recordMatchesSearch(record, query) {
  if (!query) return true;
  const haystack = [
    record.supplier_name,
    record.product_description,
    record.plastic_category,
    record.plastic_material,
    resolvePackagingHsn(record),
    resolvePackagingUom(record),
    record.supplier_gst,
    packagingMasterCompleteness(record).label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function PaginationBar({ currentPage, totalPages, totalRecords, pageSize, onPageChange, onPageSizeChange }) {
  const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  const getPageNumbers = () => {
    const pages = [];
    const delta = 2;
    const left = Math.max(1, currentPage - delta);
    const right = Math.min(totalPages, currentPage + delta);
    if (left > 1) {
      pages.push(1);
      if (left > 2) pages.push('...');
    }
    for (let i = left; i <= right; i += 1) pages.push(i);
    if (right < totalPages) {
      if (right < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-7 pl-2 pr-6 rounded border border-slate-200 bg-white text-xs font-medium text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-400">
          <span className="font-medium text-slate-600">{startRecord}</span>
          {' – '}
          <span className="font-medium text-slate-600">{endRecord}</span>
          {' of '}
          <span className="font-medium text-slate-600">{totalRecords}</span>
        </p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          {getPageNumbers().map((pg, i) => (
            pg === '...' ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-400">…</span>
            ) : (
              <button
                key={pg}
                type="button"
                onClick={() => onPageChange(pg)}
                className={`min-w-[26px] h-6 px-1 rounded text-xs font-medium transition-all ${
                  pg === currentPage
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                }`}
              >
                {pg}
              </button>
            )
          ))}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ record }) {
  const { ok, label } = packagingMasterCompleteness(record);
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      {label}
    </span>
  );
}

function TruncatedCell({ text, className = '' }) {
  const ref = useRef(null);
  const [truncated, setTruncated] = useState(false);
  const display = text?.trim() ? text.trim() : '—';

  const checkTruncation = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setTruncated(el.scrollWidth > el.clientWidth + 1);
  }, [display]);

  useLayoutEffect(() => {
    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [checkTruncation]);

  const label = (
    <span ref={ref} className={`block truncate ${className}`}>
      {display}
    </span>
  );

  if (!truncated || display === '—') return label;

  return (
    <div className="relative max-w-full group/cell">
      {label}
      <div
        role="tooltip"
        className="pointer-events-none invisible opacity-0 group-hover/cell:visible group-hover/cell:opacity-100 transition-opacity absolute z-30 left-0 top-full mt-1 max-w-sm rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-normal text-white shadow-lg whitespace-normal break-words"
      >
        {display}
      </div>
    </div>
  );
}

export default function PackagingMasterPage({ embedded = false }) {
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [listTypeTab, setListTypeTab] = useState('sales');
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkUpdateModal, setBulkUpdateModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectAllRef = useRef(null);
  const fileInputRef = useRef(null);
  const actionsRef = useRef(null);
  const { setPageHeader, clearPageHeader } = usePageHeader();
  const { showToast } = useToast();

  useEffect(() => {
    if (embedded) return undefined;
    setPageHeader({
      title: 'Packaging Master',
      icon: Package,
      description: 'Manage packaging rules, conversion factors, and material details',
    });
    return clearPageHeader;
  }, [embedded, setPageHeader, clearPageHeader]);

  const load = useCallback(async () => {
    if (!window.pwp?.packagingMaster) { setLoading(false); return; }
    setLoading(true);
    try {
      const [data, comps] = await Promise.all([
        window.pwp.packagingMaster.getAll(
          companyFilter ? { company_id: companyFilter } : undefined,
        ),
        window.pwp.companies.getAll(),
      ]);
      setRecords(data || []);
      setCompanies(comps || []);
      if (!companyFilter && comps?.length === 1) {
        setCompanyFilter(String(comps[0].id));
      }
    } catch {
      showToast('Error loading packaging data', 'error');
    }
    setLoading(false);
  }, [companyFilter, showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
    setImportSummary(null);
    setCurrentPage(1);
  }, [companyFilter, listTypeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const activeTab = LIST_TYPE_TABS.find((t) => t.id === listTypeTab) || LIST_TYPE_TABS[0];

  const tabRecords = useMemo(
    () => records.filter((r) => normalizeRecordListType(r.list_type) === listTypeTab),
    [records, listTypeTab],
  );

  const searchTerm = searchQuery.trim().toLowerCase();

  const filteredRecords = useMemo(
    () => tabRecords.filter((r) => recordMatchesSearch(r, searchTerm)),
    [tabRecords, searchTerm],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, safePage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const tabCounts = useMemo(() => ({
    sales: records.filter((r) => normalizeRecordListType(r.list_type) === 'sales').length,
    purchase: records.filter((r) => normalizeRecordListType(r.list_type) === 'purchase').length,
  }), [records]);

  const allSelected = paginatedRecords.length > 0 && paginatedRecords.every((r) => selectedIds.has(r.id));
  const someSelected = paginatedRecords.some((r) => selectedIds.has(r.id));

  useLayoutEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      paginatedRecords.forEach((r) => {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      });
      return next;
    });
  };

  const handlePageChange = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const stats = useMemo(() => {
    const incomplete = tabRecords.filter((r) => !packagingMasterCompleteness(r).ok).length;
    return { total: tabRecords.length, incomplete, complete: tabRecords.length - incomplete };
  }, [tabRecords]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!window.pwp?.packagingMaster) return;

    const formData = new FormData(e.target);
    const form = Object.fromEntries(formData.entries());
    form.list_type = form.list_type || listTypeTab;
    form.match_type = form.match_type || modal?.match_type || 'exact';
    const desc = form.product_description?.trim() || '';
    const hsn = form.hsn?.trim() || '';
    form.product_match_key = buildProductMatchKey(desc, hsn);

    if (!form.plastic_category) {
      showToast('Plastic category is required', 'error');
      return;
    }
    if (!form.conversion_factor) {
      showToast('Conversion factor (kg per unit) is required for EPR calculations', 'error');
      return;
    }

    try {
      if (modal?.id) {
        await window.pwp.packagingMaster.update({ ...form, id: modal.id });
        showToast('Packaging record updated', 'success');
      } else {
        await window.pwp.packagingMaster.add(form);
        showToast('Packaging record added', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this packaging record?')) return;
    try {
      await window.pwp.packagingMaster.delete(id);
      showToast('Record deleted', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !window.pwp?.packagingMaster?.deleteMany) return;
    if (!window.confirm(`Delete ${ids.length} packaging record(s)? This cannot be undone.`)) return;

    setBulkDeleting(true);
    try {
      const res = await window.pwp.packagingMaster.deleteMany(ids);
      if (res?.success) {
        showToast(`${res.deleted ?? ids.length} record(s) deleted`, 'success');
        clearSelection();
        load();
      } else {
        showToast(res?.error || 'Bulk delete failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkUpdate = async (e) => {
    e.preventDefault();
    if (!window.pwp?.packagingMaster?.updateMany) return;

    const form = Object.fromEntries(new FormData(e.target).entries());
    const updates = {};
    if (form.plastic_category) updates.plastic_category = form.plastic_category;
    if (form.plastic_material) updates.plastic_material = form.plastic_material;
    if (form.conversion_factor) updates.conversion_factor = form.conversion_factor;
    if (form.hsn) updates.hsn = form.hsn;
    if (form.uom) updates.uom = form.uom;

    if (!Object.keys(updates).length) {
      showToast('Select at least one field to update', 'info');
      return;
    }

    const ids = [...selectedIds];
    setBulkUpdating(true);
    try {
      const res = await window.pwp.packagingMaster.updateMany({ ids, updates });
      if (res?.success) {
        showToast(`Updated ${res.updated ?? ids.length} record(s)`, 'success');
        setBulkUpdateModal(false);
        clearSelection();
        load();
      } else {
        showToast(res?.error || 'Bulk update failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkUpdating(false);
    }
  };

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const onDocClick = (e) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [actionsOpen]);

  const runAction = (fn) => {
    setActionsOpen(false);
    fn();
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadPackagingMasterTemplate(companies, listTypeTab);
    } catch (err) {
      showToast(err.message || 'Template download failed', 'error');
    }
  };

  const handleExportExcel = async () => {
    try {
      await exportPackagingMasterExcel(tabRecords, companies, listTypeTab);
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.pwp?.packagingMaster?.bulkUpsert) {
      showToast('Import needs the Electron app (restart if you just updated).', 'error');
      return;
    }

    setImporting(true);
    setImportSummary(null);
    try {
      const { rows, errors: parseErrors } = await parsePackagingMasterExcel(file, companies, {
        defaultListType: listTypeTab,
      });
      if (!rows.length) {
        throw new Error(parseErrors[0] || 'No valid rows found in Excel.');
      }

      const result = await window.pwp.packagingMaster.bulkUpsert({ rows });
      if (result?.success === false && !result.added && !result.updated) {
        throw new Error(result.error || 'Import failed');
      }

      const summary = {
        added: result?.added || 0,
        updated: result?.updated || 0,
        failed: (result?.failed || 0) + parseErrors.length,
        errors: [...parseErrors, ...(result?.errors || [])],
      };
      setImportSummary(summary);

      if (summary.added || summary.updated) {
        showToast(
          `Excel import: ${summary.added} added, ${summary.updated} updated${summary.failed ? `, ${summary.failed} skipped` : ''}`,
          summary.failed ? 'warning' : 'success',
        );
        await load();
      } else {
        showToast(summary.errors[0] || 'No packaging records were imported.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-500" />
            {activeTab.label}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {stats.complete} complete · {stats.incomplete} need category / HSN / CF
          </p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xl">{activeTab.hint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="relative" ref={actionsRef}>
            <button
              type="button"
              onClick={() => setActionsOpen((open) => !open)}
              disabled={importing}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white pl-4 pr-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Excel / Add
              <ChevronDown className={`w-4 h-4 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => runAction(() => setModal({ company_id: companyFilter || '', list_type: listTypeTab }))}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4 text-indigo-500" />
                  Add Record
                </button>
                <div className="my-1 border-t border-slate-100" />
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Excel — {activeTab.label}
                </p>
                <button
                  type="button"
                  onClick={() => runAction(handleDownloadTemplate)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-400" />
                  Download Template
                </button>
                <button
                  type="button"
                  disabled={!tabRecords.length}
                  onClick={() => runAction(handleExportExcel)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                  Export Current Tab
                </button>
                <button
                  type="button"
                  onClick={() => runAction(handleImportClick)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Upload className="w-4 h-4 text-slate-400" />
                  Import Excel (add / update)
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </div>
      </div>

      {importSummary ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-medium text-slate-800">Last Excel import</p>
          <p>
            {importSummary.added} added · {importSummary.updated} updated
            {importSummary.failed ? ` · ${importSummary.failed} skipped` : ''}
          </p>
          {importSummary.errors?.length ? (
            <ul className="mt-1 list-disc pl-4 text-red-700 space-y-0.5">
              {importSummary.errors.slice(0, 6).map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {LIST_TYPE_TABS.map((tab) => {
          const active = listTypeTab === tab.id;
          const count = tabCounts[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setListTypeTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs ${active ? 'text-indigo-500' : 'text-slate-400'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => setBulkUpdateModal(true)}
            disabled={bulkDeleting || bulkUpdating}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" />
            Bulk Update
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting || bulkUpdating}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {bulkDeleting ? 'Deleting…' : 'Delete selected'}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkDeleting || bulkUpdating}
            className="rounded-md px-2 py-1 text-xs text-indigo-700/80 hover:bg-indigo-100 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <p className="text-xs text-slate-500">
            {searchTerm ? (
              <>{filteredRecords.length} of {tabRecords.length} records</>
            ) : (
              <>{tabRecords.length} records</>
            )}
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search party, description, HSN, category…"
              className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 w-72 max-w-full transition-all"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    disabled={loading || !paginatedRecords.length}
                    className="rounded border-slate-300"
                    aria-label="Select all on this page"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">{activeTab.partyLabel}</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Material</th>
                <th className="px-4 py-3 font-medium">CF (kg per UOM)</th>
                <th className="px-4 py-3 font-medium">HSN</th>
                <th className="px-4 py-3 font-medium">UOM</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="10" className="p-8 text-center text-slate-500">Loading...</td></tr>
              ) : tabRecords.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-slate-500">No {activeTab.label.toLowerCase()} records found.</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-slate-500">No records match your search.</td></tr>
              ) : paginatedRecords.map((r) => (
                <tr key={r.id} className={`hover:bg-slate-50 ${selectedIds.has(r.id) ? 'bg-indigo-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      className="rounded border-slate-300"
                      aria-label={`Select ${r.product_description || 'record'}`}
                    />
                  </td>
                  <td className="px-4 py-3"><StatusBadge record={r} /></td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <TruncatedCell text={r.supplier_name} className="font-medium text-slate-900" />
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <TruncatedCell text={r.product_description} className="text-slate-700" />
                  </td>
                  <td className="px-4 py-3">{r.plastic_category || '—'}</td>
                  <td className="px-4 py-3 max-w-[120px]">
                    <TruncatedCell text={r.plastic_material} className="text-slate-700" />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">{formatConversionFactorWithUnit(r)}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{resolvePackagingHsn(r) || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{resolvePackagingUom(r) || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setModal(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filteredRecords.length > 0 ? (
          <PaginationBar
            currentPage={safePage}
            totalPages={totalPages}
            totalRecords={filteredRecords.length}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        ) : null}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">
                  {modal.id ? 'Edit' : 'New'} {activeTab.label} Record
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{activeTab.hint}</p>
              </div>
              <button type="button" onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              <input
                type="hidden"
                name="list_type"
                value={normalizeRecordListType(modal.list_type || listTypeTab)}
              />
              <input
                type="hidden"
                name="match_type"
                value={modal.match_type || 'exact'}
              />
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Company</label>
                  <select name="company_id" defaultValue={modal.company_id} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <option value="">Select Company</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Product Description</label>
                  <input type="text" name="product_description" defaultValue={modal.product_description} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">HSN</label>
                    <input type="text" name="hsn" defaultValue={modal.hsn || resolvePackagingHsn(modal)} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">UOM</label>
                    <input type="text" name="uom" defaultValue={modal.uom} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">{activeTab.partyGstLabel}</label>
                    <input type="text" name="supplier_gst" defaultValue={modal.supplier_gst} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">{activeTab.partyNameLabel}</label>
                    <input type="text" name="supplier_name" defaultValue={modal.supplier_name} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Plastic Category *</label>
                    <select name="plastic_category" defaultValue={modal.plastic_category || ''} required className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <option value="">Select Category</option>
                      {PLASTIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Plastic Material</label>
                    <select name="plastic_material" defaultValue={modal.plastic_material || ''} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <option value="">Select Plastic Material</option>
                      {PLASTIC_MATERIALS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Recycled %</label>
                    <input type="text" name="recycled_percent" defaultValue={modal.recycled_percent} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Conversion factor (kg per invoice unit) *</label>
                    <input type="number" step="any" name="conversion_factor" defaultValue={modal.conversion_factor ?? ''} required placeholder="e.g. 0.05 for Nos, 2 for Box" className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                    <p className="text-[11px] text-slate-500">Packaging MT = quantity × CF ÷ 1000. Example: 4,000 Nos × 0.05 kg/Nos = 0.20 MT.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">CF Base Source</label>
                    <input type="text" name="cf_base_source" defaultValue={modal.cf_base_source || 'quantity'} className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm">Save Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkUpdateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">
                Bulk Update — {activeTab.label} ({selectedIds.size})
              </h3>
              <button
                type="button"
                onClick={() => setBulkUpdateModal(false)}
                disabled={bulkUpdating}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleBulkUpdate}>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500">
                  Fill only the fields you want to change. Blank fields are left unchanged on each selected record.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Plastic Category</label>
                    <select name="plastic_category" defaultValue="" className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <option value="">— No change —</option>
                      {PLASTIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Plastic Material</label>
                    <select name="plastic_material" defaultValue="" className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <option value="">— No change —</option>
                      {PLASTIC_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Conversion Factor (kg/unit)</label>
                    <input
                      type="number"
                      step="any"
                      name="conversion_factor"
                      placeholder="— No change —"
                      className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">UOM</label>
                    <input
                      type="text"
                      name="uom"
                      placeholder="— No change —"
                      className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">HSN</label>
                    <input
                      type="text"
                      name="hsn"
                      placeholder="— No change —"
                      className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setBulkUpdateModal(false)}
                  disabled={bulkUpdating}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkUpdating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-50"
                >
                  {bulkUpdating ? 'Updating…' : 'Apply to selected'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
