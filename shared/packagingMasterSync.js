import { buildProductMatchKey, normalizeCfBaseSource, normalizeLineUom } from './procurementConversionFactor.js';

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

  return {
    company_id: options.companyId ?? null,
    list_type: options.listType || 'gpl',
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
  };
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
