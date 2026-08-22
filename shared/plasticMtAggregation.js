import { resolveFinancialYear, itemToLineDraft, resolveLineMt } from './procurementConversionFactor.js';
import { resolveState } from './gstStateCodes.js';
import {
  PLASTIC_CATEGORIES,
  normalizePlasticCategory,
  emptyCategoryMtMap,
} from './plasticCategories.js';

export { PLASTIC_CATEGORIES, normalizePlasticCategory } from './plasticCategories.js';

function parseLineItems(row = {}) {
  let items = row.line_items ?? row.lineItems ?? [];
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  return Array.isArray(items) ? items : [];
}

function getRecordDate(row, docType) {
  return docType === 'purchase'
    ? row.procurement_date || row.invoice_date || ''
    : row.invoice_date || '';
}

function getHeaderMt(row, docType) {
  const raw =
    docType === 'purchase'
      ? row.quantity_mt ?? row.quantity
      : row.quantity_sold_mt ?? row.quantity;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resolveRecordFy(row, docType) {
  return resolveFinancialYear(getRecordDate(row, docType), row.financial_year) || 'Unknown';
}

function resolveRecordState(row, docType) {
  const gst =
    row.customer_gstin ||
    row.supplier_gst_number ||
    row.vendor_gstin ||
    row.supplier_gst ||
    '';
  const state = resolveState(row.state, gst);
  return String(state || row.state || 'Unknown').trim() || 'Unknown';
}

/** Split a record into { category, mt } entries (line-level when possible). */
export function expandRecordCategoryMt(row, docType = 'purchase') {
  const lines = parseLineItems(row);
  const headerCat = normalizePlasticCategory(row.category_of_plastic);
  const entries = [];

  if (lines.length) {
    for (const li of lines) {
      const cat = normalizePlasticCategory(
        li.plasticCategory ?? li.category_of_plastic ?? li.plastic_category ?? headerCat,
      );
      if (!cat) continue;

      const draft = itemToLineDraft(li, 0);
      const mt = resolveLineMt(draft);
      if (mt != null && mt > 0) {
        entries.push({ category: cat, mt });
      }
    }
  }

  if (!entries.length && headerCat) {
    const mt = getHeaderMt(row, docType);
    if (mt > 0) entries.push({ category: headerCat, mt });
  }

  return entries;
}

function addToCategoryMap(map, category, mt) {
  const cat = normalizePlasticCategory(category);
  if (!cat || !PLASTIC_CATEGORIES.includes(cat)) return;
  map[cat] += mt;
  map.total += mt;
}

function filterRecords(records = [], { docType, docStatus, financialYear } = {}) {
  return records.filter((row) => {
    if (docStatus && docStatus !== 'all') {
      const status = row.doc_status || 'inbox';
      if (status !== docStatus) return false;
    }
    if (financialYear && financialYear !== 'all') {
      if (resolveRecordFy(row, docType) !== financialYear) return false;
    }
    return true;
  });
}

/** FY → Cat-I / Cat-II / Cat-III / Cat-IV / Total (MT) */
export function aggregateByFinancialYear(records = [], docType = 'purchase', filters = {}) {
  const rows = filterRecords(records, { ...filters, docType });
  const byFy = {};

  for (const row of rows) {
    const fy = resolveRecordFy(row, docType);
    if (!byFy[fy]) byFy[fy] = emptyCategoryMtMap();

    for (const { category, mt } of expandRecordCategoryMt(row, docType)) {
      addToCategoryMap(byFy[fy], category, mt);
    }
  }

  return Object.entries(byFy)
    .map(([financial_year, cats]) => ({ financial_year, ...cats }))
    .sort((a, b) => b.financial_year.localeCompare(a.financial_year));
}

/** FY + State → Cat-I / Cat-II / Cat-III / Cat-IV / Total (MT) */
export function aggregateByStateAndFy(records = [], docType = 'purchase', filters = {}) {
  const rows = filterRecords(records, { ...filters, docType });
  const byKey = {};

  for (const row of rows) {
    const fy = resolveRecordFy(row, docType);
    const state = resolveRecordState(row, docType);
    const key = `${fy}::${state}`;
    if (!byKey[key]) {
      byKey[key] = { financial_year: fy, state, ...emptyCategoryMtMap() };
    }

    for (const { category, mt } of expandRecordCategoryMt(row, docType)) {
      addToCategoryMap(byKey[key], category, mt);
    }
  }

  return Object.values(byKey).sort((a, b) => {
    const fyCmp = b.financial_year.localeCompare(a.financial_year);
    if (fyCmp !== 0) return fyCmp;
    return a.state.localeCompare(b.state);
  });
}

export function mergeAggregates(listA = [], listB = [], keyFields) {
  const map = new Map();

  const mergeRow = (row) => {
    const key = keyFields.map((f) => row[f]).join('::');
    if (!map.has(key)) {
      map.set(key, { ...row });
      return;
    }
    const existing = map.get(key);
    for (const cat of PLASTIC_CATEGORIES) {
      existing[cat] = (existing[cat] || 0) + (row[cat] || 0);
    }
    existing.total = (existing.total || 0) + (row.total || 0);
  };

  listA.forEach(mergeRow);
  listB.forEach(mergeRow);
  return Array.from(map.values());
}

export function formatMt(value) {
  if (value == null || value === 0) return '—';
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 4 });
}
