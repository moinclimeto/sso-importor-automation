import { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Trash2, Download, FileSpreadsheet, Loader2, UploadCloud, X, Globe, Plus, ChevronDown, ArrowLeftRight,
} from 'lucide-react';
import {
  downloadExcelTemplate,
  parseExcelFile,
  importExcelRows,
  exportExcelData,
  SALE_TABLE_COLUMNS,
  PURCHASE_TABLE_COLUMNS,
} from '../utils/excelImport.js';
import SingleRecordModal from '../components/SingleRecordModal.jsx';
import { getApi } from '../utils/pwpApi.js';
import InvoiceDetailsModal, {
  ViewInvoiceButton,
} from '../components/InvoiceDetailsModal.jsx';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import * as XLSX from 'xlsx';



const fmt = (n) =>

  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);



const cell = (v) => (v === null || v === undefined || v === '' ? '—' : v);



function CpcbUploadModal({ type, title, onClose }) {

  const [phase, setPhase] = useState('idle'); // idle | opening | waitingLogin | filling | ready | error

  const [busy, setBusy] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);

  const [sessionLoggedIn, setSessionLoggedIn] = useState(false);

  const [userId, setUserId] = useState('');

  const [password, setPassword] = useState('');

  const [showPw, setShowPw] = useState(false);

  const [formError, setFormError] = useState('');

  const [logs, setLogs] = useState([

    {

      t: Date.now(),

      level: 'info',

      text: 'Checking CPCB login session…',

    },

  ]);

  const logsEndRef = useRef(null);



  const addLog = (text, level = 'info') => {

    setLogs((prev) => [...prev, { t: Date.now(), level, text }]);

  };



  useEffect(() => {

    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  }, [logs]);



  useEffect(() => {

    if (!window.pwp?.scraper?.onLog) return undefined;

    return window.pwp.scraper.onLog((payload) => {

      if (payload?.text) addLog(payload.text, payload.level || 'info');

    });

  }, []);



  // On open: check if already logged in — hide credentials when logged in

  useEffect(() => {

    let cancelled = false;

    (async () => {

      setCheckingSession(true);

      try {

        if (!window.pwp?.scraper?.checkCpcbSession) {

          if (!cancelled) {

            setSessionLoggedIn(false);

            addLog('Enter CEPR User ID & Password, then click Submit.', 'info');

          }

          return;

        }

        const res = await window.pwp.scraper.checkCpcbSession({ type });

        if (cancelled) return;

        if (res?.loggedIn) {

          setSessionLoggedIn(true);

          addLog('Already logged in — User ID / Password not required.', 'success');

          addLog('Session keep-alive started (ping every 4 min).', 'info');

          addLog('Click Continue to start upload.', 'info');

        } else {

          setSessionLoggedIn(false);

          addLog('Not logged in — enter CEPR User ID & Password, then Submit.', 'info');

        }

      } catch {

        if (!cancelled) {

          setSessionLoggedIn(false);

          addLog('Enter CEPR User ID & Password, then click Submit.', 'info');

        }

      } finally {

        if (!cancelled) setCheckingSession(false);

      }

    })();

    return () => {

      cancelled = true;

    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on modal open / type

  }, [type]);



  const runBulkAfterLogin = async () => {

    setPhase('filling');



    if (type === 'sale') {

      if (!window.pwp.scraper.fillSalesBulk) {

        addLog('fillSalesBulk IPC missing — restart Electron app.', 'error');

        setPhase('error');

        return;

      }

      addLog('Starting Sales Bulk Entry automation…', 'info');

      const fillRes = await window.pwp.scraper.fillSalesBulk({});

      if (!fillRes?.success) {

        setPhase('error');

        addLog(fillRes?.error || 'Sales bulk fill failed', 'error');

        return;

      }

      addLog('Sales Bulk Entry filled with dummy Excel + ZIP (Preview not clicked).', 'success');

      if (fillRes.excelPath) addLog(`Excel: ${fillRes.excelPath}`, 'info');

      if (fillRes.zipPath) addLog(`ZIP: ${fillRes.zipPath}`, 'info');

      setPhase('ready');

      return;

    }



    if (!window.pwp.scraper.fillProcurementBulk) {

      addLog('fillProcurementBulk IPC missing — restart Electron app.', 'error');

      setPhase('error');

      return;

    }



    addLog('Starting Procurement Bulk Entry automation…', 'info');

    const fillRes = await window.pwp.scraper.fillProcurementBulk({});

    if (!fillRes?.success) {

      setPhase('error');

      addLog(fillRes?.error || 'Bulk fill failed', 'error');

      return;

    }



    addLog('Bulk Entry filled with dummy Excel + ZIP (Preview not clicked).', 'success');

    if (fillRes.excelPath) addLog(`Excel: ${fillRes.excelPath}`, 'info');

    if (fillRes.zipPath) addLog(`ZIP: ${fillRes.zipPath}`, 'info');

    setPhase('ready');

  };



  const handleSubmit = async (e) => {

    e?.preventDefault?.();

    setFormError('');



    if (!window.pwp?.scraper?.openCpcbPortal) {

      setPhase('error');

      addLog('Electron app required. Run: npm run electron:dev', 'error');

      return;

    }



    const id = userId.trim();

    const hasCreds = Boolean(id && password);



    if (!sessionLoggedIn && !hasCreds) {

      setFormError('CEPR User ID and Password are required.');

      return;

    }



    setBusy(true);

    setPhase('opening');

    addLog(sessionLoggedIn ? 'Continuing with existing session…' : 'Opening browser…', 'info');



    try {

      const res = await window.pwp.scraper.openCpcbPortal({

        type,

        userId: id,

        password,

      });

      if (!res?.success) {

        setPhase('error');

        addLog(res?.error || 'Failed to open browser', 'error');

        if (res?.needsLogin) {

          setSessionLoggedIn(false);

          setFormError('CEPR User ID and Password are required.');

        }

        setBusy(false);

        return;

      }



      addLog('Browser opened successfully', 'success');



      if (res.alreadyLoggedIn) {

        setSessionLoggedIn(true);

        addLog('Already logged in — skipping login', 'success');

        await runBulkAfterLogin();

        return;

      }



      if (!hasCreds) {

        setPhase('error');

        setSessionLoggedIn(false);

        setFormError('CEPR User ID and Password are required.');

        addLog('CEPR User ID and Password are required.', 'error');

        return;

      }



      addLog('CEPR User ID & Password filled on portal', 'success');

      addLog('Enter Captcha in browser and click Get OTP', 'info');

      addLog('Waiting for login…', 'info');

      setPhase('waitingLogin');



      const loginRes = await window.pwp.scraper.waitCpcbLogin();

      if (!loginRes?.success) {

        setPhase('error');

        addLog(loginRes?.error || 'Login not detected', 'error');

        return;

      }



      setSessionLoggedIn(true);

      addLog('Logged in successfully', 'success');

      addLog('Session keep-alive started (ping every 4 min).', 'info');

      await runBulkAfterLogin();

    } catch (err) {

      setPhase('error');

      addLog(err?.message || 'Something went wrong', 'error');

    } finally {

      setBusy(false);

    }

  };



  const levelClass = {

    info: 'text-slate-600',

    success: 'text-green-700',

    error: 'text-red-600',

  };



  const fieldsLocked = busy || phase === 'ready' || checkingSession;

  const showCredentials = !sessionLoggedIn && !checkingSession;

  const primaryLabel =

    phase === 'ready'

      ? 'Done'

      : busy

        ? 'Working…'

        : checkingSession

          ? 'Checking…'

          : sessionLoggedIn

            ? 'Continue'

            : 'Submit';



  return (

    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">

          <div className="flex items-center gap-2">

            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-700">

              <UploadCloud size={18} />

            </div>

            <div>

              <h3 className="font-semibold text-slate-900">Upload to CPCB</h3>

              <p className="text-xs text-slate-500">{title}</p>

            </div>

          </div>

          <button

            type="button"

            onClick={onClose}

            disabled={busy}

            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"

          >

            <X size={18} />

          </button>

        </div>



        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">

          {checkingSession && (

            <div className="flex items-center gap-2 text-sm text-slate-500">

              <Loader2 size={16} className="animate-spin text-green-600" />

              Checking CPCB session…

            </div>

          )}



          {showCredentials && (

            <div className="space-y-3">

              <div>

                <label className="label">CEPR User ID</label>

                <input

                  type="text"

                  value={userId}

                  onChange={(e) => setUserId(e.target.value)}

                  className="input"

                  placeholder="Enter CEPR User ID"

                  maxLength={16}

                  disabled={fieldsLocked}

                  autoComplete="username"

                />

              </div>

              <div>

                <label className="label">Password</label>

                <div className="relative">

                  <input

                    type={showPw ? 'text' : 'password'}

                    value={password}

                    onChange={(e) => setPassword(e.target.value)}

                    className="input pr-16"

                    placeholder="Password"

                    maxLength={25}

                    disabled={fieldsLocked}

                    autoComplete="current-password"

                  />

                  <button

                    type="button"

                    onClick={() => setShowPw((v) => !v)}

                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-700"

                    tabIndex={-1}

                  >

                    {showPw ? 'Hide' : 'Show'}

                  </button>

                </div>

              </div>

            </div>

          )}



          {sessionLoggedIn && !checkingSession && phase !== 'ready' && (

            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">

              Logged in to CPCB. Click Continue to upload.

            </div>

          )}



          {formError && <p className="text-sm text-red-500">{formError}</p>}







          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">



            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">



              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live logs</p>



              {(busy || checkingSession) && <Loader2 size={14} className="animate-spin text-green-600" />}



            </div>



            <div className="max-h-44 overflow-y-auto px-3 py-2 space-y-1.5 font-mono text-xs">



              {logs.map((log, i) => (



                <div key={`${log.t}-${i}`} className={`flex gap-2 ${levelClass[log.level] || levelClass.info}`}>



                  <span className="text-slate-400 flex-shrink-0">



                    {new Date(log.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}



                  </span>



                  <span>



                    {log.level === 'success' && '✓ '}



                    {log.level === 'error' && '✗ '}



                    {log.text}



                  </span>



                </div>



              ))}



              <div ref={logsEndRef} />



            </div>



          </div>







          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">



            <div className={`rounded-lg border px-2 py-2 ${phase !== 'idle' && phase !== 'error' ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-100 text-slate-400'}`}>



              1. Browser



            </div>



            <div className={`rounded-lg border px-2 py-2 ${['waitingLogin', 'filling', 'ready'].includes(phase) || sessionLoggedIn ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-100 text-slate-400'}`}>



              2. Captcha / OTP



            </div>



            <div className={`rounded-lg border px-2 py-2 ${phase === 'filling' ? 'border-amber-200 bg-amber-50 text-amber-800' : phase === 'ready' ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-100 text-slate-400'}`}>



              3. Bulk fill



            </div>



          </div>



        </form>







        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">



          <button



            type="button"



            onClick={onClose}



            disabled={busy}



            className="btn-secondary"



          >



            Cancel



          </button>



          <button



            type="button"



            onClick={handleSubmit}



            disabled={fieldsLocked}



            className="btn-primary inline-flex items-center gap-2"



          >



            {busy || checkingSession ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}



            {primaryLabel}



          </button>



        </div>



      </div>



    </div>



  );



}







function rowLineCount(r) {



  return Array.isArray(r?.line_items) ? r.line_items.length : 0;



}







function renderWideTable(rows, columns, onDelete, extras = {}) {
  const {
    onView,
    getValue,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    onMove,
    moveLabel,
  } = extras;
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds?.has(r.id));
  const someSelected = rows.some((r) => selectedIds?.has(r.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[1200px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="th w-10 sticky left-0 bg-slate-50 z-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={(e) => onToggleSelectAll?.(e.target.checked)}
                className="rounded border-slate-300"
                aria-label="Select all"
              />
            </th>
            {columns.map((col) => (
              <th key={col.key} className="th whitespace-nowrap">
                {col.label}
              </th>
            ))}
            <th className="th text-right sticky right-0 bg-slate-50">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, idx) => (
            <tr key={r.id ?? idx} className={`hover:bg-slate-50/80 ${selectedIds?.has(r.id) ? 'bg-blue-50/40' : ''}`}>
              <td className="td sticky left-0 bg-white z-10">
                <input
                  type="checkbox"
                  checked={!!selectedIds?.has(r.id)}
                  onChange={() => onToggleSelect?.(r.id)}
                  className="rounded border-slate-300"
                  aria-label={`Select row ${r.id}`}
                />
              </td>
              {columns.map((col) => {
                let value = r[col.key];
                if (getValue) value = getValue(r, col, idx, value);
                return (
                  <td
                    key={col.key}
                    className="td whitespace-nowrap max-w-[220px] truncate"
                    title={String(cell(value))}
                  >
                    {cell(value)}
                  </td>
                );
              })}
              <td className="td text-right sticky right-0 bg-white">
                <div className="inline-flex items-center gap-1.5">
                  <ViewInvoiceButton
                    onClick={() => onView?.(r)}
                    disabled={!rowLineCount(r)}
                    title={rowLineCount(r) ? 'View line items' : 'No line items'}
                  />
                  {onMove && (
                    <button
                      type="button"
                      onClick={() => onMove(r)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-700"
                      title={moveLabel || 'Move'}
                    >
                      <ArrowLeftRight size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



function purchaseToSalePayload(row) {
  const lineItems = row.line_items || row.lineItems || null;
  const party = row.supplier_name || row.vendor_name || row.entity_name || '';
  return {
    company_id: row.company_id,
    company_name: row.company_name,
    record_type: row.record_type,
    entity_name: party,
    customer_name: party,
    customer_gstin: row.supplier_gst_number || row.vendor_gstin || '',
    category_of_plastic: row.category_of_plastic,
    state: row.state,
    address: [row.address_line_1, row.address_line_2].filter(Boolean).join(', ') || row.address,
    district: row.city || row.district,
    financial_year: row.financial_year,
    invoice_no: row.invoice_number || row.invoice_no,
    application_number: row.invoice_number || row.invoice_no,
    invoice_date: row.invoice_date || row.procurement_date,
    invoice_file_name: row.invoice_filename || row.invoice_file_name,
    quantity_sold_mt: row.quantity_mt || row.quantity,
    quantity: row.quantity || row.quantity_mt,
    unit: row.unit,
    total_amount: row.total_amount,
    item_name: row.item_name,
    hsn_code: row.hsn_code,
    lineItems,
    extraction: row.extraction,
    _source_fields: row._source_fields,
    _routing: { ...(row._routing || {}), movedFrom: 'purchase', movedAt: new Date().toISOString() },
    fileHash: row.file_hash || row.fileHash,
  };
}

function saleToPurchasePayload(row) {
  const lineItems = row.line_items || row.lineItems || null;
  const party = row.entity_name || row.customer_name || '';
  return {
    company_id: row.company_id,
    company_name: row.company_name,
    record_type: row.record_type,
    supplier_name: party,
    vendor_name: party,
    vendor_gstin: row.customer_gstin || '',
    supplier_gst_number: row.customer_gstin || '',
    category_of_plastic: row.category_of_plastic,
    state: row.state,
    city: row.district || row.city,
    address_line_1: row.address,
    invoice_number: row.invoice_no || row.application_number,
    invoice_no: row.invoice_no || row.application_number,
    invoice_date: row.invoice_date,
    procurement_date: row.invoice_date,
    invoice_filename: row.invoice_file_name || row.invoice_filename,
    quantity_mt: row.quantity_sold_mt || row.quantity,
    quantity: row.quantity || row.quantity_sold_mt,
    unit: row.unit,
    total_amount: row.total_amount,
    item_name: row.item_name,
    hsn_code: row.hsn_code,
    lineItems,
    extraction: row.extraction,
    _source_fields: row._source_fields,
    _routing: { ...(row._routing || {}), movedFrom: 'sale', movedAt: new Date().toISOString() },
    fileHash: row.file_hash || row.fileHash,
  };
}


function ConfirmActionModal({ open, kind, count, fromLabel, toLabel, busy, onCancel, onConfirm }) {
  if (!open) return null;
  const isMove = kind === 'move';
  const isBulk = count > 1;
  const title = isMove
    ? (isBulk ? `Move ${count} records` : 'Move record')
    : (isBulk ? `Delete ${count} records` : 'Delete record');
  const description = isMove
    ? (isBulk
      ? `These ${count} records will be moved from ${fromLabel} to ${toLabel}.`
      : `This record will be moved from ${fromLabel} to ${toLabel}.`)
    : (isBulk
      ? `Permanently delete ${count} selected records? This cannot be undone.`
      : 'Permanently delete this record? This cannot be undone.');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/45" onClick={busy ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isMove ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
              {isMove ? <ArrowLeftRight size={18} /> : <Trash2 size={18} />}
            </div>
            <div className="min-w-0">
              <h2 id="confirm-action-title" className="text-base font-semibold text-slate-800">{title}</h2>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">{description}</p>
            </div>
          </div>

          {isMove && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
              <span className="rounded-md bg-white px-2 py-1 border border-slate-200 text-slate-700 font-medium">{fromLabel}</span>
              <ArrowLeftRight size={14} className="text-amber-600 shrink-0" />
              <span className="rounded-md bg-amber-50 px-2 py-1 border border-amber-200 text-amber-800 font-medium">{toLabel}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50/60 rounded-b-2xl">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${isMove ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {isMove ? 'Move' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocTable() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef(null);
  const { setPageHeader, clearPageHeader } = usePageHeader();

  const type = location.state?.type === 'sale' ? 'sale' : 'purchase';
  const isPurchase = type === 'purchase';
  const title = isPurchase ? 'Procurement' : 'Post Consumer';







  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [globalBankMissing, setGlobalBankMissing] = useState(false);



  const [loading, setLoading] = useState(true);



  const [importing, setImporting] = useState(false);



  const [message, setMessage] = useState('');



  const [error, setError] = useState('');



  const [cpcbOpen, setCpcbOpen] = useState(false);
  const [excelMenuOpen, setExcelMenuOpen] = useState(false);
  const excelMenuRef = useRef(null);

  const [addOpen, setAddOpen] = useState(false);



  const [detailRow, setDetailRow] = useState(null);
  
  // Month-wise view state
  const [viewMode, setViewMode] = useState('row'); // 'row' | 'month'
  const [monthDetail, setMonthDetail] = useState(null); // stores the month group object when viewing month details

  const monthGroups = useMemo(() => {
    const groups = {};
    rows.forEach(r => {
      const dateStr = r.invoice_date || r.date_of_entry || r.created_at;
      let dateObj = new Date();
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed)) dateObj = parsed;
      }
      const monthYear = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      
      if (!groups[monthKey]) {
        groups[monthKey] = {
          label: monthYear,
          key: monthKey,
          rows: [],
          totalQtyMT: 0,
          totalQtyKg: 0,
        };
      }
      
      groups[monthKey].rows.push(r);
      const qtyMT = parseFloat(r.quantity_sold_mt || r.quantity_mt || r.available_quantity_mt || 0);
      const qtyKg = parseFloat(r.quantity_kg || 0);
      if (!isNaN(qtyMT)) groups[monthKey].totalQtyMT += qtyMT;
      if (!isNaN(qtyKg)) groups[monthKey].totalQtyKg += qtyKg;
    });
    
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [rows]);

  const handleDownloadMonthInvoices = async (monthGroup) => {
    if (!monthGroup || !monthGroup.rows.length) return;
    try {
      const headers = isPurchase ? PURCHASE_TABLE_COLUMNS.map(c => c.label) : SALE_TABLE_COLUMNS.map(c => c.label);
      const exportRows = monthGroup.rows.map(r => {
        const rowData = {};
        const columns = isPurchase ? PURCHASE_TABLE_COLUMNS : SALE_TABLE_COLUMNS;
        columns.forEach(c => {
          rowData[c.label] = r[c.key] !== null && r[c.key] !== undefined ? r[c.key] : '';
        });
        return rowData;
      });
      
      const pdfFiles = monthGroup.rows.map(r => ({
        name: r.invoice_filename || r.invoice_file_name,
        localPath: r.local_pdf_path
      })).filter(f => f.name);

      const res = await window.pwp.invoices.exportZip({
        type: isPurchase ? 'Purchase' : 'Sales',
        label: monthGroup.label,
        exportRows,
        headers,
        pdfFiles
      });

      if (res && res.error) {
        alert('Failed to download invoices ZIP: ' + res.error);
      }
    } catch (err) {
      alert('Failed to download invoices: ' + err.message);
    }
  };







  const load = async () => {



    setLoading(true);



    try {



      const api = getApi();



      const data = isPurchase
        ? await api.purchases.getAll()
        : await api.sales.getAll();
      setRows(data || []);

      if (!isPurchase) {
        const globalBank = await window.pwp?.settings?.get('global_bank_details');
        setGlobalBankMissing(!globalBank?.account_number || !globalBank?.ifsc_code);
      }




    } catch {



      setRows([]);



    } finally {



      setLoading(false);



    }



  };







  useEffect(() => {
    setSelectedIds(new Set());
    load();
  }, [type]);







  const moveLabel = isPurchase ? 'Move to Sale' : 'Move to Purchase';
  const fromLabel = isPurchase ? 'Procurement' : 'Post Consumer';
  const toLabel = isPurchase ? 'Post Consumer' : 'Procurement';

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) setSelectedIds(new Set(rows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const clearSelection = () => setSelectedIds(new Set());

  const requestDelete = (id) => {
    setConfirmDialog({ kind: 'delete', ids: [id], count: 1 });
  };

  const requestMove = (row) => {
    setConfirmDialog({ kind: 'move', rows: [row], count: 1 });
  };

  const requestBulkDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setConfirmDialog({ kind: 'delete', ids, count: ids.length });
  };

  const requestBulkMove = () => {
    const selectedRows = rows.filter((r) => selectedIds.has(r.id));
    if (!selectedRows.length) return;
    setConfirmDialog({ kind: 'move', rows: selectedRows, count: selectedRows.length });
  };

  const executeConfirmedAction = async () => {
    if (!confirmDialog) return;
    setActionBusy(true);
    try {
      const api = getApi();
      if (confirmDialog.kind === 'delete') {
        for (const id of confirmDialog.ids) {
          if (isPurchase) await api.purchases.delete(id);
          else await api.sales.delete(id);
        }
        clearSelection();
      } else if (confirmDialog.kind === 'move') {
        for (const row of confirmDialog.rows) {
          if (isPurchase) {
            await api.sales.add(purchaseToSalePayload(row));
            await api.purchases.delete(row.id);
          } else {
            await api.purchases.add(saleToPurchasePayload(row));
            await api.sales.delete(row.id);
          }
        }
        clearSelection();
      }
      setConfirmDialog(null);
      await load();
    } catch (err) {
      alert(err?.message || 'Action failed');
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const tableExtras = (base) => ({
    ...base,
    selectedIds,
    onToggleSelect: toggleSelect,
    onToggleSelectAll: toggleSelectAll,
    onMove: (r) => requestMove(r),
    moveLabel,
  });


  const handleDownloadTemplate = () => {



    setError('');



    setMessage('');



    downloadExcelTemplate(type);



    setMessage(`${title} Excel template downloaded.`);



  };







  const handleImportClick = () => {



    setError('');



    setMessage('');



    fileRef.current?.click();



  };







  const handleFileChange = async (e) => {



    const file = e.target.files?.[0];



    e.target.value = '';



    if (!file) return;







    const name = file.name.toLowerCase();



    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {



      setError('Please upload an .xlsx, .xls, or .csv file.');



      return;



    }







    setImporting(true);



    setError('');



    setMessage('');



    try {



      const { rows: parsed, errors } = await parseExcelFile(file, type);



      const saved = await importExcelRows(type, parsed);



      let msg = `Imported ${saved} ${title.toLowerCase()} record(s) from Excel.`;



      if (errors?.length) {



        msg += ` Skipped ${errors.length} invalid row(s).`;



      }



      setMessage(msg);



      await load();



    } catch (err) {



      setError(err?.message || 'Excel import failed');



    } finally {



      setImporting(false);



    }



  };







  useEffect(() => {
    if (!excelMenuOpen) return undefined;
    const onDocClick = (e) => {
      if (excelMenuRef.current && !excelMenuRef.current.contains(e.target)) {
        setExcelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [excelMenuOpen]);

  useEffect(() => {
    const id = setPageHeader({
      sectionTitle: title,
      onBack: () => navigate('/doc-processor'),
      uploadState: { type },
      actions: (
        <>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 transition-colors"
          >
            <Plus size={16} />
            Add
          </button>
          <div className="relative" ref={excelMenuRef}>
            <button
              type="button"
              onClick={() => setExcelMenuOpen((v) => !v)}
              disabled={importing}
              aria-expanded={excelMenuOpen}
              aria-haspopup="menu"
              className={`inline-flex items-center gap-2 rounded-lg border text-sm font-medium px-3 py-2 transition-all duration-200 disabled:opacity-60 ${
                excelMenuOpen
                  ? 'border-green-300 bg-green-50 text-green-800 shadow-sm'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              {importing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={16} />
              )}
              {importing ? 'Importing…' : 'Excel'}
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ease-out ${excelMenuOpen ? 'rotate-180' : 'rotate-0'}`}
              />
            </button>
            {!importing && (
              <div
                role="menu"
                className={`absolute right-0 top-full mt-2 z-[80] w-56 origin-top-right rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-xl shadow-slate-200/60 ring-1 ring-black/5 transition-all duration-200 ease-out ${
                  excelMenuOpen
                    ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                    : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
                }`}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExcelMenuOpen(false);
                    handleDownloadTemplate();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Download size={15} />
                  </span>
                  <span>
                    <span className="block font-medium text-slate-800">Download template</span>
                    <span className="block text-[11px] text-slate-400">Blank Excel format</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExcelMenuOpen(false);
                    handleImportClick();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-green-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-700">
                    <FileSpreadsheet size={15} />
                  </span>
                  <span>
                    <span className="block font-medium text-slate-800">Import Excel</span>
                    <span className="block text-[11px] text-slate-400">Upload .xlsx / .csv</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!rows.length}
                  onClick={() => {
                    setExcelMenuOpen(false);
                    exportExcelData(type, rows);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <FileSpreadsheet size={15} />
                  </span>
                  <span>
                    <span className="block font-medium text-slate-800">Export Excel</span>
                    <span className="block text-[11px] text-slate-400">Download current rows</span>
                  </span>
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCpcbOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-green-600 text-green-700 bg-white hover:bg-green-50 text-sm font-medium px-3 py-2 transition-colors"
          >
            <UploadCloud size={16} />
            Upload CPCB
          </button>
        </>
      ),
    });
    return () => clearPageHeader(id);
  }, [title, type, rows.length, importing, excelMenuOpen, navigate, setPageHeader, clearPageHeader]);

  return (
    <div className="space-y-5 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('row')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'row' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Row-wise
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Month-wise
            </button>
          </div>
          <p className="text-xs text-slate-500">{rows.length} records</p>
          {selectedIds.size > 0 && (
            <>
              <span className="h-4 w-px bg-slate-200" />
              <span className="text-xs font-medium text-blue-700">{selectedIds.size} selected</span>
              <button
                type="button"
                onClick={requestBulkMove}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
              >
                <ArrowLeftRight size={12} />
                {moveLabel}
              </button>
              <button
                type="button"
                onClick={requestBulkDelete}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 size={12} />
                Delete
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Clear
              </button>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-line mb-4">
          {error}
        </div>
      )}

      {!isPurchase && rows.length > 0 && globalBankMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start justify-between gap-2 mb-4">
          <div className="flex items-start gap-2">
            <Globe size={18} className="text-amber-500 mt-0.5 shrink-0" />
            <span>
              <b>Disclaimer:</b> Global Bank Details (Account No / IFSC) for Sales are missing.
            </span>
          </div>
          <button onClick={() => navigate('/cpcb-dashboard')} className="text-indigo-600 font-medium hover:underline shrink-0">
            Add in Dashboard
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {loading ? (



          <div className="p-10 text-center text-sm text-slate-500">Loading…</div>



        ) : rows.length === 0 ? (



          <div className="p-10 text-center text-sm text-slate-500 space-y-3">



            <p>No records yet.</p>



            <p className="text-xs text-slate-400">Upload invoices or import Excel to add rows.</p>



          </div>
        ) : viewMode === 'month' ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Month</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Total Records</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Total Quantity (MT)</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthGroups.map((mg) => (
                  <tr key={mg.key} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{mg.label}</td>
                    <td className="px-4 py-3 text-slate-600">{mg.rows.length}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(mg.totalQtyMT)} MT</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setMonthDetail(mg)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDownloadMonthInvoices(mg)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 flex items-center gap-1.5"
                        >
                          <Download size={14} /> Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isPurchase ? (



          renderWideTable(rows, PURCHASE_TABLE_COLUMNS, requestDelete, tableExtras({
            onView: (r) => setDetailRow({ data: r, fileName: r.invoice_filename }),



            getValue: (r, col, _idx, value) => {

              if (col.key === 'category_of_plastic') return 'Cat-II';

              if (col.key === 'supplier_name' && !value) return r.vendor_name;



              if (col.key === 'invoice_number' && !value) return r.invoice_no;



              // Explicitly handle date columns with fallbacks for purchases



              if (col.key === 'invoice_date') {



                return cell(r.invoice_date || r.procurement_date || r.date_of_entry || value);



              }



              if (col.key === 'procurement_date') {



                return cell(r.procurement_date || r.invoice_date || value);



              }



              if (col.key === 'date_of_entry') {



                return cell(r.date_of_entry || r.invoice_date || value);



              }



              if (col.key === 'supplier_gst_number' && !value) return r.vendor_gstin;



              if (col.key === 'quantity_mt' && (value === undefined || value === '')) {



                return r.quantity != null ? fmt(r.quantity) : value;



              }



              if (



                (col.key === 'quantity_mt' || col.key === 'quantity_kg') &&



                value !== undefined &&



                value !== ''



              ) {



                return fmt(value);



              }



              if (col.key === 'quantity_kg' && (value === undefined || value === '') && r.quantity_mt) {



                return fmt(Number(r.quantity_mt) * 1000);



              }



              return value;



            },



          }))



        ) : (



          renderWideTable(rows, SALE_TABLE_COLUMNS, requestDelete, tableExtras({
            onView: (r) => setDetailRow({ data: r, fileName: r.invoice_file_name }),



            getValue: (r, col, idx, value) => {

              if (col.key === 's_no' && (value === undefined || value === '')) return idx + 1;

              if (col.key === 'entity_name' && !value) return r.customer_name;

              if (col.key === 'category_of_plastic') return 'Cat-II';
              if (col.key === 'product_type') {
                const hsn = String(r.hsn_code || r.hsn || '').trim();
                return hsn === '25231000' ? 'Clinker' : 'Cement';
              }

              // Handle invoice_date for sales



              if (col.key === 'invoice_date') {



                return cell(r.invoice_date || value);



              }



              if (col.key === 'recycled_plastic_percent') {
                if (r.product_type === 'Clinker') return '100';
                return '';
              }

              if (
                ['conversion_factor', 'available_quantity_mt', 'quantity_sold_mt', 'gst_other_charges'].includes(col.key) &&
                value !== undefined &&
                value !== ''
              ) {
                return fmt(value);
              }



              return value;



            },



          }))



        )}



      </div>







      {cpcbOpen && (



        <CpcbUploadModal



          type={type}



          title={title}



          onClose={() => setCpcbOpen(false)}



        />



      )}







      {addOpen && (



        <SingleRecordModal



          type={type}



          onClose={() => setAddOpen(false)}



          onSaved={() => {



            setMessage(`${title} record added successfully.`);



            load();



          }}



        />



      )}

      {monthDetail && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{monthDetail.label} - {title}</h3>
                <p className="text-sm text-slate-500">{monthDetail.rows.length} records • {fmt(monthDetail.totalQtyMT)} MT Total</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownloadMonthInvoices(monthDetail)}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 text-white text-sm font-medium px-4 py-2"
                >
                  <Download size={16} /> Download
                </button>
                <button
                  onClick={() => setMonthDetail(null)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-0 overflow-y-auto flex-1">
              {renderWideTable(monthDetail.rows, isPurchase ? PURCHASE_TABLE_COLUMNS : SALE_TABLE_COLUMNS, requestDelete, tableExtras({
                onView: (r) => setDetailRow({ data: r, fileName: r.invoice_filename || r.invoice_file_name }),
              }))}
            </div>
          </div>
        </div>
      )}

      <ConfirmActionModal
        open={Boolean(confirmDialog)}
        kind={confirmDialog?.kind}
        count={confirmDialog?.count || 0}
        fromLabel={fromLabel}
        toLabel={toLabel}
        busy={actionBusy}
        onCancel={() => !actionBusy && setConfirmDialog(null)}
        onConfirm={executeConfirmedAction}
      />

      <InvoiceDetailsModal



        open={Boolean(detailRow)}



        invoice={detailRow}



        docType={type}



        onClose={() => setDetailRow(null)}



      />



    </div>



  );



}

