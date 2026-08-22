/**
 * Shared invoice duplicate detection helpers.
 * Used when saving procurement (purchase) and post-consumer (sale) records.
 */

export function normalizeInvoiceNo(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function normalizeGst(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function resolvePurchaseInvoiceNo(data = {}) {
  return normalizeInvoiceNo(data.invoice_no || data.invoice_number);
}

export function resolveSaleInvoiceNo(data = {}) {
  return normalizeInvoiceNo(
    data.invoice_no || data.application_number || data.invoice_number,
  );
}

export function resolvePurchasePartyGst(data = {}) {
  return normalizeGst(data.supplier_gst_number || data.vendor_gstin);
}

export function resolveSalePartyGst(data = {}) {
  return normalizeGst(data.customer_gstin || data.buyer_gst);
}

export function resolveFileHash(data = {}) {
  const hash = String(data.fileHash || data.file_hash || '').trim();
  return hash || null;
}

export function formatDuplicateInvoiceMessage(match = {}) {
  const parts = ['Duplicate invoice — already processed'];
  if (match.invoiceNo) parts.push(`Invoice ${match.invoiceNo}`);
  if (match.gst) parts.push(`GST ${match.gst}`);
  if (match.id) parts.push(`record #${match.id}`);
  if (match.reason === 'file_hash') parts.push('(same file)');
  return parts.join(' · ');
}
