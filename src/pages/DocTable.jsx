import { useEffect, useRef, useState } from 'react';
image.png
import { useLocation, useNavigate } from 'react-router-dom';

import {

  ArrowLeft, Trash2, Download, FileSpreadsheet, Loader2, UploadCloud, X, Globe, Plus

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



  return (



    <div className="overflow-x-auto">



      <table className="w-full text-sm min-w-[1200px]">



        <thead className="bg-slate-50 border-b border-slate-200">



          <tr>



            {columns.map((col) => (



              <th key={col.key} className="th whitespace-nowrap">



                {col.label}



              </th>



            ))}



            <th className="th whitespace-nowrap">Lines</th>



            <th className="th" />



          </tr>



        </thead>



        <tbody>



          {rows.map((r, idx) => (



            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">



              {columns.map((col) => {



                let value = r[col.key];



                if (extras.getValue) {



                  value = extras.getValue(r, col, idx, value);



                }



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



              <td className="td text-center tabular-nums">{rowLineCount(r) || '—'}</td>



              <td className="td text-right sticky right-0 bg-white">



                <div className="inline-flex items-center gap-1.5">



                  <ViewInvoiceButton



                    onClick={() => extras.onView?.(r)}



                    disabled={!rowLineCount(r)}



                    title={rowLineCount(r) ? 'View line items' : 'No line items'}



                  />



                  <button



                    type="button"



                    onClick={() => onDelete(r.id)}



                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"



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







export default function DocTable() {



  const navigate = useNavigate();



  const location = useLocation();



  const fileRef = useRef(null);



  const type = location.state?.type === 'sale' ? 'sale' : 'purchase';



  const isPurchase = type === 'purchase';



  const title = isPurchase ? 'Procurement' : 'Post Consumer';







  const [rows, setRows] = useState([]);



  const [loading, setLoading] = useState(true);



  const [importing, setImporting] = useState(false);



  const [message, setMessage] = useState('');



  const [error, setError] = useState('');



  const [cpcbOpen, setCpcbOpen] = useState(false);



  const [addOpen, setAddOpen] = useState(false);



  const [detailRow, setDetailRow] = useState(null);







  const load = async () => {



    setLoading(true);



    try {



      const api = getApi();



      const data = isPurchase



        ? await api.purchases.getAll()



        : await api.sales.getAll();



      setRows(data || []);



    } catch {



      setRows([]);



    } finally {



      setLoading(false);



    }



  };







  useEffect(() => {



    load();



  }, [type]);







  const handleDelete = async (id) => {



    if (!confirm('Delete this record?')) return;



    try {



      const api = getApi();



      if (isPurchase) await api.purchases.delete(id);



      else await api.sales.delete(id);



      load();



    } catch (err) {



      alert(err?.message || 'Delete failed');



    }



  };







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







  return (



    <div className="space-y-5 max-w-full">



      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">



        <div className="flex items-center gap-3">



          <button



            type="button"



            onClick={() => navigate('/doc-processor')}



            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"



          >



            <ArrowLeft size={18} />



          </button>



          <div>



            <h2 className="text-lg font-bold text-slate-900">{title}</h2>



            <p className="text-sm text-slate-500">{rows.length} records in local database</p>



          </div>



        </div>







        <div className="flex items-center gap-2 flex-wrap">



          <button



            type="button"



            onClick={() => setAddOpen(true)}



            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 transition-colors"



          >



            <Plus size={16} />



            Add



          </button>



          <button



            type="button"



            onClick={handleDownloadTemplate}



            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 transition-colors"



          >



            <Download size={16} />



            Download template



          </button>



          <button



            type="button"



            onClick={handleImportClick}



            disabled={importing}



            className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-2 transition-colors disabled:opacity-60"



          >



            {importing ? (



              <Loader2 size={16} className="animate-spin" />



            ) : (



              <FileSpreadsheet size={16} />



            )}



            {importing ? 'Importing…' : 'Import Excel'}



          </button>



          <button



            type="button"



            onClick={() => exportExcelData(type, rows)}



            disabled={!rows.length}



            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 transition-colors disabled:opacity-60"



          >



            <FileSpreadsheet size={16} />



            Export Excel



          </button>



          <button



            type="button"



            onClick={() => setCpcbOpen(true)}



            className="inline-flex items-center gap-2 rounded-lg border border-green-600 text-green-700 bg-white hover:bg-green-50 text-sm font-medium px-3 py-2 transition-colors"



          >



            <UploadCloud size={16} />



            Upload to CPCB



          </button>



          <input



            ref={fileRef}



            type="file"



            accept=".xlsx,.xls,.csv"



            className="hidden"



            onChange={handleFileChange}



          />



        </div>



      </div>







      {message && (



        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">



          {message}



        </div>



      )}



      {error && (



        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-line">



          {error}



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



        ) : isPurchase ? (



          renderWideTable(rows, PURCHASE_TABLE_COLUMNS, handleDelete, {



            onView: (r) => setDetailRow({ data: r, fileName: r.invoice_filename }),



            getValue: (r, col, _idx, value) => {



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



          })



        ) : (



          renderWideTable(rows, SALE_TABLE_COLUMNS, handleDelete, {



            onView: (r) => setDetailRow({ data: r, fileName: r.invoice_file_name }),



            getValue: (r, col, idx, value) => {



              if (col.key === 's_no' && (value === undefined || value === '')) return idx + 1;



              if (col.key === 'entity_name' && !value) return r.customer_name;



              // Handle invoice_date for sales



              if (col.key === 'invoice_date') {



                return cell(r.invoice_date || value);



              }



              if (



                ['recycled_plastic_percent', 'conversion_factor', 'available_quantity_mt', 'quantity_sold_mt', 'gst_other_charges'].includes(col.key) &&



                value !== undefined &&



                value !== ''



              ) {



                return fmt(value);



              }



              return value;



            },



          })



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







      <InvoiceDetailsModal



        open={Boolean(detailRow)}



        invoice={detailRow}



        docType={type}



        onClose={() => setDetailRow(null)}



      />



    </div>



  );



}

