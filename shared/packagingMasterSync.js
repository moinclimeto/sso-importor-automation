import { buildProductMatchKey, normalizeCfBaseSource, normalizeLineUom } from './procurementConversionFactor.js';
import { normalizePlasticCategory, PLASTIC_CATEGORIES } from './plasticCategories.js';
import { extractHsnFromText } from './hsnUtils.js';

export { extractHsnFromText };

const KNOWN_PLASTIC_MATERIALS = [
  'PET', 'HDPE', 'PVC', 'LDPE', 'LLDPE', 'PP', 'PS', 'MLP', 'PLA', 'PBAT', 'Others', 'Other',
];

const OCR_GARBAGE_MATERIAL_RE =
  /customer'?s materials|customs tariff|tariff num|compl lwr|windsh|a2476200500|materials:/i;

function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

function normalizeHsn(value) {
  const raw = str(value);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits || raw;
}

/** Any numeric CF on the line (Manual, Auto-Master, or applied value). */
export function resolveLineConversionFactorForPackaging(line = {}) {
  const cf = parseNum(
    line.conversionFactorApplied ??
      line.conversion_factor_applied ??
      line.conversionFactor ??
      line.conversion_factor,
  );
  return cf != null && cf > 0 ? cf : null;
}

export function resolvePackagingHsn(record = {}) {
  const fromCol = normalizeHsn(record.hsn);
  if (fromCol) return fromCol;
  const key = str(record.product_match_key);
  if (key.includes('::')) {
    const fromKey = normalizeHsn(key.split('::').pop());
    if (fromKey) return fromKey;
  }
  return '';
}

export function resolvePackagingUom(record = {}) {
  const uomFields = normalizeLineUom(record);
  return str(uomFields.unit || record.uom || record.unit) || '';
}

export function formatPackagingConversionFactor(record = {}) {
  const cf = parseNum(record.conversion_factor);
  if (cf == null) return '—';
  return cf.toLocaleString('en-IN', { maximumFractionDigits: 6 });
}

/** Human-readable CF label: kg per invoice unit (MT = qty × CF ÷ 1000). */
export function formatConversionFactorWithUnit(record = {}, fallbackUnit = '') {
  const cf = parseNum(record.conversion_factor ?? record.conversionFactor);
  if (cf == null) return '—';
  const uom = resolvePackagingUom(record) || str(fallbackUnit || record.unit || 'unit');
  const cfText = cf.toLocaleString('en-IN', { maximumFractionDigits: 6 });
  return `${cfText} kg/${uom}`;
}

/** Strip OCR garbage and normalize to a short plastic material label. */
export function sanitizePlasticMaterial(value = '') {
  let v = str(value);
  if (!v) return '';

  if (v.length > 48 || OCR_GARBAGE_MATERIAL_RE.test(v)) {
    for (const material of KNOWN_PLASTIC_MATERIALS) {
      const re = new RegExp(`\\b${material}\\b`, 'i');
      if (re.test(v)) return material === 'Other' ? 'Others' : material;
    }
    return '';
  }

  if (/^cat-[iv]/i.test(v)) {
    v = v.replace(/^cat-[iv][^a-zA-Z]*/i, '').replace(/^\(|\)$/g, '').trim();
    if (!v || v.length > 32) return '';
  }

  const exact = KNOWN_PLASTIC_MATERIALS.find((m) => m.toLowerCase() === v.toLowerCase());
  if (exact) return exact === 'Other' ? 'Others' : exact;

  if (v.length <= 32) return v;
  return '';
}

/** Keep only valid CPCB plastic categories. */
export function sanitizePlasticCategory(value = '') {
  const cat = normalizePlasticCategory(value);
  return PLASTIC_CATEGORIES.includes(cat) ? cat : '';
}

/** Try to pull HSN digits from product description when column is empty. */
/** Normalize one packaging_master row before save or repair. */
export function normalizePackagingMasterRecord(record = {}) {
  const product_description = str(record.product_description).slice(0, 500);
  const hsn =
    normalizeHsn(record.hsn) ||
    extractHsnFromText(product_description) ||
    extractHsnFromText(record.product_match_key);
  const uom = resolvePackagingUom(record);
  const product_match_key =
    str(record.product_match_key) || buildProductMatchKey(product_description, hsn);
  const conversion_factor = parseNum(record.conversion_factor);

  return {
    ...record,
    product_description,
    hsn,
    uom,
    product_match_key,
    plastic_category: sanitizePlasticCategory(record.plastic_category),
    plastic_material: sanitizePlasticMaterial(record.plastic_material),
    conversion_factor,
    cf_base_source: normalizeCfBaseSource(record.cf_base_source || 'quantity'),
  };
}

export function packagingMasterCompleteness(record = {}) {
  const missing = [];
  if (!sanitizePlasticCategory(record.plastic_category)) missing.push('category');
  if (parseNum(record.conversion_factor) == null) missing.push('cf');
  if (!normalizeHsn(record.hsn)) missing.push('hsn');
  return {
    ok: missing.length === 0,
    missing,
    label: missing.length === 0 ? 'Complete' : `Missing ${missing.join(', ')}`,
  };
}

/** Build packaging_master upsert payload from a review / invoice line item. */
export function lineItemToPackagingSyncRow(line = {}, options = {}) {
  const productDesc = str(
    line.productDescription ?? line.product ?? line.item_name ?? line.product_description,
  );
  if (!productDesc) return null;

  const uomFields = normalizeLineUom(line);
  const uom = str(uomFields.unit || line.uom || line.unit || line.unitInInvoice || line.unit_in_invoice);
  const hsn = normalizeHsn(line.hsn ?? line.hsn_code);
  const productMatchKey = buildProductMatchKey(productDesc, hsn);
  const plasticCategory = str(line.plasticCategory ?? line.category_of_plastic);
  const plasticMaterial = str(line.plasticMaterial ?? line.plastic_material ?? line.plastic_type);
  const cf = resolveLineConversionFactorForPackaging(line);
  const processedMt = parseNum(line.processedQuantity ?? line.processed_quantity ?? line.valueInMt);

  if (!plasticCategory && !plasticMaterial && !uom && !hsn && cf == null) {
    return null;
  }

  return normalizePackagingMasterRecord({
    company_id: options.companyId ?? null,
    list_type: options.listType || 'purchase',
    product_description: productDesc,
    product_match_key: productMatchKey,
    hsn,
    uom,
    supplier_gst: str(options.supplierGst),
    supplier_name: str(options.supplierName),
    plastic_category: plasticCategory,
    plastic_material: plasticMaterial,
    other_plastic_material: str(line.otherPlasticMaterial ?? line.other_plastic_material),
    recycled_percent: line.recycledPercent ?? line.recycled_plastic_percent ?? null,
    conversion_factor: cf,
    cf_base_source: normalizeCfBaseSource(line.cfBaseSource ?? line.cf_base_source ?? 'quantity'),
    value_in_mt: processedMt,
    source: options.source || 'review',
  });
}
export function lineItemsToPackagingSyncRows(lineItems = [], options = {}) {
  const rows = [];
  const seen = new Set();
  for (const item of lineItems || []) {
    const row = lineItemToPackagingSyncRow(item, options);
    if (!row || seen.has(row.product_match_key)) continue;
    seen.add(row.product_match_key);
    rows.push(row);
  }
  return rows;
}
