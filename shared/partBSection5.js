import { resolveRecordTotalMt } from './procurementConversionFactor.js';
import { normalizePlasticCategory } from './plasticCategories.js';
import {
  resolveProcurementAddress,
  resolveSalesAddress,
  resolveSalesGstOtherCharges,
} from './reviewEnrichment.js';

const CATEGORY_TO_PART_B_LABEL = {
  'Cat-I': 'Rigid Plastic (Cat-I)',
  'Cat-II': 'Flexible Plastic (Cat-II)',
  'Cat-III': 'MLP (Cat-III)',
  'Cat-IV': 'Compostable Plastic (Cat-IV)',
};

export function isUnregisteredRegistrationType(value = '') {
  return String(value || '').toLowerCase().replace(/\s+/g, '') === 'unregistered';
}

export function toPartBCategoryLabel(category = '') {
  const normalized = normalizePlasticCategory(category);
  if (!normalized) return '';
  return CATEGORY_TO_PART_B_LABEL[normalized] || normalized;
}

export function resolvePartBMaterialType(row = {}) {
  const raw = String(row.plastic_type || row.product_type || '').toLowerCase();
  if (raw.includes('pack')) return 'Packaging';
  return 'Raw Material';
}

export function toInputDate(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return '';
}

export function resolvePurchaseInvoicePath(row = {}) {
  return (
    row._source_fields?.local_pdf_path
    || row.local_pdf_path
    || row.invoiceDoc
    || ''
  );
}

export function buildSec5bRowFromPurchase(row = {}) {
  const quantityMt = resolveRecordTotalMt(row, 'purchase');
  const firstLine = (row.line_items || row.lineItems || [])[0] || {};
  const category = toPartBCategoryLabel(
    row.category_of_plastic || firstLine.plasticCategory || firstLine.category_of_plastic,
  );

  return {
    regType: 'UnRegistered',
    entityType: row.entity_type || 'Producer',
    entityName: row.supplier_name || row.vendor_name || '',
    country: 'India',
    address: row.address_line_1 || resolveProcurementAddress(row) || row.address || '',
    mobile: row.supplier_mobile_number || row.mobile_number || '',
    materialType: resolvePartBMaterialType(row),
    category,
    financialYear: row.financial_year || '',
    date: toInputDate(row.invoice_date || row.procurement_date),
    quantity: quantityMt != null ? String(Number(quantityMt.toFixed(4))) : '',
    recycledPercent: row.recycled_plastic_percent != null && row.recycled_plastic_percent !== ''
      ? String(row.recycled_plastic_percent)
      : '0',
    invoiceDoc: resolvePurchaseInvoicePath(row),
    sourceRecordId: row.id,
    sourceInvoiceNo: row.invoice_no || row.invoice_number || '',
  };
}

function filterByCompany(records = [], companyId = null) {
  if (companyId == null || companyId === '') return records;
  const cid = Number(companyId);
  return records.filter((row) => Number(row.company_id) === cid);
}

export function buildSec5bFromPurchases(purchases = [], { companyId = null, docStatus = 'published' } = {}) {
  let rows = filterByCompany(purchases, companyId);
  if (docStatus && docStatus !== 'all') {
    rows = rows.filter((row) => (row.doc_status || 'inbox') === docStatus);
  }
  rows = rows.filter((row) => isUnregisteredRegistrationType(row.registration_type));

  return rows
    .map(buildSec5bRowFromPurchase)
    .filter((row) => row.entityName || row.quantity);
}

export function sec5bRowHasData(row = {}) {
  return Boolean(
    String(row.entityName || '').trim()
    || Number(row.quantity) > 0
    || String(row.invoiceDoc || '').trim(),
  );
}

export function resolveSaleInvoicePath(row = {}) {
  return (
    row._source_fields?.local_pdf_path
    || row.local_pdf_path
    || row.invoiceDoc
    || ''
  );
}

export function mapSec5dEntityType(entityType = '') {
  const value = String(entityType || '').trim();
  if (!value) return 'Producer';
  if (/brand owner/i.test(value)) return 'Brand Owner';
  return 'Producer';
}

export function buildSec5dRowFromSale(row = {}) {
  const quantityMt = resolveRecordTotalMt(row, 'sale');
  const firstLine = (row.line_items || row.lineItems || [])[0] || {};
  const category = toPartBCategoryLabel(
    row.category_of_plastic || firstLine.plasticCategory || firstLine.category_of_plastic,
  );
  const gstPaid = resolveSalesGstOtherCharges(row);

  return {
    regType: 'UnRegistered',
    entityType: mapSec5dEntityType(row.entity_type),
    entityName: row.entity_name || row.customer_name || '',
    address: row.address || resolveSalesAddress(row) || '',
    state: row.state || '',
    mobile: row.mobile_number || '',
    materialType: resolvePartBMaterialType(row),
    category,
    financialYear: row.financial_year || '',
    gst: row.customer_gstin || '',
    bankAccount: row.account_number || '',
    ifsc: row.ifsc_code || '',
    gstPaid: gstPaid !== '' && gstPaid != null ? String(gstPaid) : '',
    invoiceNo: row.invoice_no || row.invoice_number || row.application_number || '',
    quantity: quantityMt != null ? String(Number(quantityMt.toFixed(4))) : '',
    recycledPercent: row.recycled_plastic_percent != null && row.recycled_plastic_percent !== ''
      ? String(row.recycled_plastic_percent)
      : '0',
    invoiceDoc: resolveSaleInvoicePath(row),
    sourceRecordId: row.id,
    sourceInvoiceNo: row.invoice_no || row.invoice_number || '',
  };
}

export function buildSec5dFromSales(sales = [], { companyId = null, docStatus = 'published' } = {}) {
  let rows = filterByCompany(sales, companyId);
  if (docStatus && docStatus !== 'all') {
    rows = rows.filter((row) => (row.doc_status || 'inbox') === docStatus);
  }
  rows = rows.filter((row) => isUnregisteredRegistrationType(row.registration_type));

  return rows
    .map(buildSec5dRowFromSale)
    .filter((row) => row.entityName || row.quantity);
}

export function sec5dRowHasData(row = {}) {
  return sec5bRowHasData(row);
}

export function mergeSec5dRows(existing = [], computed = []) {
  return mergePartBTransactionRows(existing, computed, sec5dRowHasData);
}

export function mergePartBTransactionRows(existing = [], computed = [], hasDataFn = sec5bRowHasData) {
  const bySource = new Map();
  for (const row of existing) {
    if (row.sourceRecordId != null) bySource.set(String(row.sourceRecordId), row);
  }

  const merged = [...existing];
  const seen = new Set(existing.map((row) => String(row.sourceRecordId || '')).filter(Boolean));

  for (const row of computed) {
    const key = row.sourceRecordId != null ? String(row.sourceRecordId) : '';
    if (key && seen.has(key)) {
      const idx = merged.findIndex((item) => String(item.sourceRecordId) === key);
      if (idx >= 0 && !hasDataFn(merged[idx])) {
        merged[idx] = { ...row, ...merged[idx] };
      }
      continue;
    }
    if (key) seen.add(key);
    merged.push(row);
  }

  return merged;
}

export function mergeSec5bRows(existing = [], computed = []) {
  return mergePartBTransactionRows(existing, computed, sec5bRowHasData);
}
