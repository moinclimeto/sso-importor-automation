import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  downloadExcelTemplate,
  parseExcelFile,
  importExcelRows,
  SALE_TABLE_COLUMNS,
  PURCHASE_TABLE_COLUMNS,
} from '../utils/excelImport.js';
import InvoiceDetailsModal, {
  ViewInvoiceButton,
} from '../components/InvoiceDetailsModal.jsx';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);

const cell = (v) => (v === null || v === undefined || v === '' ? '—' : v);

function rowLineCount(r) {
  return Array.isArray(r?.lineItems) ? r.lineItems.length : 0;
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
  const [detailRow, setDetailRow] = useState(null);

  const load = async () => {
    if (!window.pwp) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = isPurchase
        ? await window.pwp.purchases.getAll()
        : await window.pwp.sales.getAll();
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
      if (isPurchase) await window.pwp.purchases.delete(id);
      else await window.pwp.sales.delete(id);
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
            onClick={() => navigate('/doc-upload', { state: { type } })}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-2 transition-colors"
          >
            Upload invoices
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
              if (col.key === 'procurement_date' && !value) return r.invoice_date;
              if (col.key === 'supplier_gst_number' && !value) return r.vendor_gstin;
              if (col.key === 'quantity_mt' && (value === undefined || value === '')) {
                return r.quantity != null ? fmt(r.quantity) : value;
              }
              if (col.key === 'quantity_mt' && value !== undefined && value !== '') {
                return fmt(value);
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
              if (
                [
                  'recycled_plastic_percent',
                  'conversion_factor',
                  'available_quantity_mt',
                  'quantity_sold_mt',
                  'gst_other_charges',
                ].includes(col.key) &&
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

      <InvoiceDetailsModal
        open={Boolean(detailRow)}
        invoice={detailRow}
        docType={type}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}
