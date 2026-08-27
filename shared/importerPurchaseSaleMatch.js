import { buildProductMatchKey } from './procurementConversionFactor.js';
import { normalizePlasticCategory, PLASTIC_CATEGORIES } from './plasticCategories.js';
import { resolveRecordFinancialYear } from './financialYearScope.js';

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

function parseNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function lineDescription(line = {}) {
  return String(
    line.productDescription ?? line.product ?? line.item_name ?? line.product_description ?? '',
  ).trim();
}

function lineHsn(line = {}) {
  return String(line.hsn ?? line.hsn_code ?? '').trim();
}

function lineQty(line = {}) {
  return parseNum(line.quantity ?? line.qty ?? line.q) ?? 0;
}

export function expandRecordLines(row, docType = 'purchase') {
  const items = parseLineItems(row);
  const fy = resolveRecordFinancialYear(row, docType);
  const invoiceNo =
    docType === 'purchase'
      ? row.invoice_number || row.invoice_no || ''
      : row.invoice_no || row.application_number || row.invoice_number || '';

  if (!items.length) {
    const desc = row.item_name || row.product_type || '';
    const key = buildProductMatchKey(desc, row.hsn_code);
    if (!desc && !key.endsWith('::')) return [];
    return [
      {
        recordId: row.id,
        docType,
        lineIndex: 0,
        financialYear: fy,
        invoiceNo,
        productDescription: desc,
        hsn: row.hsn_code || '',
        productMatchKey: key,
        quantity: parseNum(row.quantity ?? row.quantity_mt) ?? 0,
        unit: row.unit || '',
        plasticCategory: normalizePlasticCategory(row.category_of_plastic),
        rawLine: row,
      },
    ];
  }

  return items.map((line, lineIndex) => {
    const desc = lineDescription(line);
    const hsn = lineHsn(line);
    return {
      recordId: row.id,
      docType,
      lineIndex,
      financialYear: fy,
      invoiceNo,
      productDescription: desc,
      hsn,
      productMatchKey: buildProductMatchKey(desc, hsn),
      quantity: lineQty(line),
      unit: line.unit ?? line.uom ?? '',
      plasticCategory: normalizePlasticCategory(
        line.plasticCategory ?? line.category_of_plastic ?? row.category_of_plastic,
      ),
      rawLine: line,
    };
  }).filter((l) => l.productDescription || l.hsn);
}

function parseLinkedMatchKeys(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Build alias map: any key → canonical purchase key */
export function buildProductAliasMap(packagingRows = []) {
  const aliasToCanonical = new Map();
  for (const row of packagingRows) {
    const canonical = row.product_match_key;
    if (!canonical) continue;
    aliasToCanonical.set(canonical, canonical);
    for (const linked of parseLinkedMatchKeys(row.linked_match_keys)) {
      aliasToCanonical.set(linked, canonical);
    }
  }
  return aliasToCanonical;
}

export function resolveCanonicalKey(productMatchKey, aliasMap = new Map()) {
  return aliasMap.get(productMatchKey) || productMatchKey;
}

const INDIAN_GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function normalizeCountryValue(country) {
  return String(country || '').trim().toLowerCase();
}

function isForeignCountry(country) {
  const c = normalizeCountryValue(country);
  if (!c) return false;
  return c !== 'india' && c !== 'in' && c !== 'indian';
}

function isIndianGstin(gst) {
  return INDIAN_GSTIN_RE.test(String(gst || '').replace(/\s/g, '').toUpperCase());
}

function looksLikeIndianAddress(...parts) {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  if (/\bindia\b/.test(text)) return true;
  if (/\b\d{6}\b/.test(text)) return true;
  return /\b(haryana|goa|maharashtra|delhi|gujarat|karnataka|faridabad|mumbai|chennai|kolkata|bangalore|bengaluru|hyderabad|pune|jaipur|lucknow|patna|ranchi|bhopal|chandigarh|puducherry|tamil nadu|uttar pradesh|west bengal|madhya pradesh|andhra pradesh|telangana|kerala|punjab|rajasthan|odisha|assam|bihar|jharkhand|chhattisgarh|uttarakhand|himachal pradesh|jammu|kashmir|ladakh)\b/.test(text);
}

/** Heuristic: is this purchase an import? */
export function inferProcurementSource(row = {}) {
  const explicit = String(row.procurement_source || '').trim().toLowerCase();
  if (explicit === 'import' || explicit === 'domestic') return explicit;

  const country = normalizeCountryValue(
    row.country || row.extraction?.country || row.supplier_country,
  );

  if (isForeignCountry(country)) return 'import';

  const supplierGst = row.supplier_gst_number || row.vendor_gstin || row.seller_gst;
  if (isIndianGstin(supplierGst)) return 'domestic';

  const buyerGst = row.buyer_gst || row.customer_gstin;
  if (isIndianGstin(buyerGst) && !isForeignCountry(country)) return 'domestic';

  const address = [
    row.address_line_1,
    row.supplier_address,
    row.state,
    row.city,
    row.pin_code,
    row.extraction?.supplier_address,
    row.extraction?.address,
  ].filter(Boolean).join(' ');

  if (looksLikeIndianAddress(address) && !isForeignCountry(country)) return 'domestic';

  if (country === 'india' || country === 'in') return 'domestic';

  if (country) return 'import';

  return 'domestic';
}

/** Persistable procurement source — always import or domestic (never unknown). */
export function resolveProcurementSource(row = {}) {
  const inferred = inferProcurementSource(row);
  return inferred === 'import' ? 'import' : 'domestic';
}

/** Import purchases for Importer 3a pool (auto-detected or explicit). */
export function isExplicitImportPurchase(row = {}) {
  return resolveProcurementSource(row) === 'import';
}

export function filterImportPurchaseLines(purchaseRows = [], scopeYears = []) {
  const lines = [];
  for (const row of purchaseRows) {
    if ((row.doc_status || 'inbox') !== 'published') continue;
    if (!isExplicitImportPurchase(row)) continue;
    for (const line of expandRecordLines(row, 'purchase')) {
      if (!scopeYears.length || scopeYears.includes(line.financialYear)) {
        lines.push({ ...line, procurementSource: 'import' });
      }
    }
  }
  return lines;
}

/** Published purchases in scope that still need Import / Domestic classification for Importer 3a. */
export function collectUnclassifiedProcurementIssues(purchaseRows = [], scopeYears = []) {
  const issues = [];
  for (const row of purchaseRows) {
    if ((row.doc_status || 'inbox') !== 'published') continue;
    const explicit = String(row.procurement_source || '').trim().toLowerCase();
    if (explicit === 'import' || explicit === 'domestic') continue;
    const resolved = resolveProcurementSource(row);
    if (resolved === 'import' || resolved === 'domestic') continue;
    const fy = resolveRecordFinancialYear(row, 'purchase');
    if (scopeYears.length && fy && !scopeYears.includes(fy)) continue;
    const hasLines = expandRecordLines(row, 'purchase').some(
      (line) => !scopeYears.length || scopeYears.includes(line.financialYear),
    );
    if (!hasLines) continue;
    issues.push({
      type: 'unclassified_procurement',
      invoice: row.invoice_number || row.invoice_no || '',
      recordId: row.id,
      inferredSource: inferProcurementSource(row),
    });
  }
  return issues;
}

export function filterSaleLines(saleRows = [], scopeYears = []) {
  const lines = [];
  for (const row of saleRows) {
    if ((row.doc_status || 'inbox') !== 'published') continue;
    for (const line of expandRecordLines(row, 'sale')) {
      if (!scopeYears.length || scopeYears.includes(line.financialYear)) {
        lines.push(line);
      }
    }
  }
  return lines;
}

/**
 * Match sale lines to import purchase pool (FIFO by invoice date order).
 * Returns { matches, unmatchedSales, unsoldImportQty }
 */
export function matchImportPurchasesToSales({
  importLines = [],
  saleLines = [],
  aliasMap = new Map(),
} = {}) {
  const pool = new Map();

  for (const pl of importLines) {
    const key = resolveCanonicalKey(pl.productMatchKey, aliasMap);
    const poolKey = `${pl.financialYear}::${key}`;
    if (!pool.has(poolKey)) {
      pool.set(poolKey, { key, financialYear: pl.financialYear, remaining: 0, sources: [] });
    }
    const bucket = pool.get(poolKey);
    bucket.remaining += pl.quantity;
    bucket.sources.push(pl);
  }

  const matches = [];
  const unmatchedSales = [];

  for (const sl of saleLines) {
    const key = resolveCanonicalKey(sl.productMatchKey, aliasMap);
    const poolKey = `${sl.financialYear}::${key}`;
    let bucket = pool.get(poolKey);

    if (!bucket || bucket.remaining <= 0) {
      unmatchedSales.push({
        ...sl,
        matchConfidence: 'none',
        needsConfirmation: true,
      });
      continue;
    }

    const allocated = Math.min(sl.quantity, bucket.remaining);
    bucket.remaining -= allocated;

    matches.push({
      saleLine: sl,
      purchaseSources: bucket.sources,
      productMatchKey: key,
      financialYear: sl.financialYear,
      saleQty: sl.quantity,
      allocatedQty: allocated,
      matchConfidence: sl.productMatchKey === key ? 'exact' : 'alias',
      needsConfirmation: allocated < sl.quantity,
    });
  }

  const unsoldImportQty = [];
  for (const bucket of pool.values()) {
    if (bucket.remaining > 0) {
      unsoldImportQty.push({
        productMatchKey: bucket.key,
        financialYear: bucket.financialYear,
        remainingQty: bucket.remaining,
      });
    }
  }

  return { matches, unmatchedSales, unsoldImportQty };
}

export function hasDomesticSales(matches = []) {
  return matches.some((m) => m.allocatedQty > 0);
}

export { PLASTIC_CATEGORIES };
