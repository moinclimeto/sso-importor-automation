import { useState, useEffect, useRef } from 'react';
import { Eye, FileText, X, ArrowLeftRight } from 'lucide-react';
import PdfViewer from './PdfViewer';



function displayValue(value) {

  const raw = String(value ?? '').trim();

  if (!raw || raw === 'NOT_FOUND') return '—';

  return raw;

}



function displayAmount(value) {

  const n = Number(value);

  if (!Number.isFinite(n) || n === 0) return '—';

  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

}



function displayMt(item) {
  if (item?.weight_mt != null && item.weight_mt !== '') {
    const n = Number(item.weight_mt);
    if (Number.isFinite(n) && n > 0) return n.toFixed(4);
  }
  if (item?.valueInMt != null && item.valueInMt !== '') {
    const n = Number(item.valueInMt);
    if (Number.isFinite(n) && n > 0) return n.toFixed(4);
  }
  return '—';
}



function getLineItems(invoice) {
  if (!invoice) return [];
  // Prioritize snake_case from DB or passed directly
  if (Array.isArray(invoice.line_items) && invoice.line_items.length) return invoice.line_items;
  if (Array.isArray(invoice.data?.line_items) && invoice.data.line_items.length) {
    return invoice.data.line_items;
  }
  // Fallback to camelCase for compatibility
  if (Array.isArray(invoice.lineItems) && invoice.lineItems.length) return invoice.lineItems;
  if (Array.isArray(invoice.data?.lineItems) && invoice.data.lineItems.length) {
    return invoice.data.lineItems;
  }
  return [];
}



/**

 * Climeto-style invoice details modal: header summary + line items table.

 */

export default function InvoiceDetailsModal({ open, invoice, docType = 'purchase', onClose }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const [formWidth, setFormWidth] = useState(50);
  const [pdfOnLeft, setPdfOnLeft] = useState(false);
  const isResizing = useRef(false);

  const startResize = (e) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  };

  const handleMouseMove = (e) => {
    if (!isResizing.current) return;
    const modalElement = document.getElementById('view-record-modal-content');
    if (!modalElement) return;
    const rect = modalElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let newWidthPct = (mouseX / rect.width) * 100;
    if (pdfOnLeft) {
      newWidthPct = 100 - newWidthPct;
    }
    setFormWidth(Math.max(25, Math.min(75, newWidthPct)));
  };

  const stopResize = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
    };
  }, [pdfOnLeft]);

  useEffect(() => {
    async function loadFile() {
      const filePath = invoice?.filePath || invoice?.data?.filePath;
      if (!filePath || !window.pwp?.fs?.readFileBase64) return;
      
      setLoadingFile(true);
      try {
        const base64 = await window.pwp.fs.readFileBase64(filePath);
        if (base64) {
          const ext = filePath.split('.').pop().toLowerCase();
          const mime = ext === 'pdf' ? 'application/pdf' : 
                       ext === 'png' ? 'image/png' : 
                       (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'application/pdf';
          setPreviewUrl(`data:${mime};base64,${base64}`);
        }
      } catch(e) {
        console.error('Failed to load invoice file preview:', e);
      } finally {
        setLoadingFile(false);
      }
    }
    
    if (open) {
      loadFile();
    } else {
      setPreviewUrl(null);
    }
  }, [open, invoice]);

  if (!open || !invoice) return null;

  const data = invoice.data || invoice;
  const isPurchase = docType === 'purchase';
  const lineItems = getLineItems(invoice);
  
  const fileName = invoice.fileName || data.invoice_filename || data.invoice_file_name || '—';
  const invoiceNo = data.invoice_number || data.application_number || data.invoice_no || '—';
  const date = data.procurement_date || data.invoice_date || '—';
  
  const party = isPurchase
    ? data.supplier_name || data.vendor_name
    : data.entity_name || data.customer_name;
    
  const gst = isPurchase
    ? data.supplier_gst_number || data.vendor_gstin
    : data.customer_gstin;
    
  const address = isPurchase
    ? [data.address_line_1, data.address_line_2, data.city, data.state, data.pin_code]
        .filter(Boolean)
        .join(', ')
    : [data.address, data.district, data.state].filter(Boolean).join(', ');
    
  const total = data.total_amount || data.gst_other_charges || 0;
  const qrApplied = Boolean(invoice.qr?.priorityApplied || data._qr);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div
        className={`relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xl ${previewUrl ? 'w-[95vw] h-[95vh] max-w-none' : 'w-full max-w-5xl max-h-[90vh]'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-details-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 z-10"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-2 px-5 pt-5 pb-3 pr-12 border-b border-slate-100 flex-shrink-0">
          <FileText className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 id="invoice-details-title" className="text-base font-semibold text-slate-800">
              Invoice details
            </h2>
            <p className="text-xs text-slate-500 mt-1 truncate">
              {displayValue(invoiceNo)} · {displayValue(date)} · {displayValue(party)}
              {qrApplied ? ' · QR priority' : ''}
            </p>
          </div>
        </div>

        <div className={`flex-1 min-h-0 ${previewUrl ? (pdfOnLeft ? 'flex flex-col lg:flex-row-reverse' : 'flex flex-col lg:flex-row') : ''}`} style={{ '--form-width': `${formWidth}%` }}>
          {/* Data Section */}
          <div className={`px-5 py-4 overflow-y-auto ${previewUrl ? 'lg:w-[var(--form-width)] border-b lg:border-b-0 lg:border-r border-slate-200' : 'flex-1'}`}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 mb-4">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">File</dt>
                <dd className="text-slate-700 truncate" title={fileName}>
                  {displayValue(fileName)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                  {isPurchase ? 'Supplier GST' : 'Buyer GST'}
                </dt>
                <dd className="font-mono text-xs text-slate-700">{displayValue(gst)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">State</dt>
                <dd className="text-slate-700">{displayValue(data.state)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Contact</dt>
                <dd className="font-mono text-xs text-slate-700">
                  {displayValue(data.supplier_mobile_number || data.mobile)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Document type</dt>
                <dd className="text-slate-700">{isPurchase ? 'Purchase' : 'Sale'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Total amount</dt>
                <dd className="font-medium text-slate-800 tabular-nums">
                  ₹{Number(total || 0).toLocaleString('en-IN')}
                </dd>
              </div>
              {!isPurchase && (
                <>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">Account</dt>
                    <dd className="font-mono text-xs text-slate-700">
                      {displayValue(data.account_number)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">IFSC</dt>
                    <dd className="font-mono text-xs text-slate-700">
                      {displayValue(data.ifsc_code)}
                    </dd>
                  </div>
                </>
              )}
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">Address</dt>
                <dd className="text-slate-700">{displayValue(address)}</dd>
              </div>
            </dl>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Line items ({lineItems.length})
              </p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  {lineItems.length === 0 ? (
                    <p className="text-center text-slate-500 py-10 text-sm">No line items found.</p>
                  ) : (
                    <table className="w-full text-sm min-w-[900px]">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="th">#</th>
                          <th className="th">Product</th>
                          <th className="th">Description</th>
                          <th className="th">HSN/SAC</th>
                          <th className="th text-right">MT</th>
                          <th className="th">Quantity</th>
                          <th className="th">Unit</th>
                          <th className="th text-right">Rate (₹)</th>
                          <th className="th text-right">Amount (₹)</th>
                          <th className="th text-right">GST (₹)</th>
                          <th className="th text-right">GST %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, index) => (
                          <tr
                            key={`${item.lineNo || index}-${index}`}
                            className="border-b border-slate-100 hover:bg-slate-50/60"
                          >
                            <td className="td">{item.lineNo || index + 1}</td>
                            <td className="td min-w-[8rem]">{displayValue(item.product)}</td>
                            <td className="td min-w-[12rem]">{displayValue(item.productDescription)}</td>
                            <td className="td font-mono text-xs">{displayValue(item.hsn)}</td>
                            <td className="td text-right tabular-nums text-xs">{displayMt(item)}</td>
                            <td className="td">{displayValue(item.quantity)}</td>
                            <td className="td">{displayValue(item.unit)}</td>
                            <td className="td text-right tabular-nums">{displayAmount(item.rate)}</td>
                            <td className="td text-right tabular-nums">{displayAmount(item.amount)}</td>
                            <td className="td text-right tabular-nums">{displayAmount(item.gstAmount)}</td>
                            <td className="td text-right tabular-nums">{displayAmount(item.gstRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          {previewUrl && (
            <div className="flex-1 min-h-0 bg-slate-100/50 flex flex-col p-2">
              <iframe
                src={previewUrl}
                title="Invoice Preview"
                className="w-full h-full rounded-xl border border-slate-200 shadow-sm bg-white"
              />
            </div>
          )}
          {loadingFile && !previewUrl && (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
              <span className="text-slate-400 text-sm">Loading invoice preview...</span>
            </div>
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-slate-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-bg-slate-50 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ViewInvoiceButton({ onClick, disabled, title = 'View invoice details' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-green-700 hover:border-green-300 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
      title={title}
      aria-label={title}
    >
      <Eye size={14} />
      View
    </button>
  );
}


