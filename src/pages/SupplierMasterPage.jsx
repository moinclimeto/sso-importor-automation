import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Users, Upload, Download, FileSpreadsheet, Loader2, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { Toast, useToast } from '../components/Toast.jsx';
import { PURCHASE_ENTITY_TYPES, REGISTRATION_TYPE_OPTIONS } from '../../shared/entityRegistrationTypes.js';
import {
  downloadSupplierMasterTemplate,
  exportSupplierMasterExcel,
  parseSupplierMasterExcel,
} from '../utils/supplierMasterExcel.js';
import PiboMasterListPicker from '../components/PiboMasterListPicker.jsx';
import { isPiboSearchEligible, normalizePiboEntityForForm } from '../../shared/piboEntityMasterData.js';

const EMPTY_SUPPLIER_FORM = {
  company_id: '',
  gst_number: '',
  trade_name: '',
  address: '',
  mobile: '',
  registration_number: '',
  state: '',
  pan: '',
  entity_type: '',
  registration_type: 'Unregistered',
  source: 'manual',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const DETAIL_LABEL = 'text-[11px] font-medium text-slate-600';
const DETAIL_INPUT = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';
const DETAIL_INPUT_MONO = `${DETAIL_INPUT} font-mono`;

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

export default function SupplierMasterPage({ embedded = false }) {
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM);
  const [piboVerified, setPiboVerified] = useState(false);
  const fileInputRef = useRef(null);
  const actionsRef = useRef(null);
  const { setPageHeader, clearPageHeader } = usePageHeader();
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    if (embedded) return undefined;
    setPageHeader({
      title: 'Supplier/Customer Master',
      icon: Users,
      description: 'Manage supplier and customer profiles and registrations',
    });
    return clearPageHeader;
  }, [embedded, setPageHeader, clearPageHeader]);

  const load = async () => {
    if (!window.pwp?.supplierMaster) { setLoading(false); return; }
    setLoading(true);
    try {
      const [data, comps] = await Promise.all([
        window.pwp.supplierMaster.getAll(),
        window.pwp.companies.getAll(),
      ]);
      setRecords(data || []);
      setCompanies(comps || []);
    } catch {
      showToast('Error loading supplier/customer records', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!modal) {
      setForm(EMPTY_SUPPLIER_FORM);
      setPiboVerified(false);
      return;
    }
    setForm({
      company_id: modal.company_id ?? '',
      gst_number: modal.gst_number ?? '',
      trade_name: modal.trade_name ?? '',
      address: modal.address ?? '',
      mobile: String(modal.mobile ?? ''),
      registration_number: String(modal.registration_number ?? ''),
      state: modal.state ?? '',
      pan: modal.pan ?? '',
      entity_type: modal.entity_type ?? '',
      registration_type: modal.registration_type || 'Unregistered',
      source: modal.source || 'manual',
    });
    setPiboVerified(
      modal.registration_type === 'Registered'
      && modal.source === 'pibo_registered',
    );
  }, [modal]);

  const openEditForRegistered = (record) => {
    if (!record?.entity_type) {
      showToast('Select Entity Type first, then choose Registered for CPCB PIBO verification.', 'error');
      setModal(record);
      return;
    }
    setModal({ ...record, registration_type: 'Registered' });
    showToast('Verify this supplier in CPCB PIBO records before saving as Registered.', 'info', { duration: 6000 });
  };

  const updateForm = (patch) => {
    setForm((prev) => {
      const entityTypeChanged = patch.entity_type != null && patch.entity_type !== prev.entity_type;
      if (
        patch.registration_type === 'Unregistered'
        || patch.registration_type === 'Registered'
        || entityTypeChanged
      ) {
        setPiboVerified(false);
      }

      const next = { ...prev, ...patch };
      if (patch.registration_type === 'Unregistered') {
        next.source = 'manual';
      } else if (patch.registration_type === 'Registered' && patch.source !== 'pibo_registered') {
        next.source = 'manual';
      } else if (entityTypeChanged && next.registration_type === 'Registered') {
        next.source = 'manual';
      }
      return next;
    });
  };

  const handlePiboSelect = (entity) => {
    const normalized = normalizePiboEntityForForm(entity);
    setPiboVerified(true);
    setForm((prev) => ({
      ...prev,
      ...normalized,
      registration_type: 'Registered',
      source: 'pibo_registered',
    }));
  };

  const showPiboPicker = isPiboSearchEligible(form.registration_type, form.entity_type);

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const onPointerDown = (event) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target)) {
        setActionsOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [actionsOpen]);

  const closeActions = () => setActionsOpen(false);

  const runAction = (action) => {
    closeActions();
    action();
  };

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, safePage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!window.pwp?.supplierMaster) return;

    let payload = { ...form };
    if (payload.registration_type === 'Registered' && !piboVerified) {
      showToast(
        'CPCB PIBO verification required. Select a PIBO record below, or save as Unregistered.',
        'error',
        { duration: 7000 },
      );
      return;
    }
    if (payload.registration_type !== 'Registered') {
      payload = { ...payload, registration_type: 'Unregistered', source: 'manual' };
    }

    try {
      if (modal?.id) {
        const result = await window.pwp.supplierMaster.update({ ...payload, id: modal.id });
        if (result?.success === false) throw new Error(result.error || 'Update failed');
        showToast('Supplier/Customer updated', 'success');
      } else {
        const result = await window.pwp.supplierMaster.add(payload);
        if (result?.success === false) throw new Error(result.error || 'Add failed');
        showToast('Supplier/Customer added', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this supplier/customer record?')) return;
    try {
      await window.pwp.supplierMaster.delete(id);
      showToast('Supplier/Customer deleted', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleInlineUpdate = async (record, patch) => {
    if (patch.registration_type === 'Registered') {
      openEditForRegistered(record);
      return;
    }
    if (!window.pwp?.supplierMaster) return;
    try {
      const result = await window.pwp.supplierMaster.update({ id: record.id, ...patch });
      if (result?.success === false) throw new Error(result.error || 'Update failed');
      setRecords((prev) => prev.map((row) => (
        row.id === record.id ? { ...row, ...patch } : row
      )));
      showToast('Supplier/Customer updated', 'success');
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      load();
    }
  };

  const handleExport = async () => {
    try {
      await exportSupplierMasterExcel(records, companies);
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadSupplierMasterTemplate(companies);
    } catch (err) {
      showToast(err.message || 'Template download failed', 'error');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.pwp?.supplierMaster?.bulkUpsert) {
      showToast('Import needs the Electron app (restart if you just updated).', 'error');
      return;
    }

    setImporting(true);
    setImportSummary(null);
    try {
      const { rows, errors: parseErrors } = await parseSupplierMasterExcel(file, companies);
      if (!rows.length) {
        throw new Error(parseErrors[0] || 'No valid rows found in Excel.');
      }

      const result = await window.pwp.supplierMaster.bulkUpsert({ rows });
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
          `Import saved: ${summary.added} added, ${summary.updated} updated${summary.failed ? `, ${summary.failed} skipped` : ''}`,
          summary.failed ? 'warning' : 'success',
          { duration: 5000 },
        );
        await load();
      } else {
        showToast(
          summary.errors[0] || 'No supplier/customer records were imported. Check the Excel file.',
          'error',
          { duration: 5000 },
        );
      }
    } catch (err) {
      showToast(err.message || 'Import failed', 'error', { duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" />
          Supplier/Customer
        </h2>
        <div className="relative" ref={actionsRef}>
          <button
            type="button"
            onClick={() => setActionsOpen((open) => !open)}
            disabled={importing}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white pl-4 pr-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Supplier/Customer Actions
            <ChevronDown className={`w-4 h-4 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
          </button>

          {actionsOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => runAction(() => setModal({}))}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4 text-indigo-500" />
                Add Supplier/Customer
              </button>
              <div className="my-1 border-t border-slate-100" />
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Excel
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
                disabled={!records.length}
                onClick={() => runAction(handleExport)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => runAction(handleImportClick)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Upload className="w-4 h-4 text-slate-400" />
                Import Excel
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

      {importSummary ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-slate-800">Last import summary</p>
              <p className="text-slate-600 mt-1">
                {importSummary.added} added · {importSummary.updated} updated
                {importSummary.failed ? ` · ${importSummary.failed} skipped` : ''}
              </p>
              {importSummary.errors?.length ? (
                <ul className="mt-2 text-red-600 list-disc pl-5 space-y-0.5">
                  {importSummary.errors.slice(0, 8).map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setImportSummary(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              &times;
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">GST Number</th>
                <th className="px-4 py-3 font-medium">Supplier/Customer Company Name</th>
                <th className="px-4 py-3 font-medium">Entity Type</th>
                <th className="px-4 py-3 font-medium">Registration Type</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">No supplier/customer records found.</td></tr>
              ) : paginatedRecords.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{companies.find((c) => c.id === Number(r.company_id))?.name || r.company_id}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{r.gst_number}</td>
                  <td className="px-4 py-3 text-slate-700">{r.trade_name}</td>
                  <td className="px-4 py-3">
                    <select
                      value={r.entity_type || ''}
                      onChange={(e) => handleInlineUpdate(r, { entity_type: e.target.value })}
                      className="w-full min-w-[140px] rounded-md border-slate-200 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="">Select Entity Type</option>
                      {PURCHASE_ENTITY_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.registration_type || 'Unregistered'}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === 'Registered') {
                          openEditForRegistered(r);
                          return;
                        }
                        handleInlineUpdate(r, { registration_type: next });
                      }}
                      className="w-full min-w-[140px] rounded-md border-slate-200 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      {REGISTRATION_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setModal(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && records.length > 0 ? (
          <PaginationBar
            currentPage={safePage}
            totalPages={totalPages}
            totalRecords={records.length}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        ) : null}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {modal.id ? 'Edit Supplier/Customer' : 'New Supplier/Customer'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Link a supplier or customer to your company profile and registration details.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-6">
                <section className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Company & Registration</h4>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Your Company</label>
                    <select
                      name="company_id"
                      value={form.company_id}
                      onChange={(e) => updateForm({ company_id: e.target.value })}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="">Select Company</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">Entity Type</label>
                      <select
                        name="entity_type"
                        value={form.entity_type}
                        onChange={(e) => updateForm({ entity_type: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="">Select Entity Type</option>
                        {PURCHASE_ENTITY_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">Registration Type</label>
                      <select
                        name="registration_type"
                        value={form.registration_type}
                        onChange={(e) => updateForm({ registration_type: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        {REGISTRATION_TYPE_OPTIONS.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {showPiboPicker ? (
                  <section>
                    {form.registration_type === 'Registered' && !piboVerified ? (
                      <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Select a CPCB PIBO record below to verify this supplier. Without verification, you can only save as Unregistered.
                      </p>
                    ) : null}
                    {piboVerified ? (
                      <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 size={14} />
                        CPCB PIBO verified — you can save as Registered.
                      </p>
                    ) : null}
                    <PiboMasterListPicker
                      entityType={form.entity_type}
                      registrationType={form.registration_type}
                      onSelect={handlePiboSelect}
                    />
                  </section>
                ) : form.registration_type === 'Registered' && !form.entity_type ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Select Entity Type above to search CPCB PIBO records.
                  </p>
                ) : null}

                <section className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Supplier / Customer Details
                    </h4>
                    {form.source === 'pibo_registered' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                        <CheckCircle2 size={11} />
                        Filled from PIBO
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="space-y-0.5">
                      <label className={DETAIL_LABEL}>Registration No.</label>
                      <input
                        type="text"
                        name="registration_number"
                        value={form.registration_number}
                        onChange={(e) => updateForm({ registration_number: e.target.value, source: 'manual' })}
                        placeholder="EPR / CPCB no."
                        className={DETAIL_INPUT_MONO}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={DETAIL_LABEL}>Mobile</label>
                      <input
                        type="text"
                        name="mobile"
                        value={form.mobile}
                        onChange={(e) => updateForm({ mobile: e.target.value, source: 'manual' })}
                        placeholder="Contact no."
                        className={DETAIL_INPUT}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={DETAIL_LABEL}>GST Number</label>
                      <input
                        type="text"
                        name="gst_number"
                        value={form.gst_number}
                        onChange={(e) => updateForm({ gst_number: e.target.value, source: 'manual' })}
                        placeholder="15-char GSTIN"
                        className={DETAIL_INPUT_MONO}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className={DETAIL_LABEL}>PAN</label>
                      <input
                        type="text"
                        name="pan"
                        value={form.pan}
                        onChange={(e) => updateForm({ pan: e.target.value.toUpperCase(), source: 'manual' })}
                        placeholder="PAN"
                        className={`${DETAIL_INPUT_MONO} uppercase`}
                      />
                    </div>
                    <div className="space-y-0.5 col-span-2">
                      <label className={DETAIL_LABEL}>State</label>
                      <input
                        type="text"
                        name="state"
                        value={form.state}
                        onChange={(e) => updateForm({ state: e.target.value, source: 'manual' })}
                        placeholder="State"
                        className={DETAIL_INPUT}
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <label className={DETAIL_LABEL}>Supplier/Customer Company Name</label>
                    <input
                      type="text"
                      name="trade_name"
                      value={form.trade_name}
                      onChange={(e) => updateForm({ trade_name: e.target.value, source: 'manual' })}
                      required
                      placeholder="Legal or trade name"
                      className={DETAIL_INPUT}
                    />
                  </div>

                  <div className="space-y-0.5">
                    <label className={DETAIL_LABEL}>Address</label>
                    <textarea
                      name="address"
                      value={form.address}
                      onChange={(e) => updateForm({ address: e.target.value, source: 'manual' })}
                      rows={2}
                      placeholder="Registered address"
                      className={`${DETAIL_INPUT} resize-none leading-snug`}
                    />
                  </div>
                </section>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors">
                  Save Supplier/Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}
