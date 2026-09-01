import { resolveRecordTotalMt, resolveFinancialYear } from './procurementConversionFactor.js';
import { normalizePlasticCategory, PLASTIC_CATEGORIES } from './plasticCategories.js';
import { normalizeStateLabel, resolveState } from './gstStateCodes.js';
import { normalizePlasticMaterial } from './reviewEnrichment.js';
import {
  resolveProcurementAddress,
  resolveSalesAddress,
  resolveSalesGstOtherCharges,
} from './reviewEnrichment.js';

/** Section 5b/5d — only Doc Processor rows with this status sync to Registration + automation. */
export const PART_B_SECTION5_DOC_STATUS = 'published';

export function isPublishedDocRecord(row = {}) {
  return (row.doc_status || 'inbox') === PART_B_SECTION5_DOC_STATUS;
}

const CATEGORY_TO_PART_B_LABEL = {
  'Cat-I': 'Rigid Plastic (Cat-I)',
  'Cat-II': 'Flexible Plastic (Cat-II)',
  'Cat-III': 'MLP (Cat-III)',
  'Cat-IV': 'Compostable Plastic (Cat-IV)',
};

export const PORTAL_SEC5_ENTITY_TYPES = ['Importer', 'Brand Owner'];

export const PORTAL_PLASTIC_MATERIALS = [
  'HDPE', 'PET', 'PP', 'PS', 'LDPE', 'LLDPE', 'MLP', 'PE', 'PVC', 'Others',
  'PMMA', 'EPS', 'PLA', 'PBAT', 'PBS',
];

export const PORTAL_PLASTIC_MATERIAL_VALUES = {
  HDPE: '1',
  PET: '2',
  PP: '3',
  PS: '4',
  LDPE: '5',
  LLDPE: '6',
  MLP: '7',
  PE: '12',
  PVC: '13',
  Others: '14',
  PMMA: '15',
  EPS: '16',
  PLA: '17',
  PBAT: '18',
  PBS: '19',
};

export const PORTAL_SEC5_ENTITY_VALUES = {
  Importer: '2',
  'Brand Owner': '3',
};

export const PORTAL_SEC5_REG_TYPE_VALUES = {
  UnRegistered: 'UnRegistered',
  Unregistered: 'UnRegistered',
  Registered: 'Registered',
};

export function isSec5PortalEntityType(entityType = '') {
  const mapped = mapSec5bEntityType(entityType);
  return PORTAL_SEC5_ENTITY_TYPES.includes(mapped);
}

export function isPortalPlasticMaterial(materialType = '') {
  const value = String(materialType || '').trim();
  if (!value) return false;
  if (/^(raw material|packaging)$/i.test(value)) return false;
  return PORTAL_PLASTIC_MATERIALS.some((m) => m.toLowerCase() === value.toLowerCase());
}

export function isSec5bRowPortalReady(row = {}) {
  return Boolean(
    String(row.entityName || '').trim()
    && isSec5PortalEntityType(row.entityType)
    && isPortalPlasticMaterial(row.materialType)
  );
}

export function toPartBCategoryLabel(category = '') {
  const normalized = normalizePlasticCategory(category);
  if (!normalized) return '';
  return CATEGORY_TO_PART_B_LABEL[normalized] || normalized;
}

export function mapSec5bEntityType(entityType = '') {
  const value = String(entityType || '').trim();
  if (/brand owner/i.test(value)) return 'Brand Owner';
  if (/importer/i.test(value)) return 'Importer';
  return '';
}

export function isUnregisteredRegistrationType(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized) return false;
  return normalized.includes('unregistered') || normalized === 'unregistered';
}

export function resolvePlasticMaterialFromRecord(row = {}) {
  const firstLine = (row.line_items || row.lineItems || [])[0] || {};
  const candidates = [
    row.plastic_type,
    row.plastic_material,
    row.plasticMaterial,
    firstLine.plasticMaterial,
    firstLine.plastic_material,
    row.extraction?.plastic_material_type,
    row.extraction?.plastic_type,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (!text) continue;
    const normalized = normalizePlasticMaterial(text);
    const mapped = mapPlasticMaterialForPortal(normalized || text, {}, '');
    if (isPortalPlasticMaterial(mapped)) return mapped;
  }
  return '';
}

export function mapPlasticMaterialForPortal(plasticType = '', lineItem = {}, category = '') {
  const raw = String(
    plasticType || lineItem.plasticMaterial || lineItem.plastic_material || lineItem.product || '',
  ).trim();
  if (!raw) return '';

  const normalized = normalizePlasticMaterial(raw);
  const upper = (normalized || raw).toUpperCase();

  if (/^PACKAGING$|^RAW MATERIAL$/i.test(raw)) {
    return 'Others';
  }

  if (upper.includes('HDPE')) return 'HDPE';
  if (upper.includes('LLDPE')) return 'LLDPE';
  if (upper.includes('LDPE')) return 'LDPE';
  if (upper.includes('PET')) return 'PET';
  if (upper.includes('PVC')) return 'PVC';
  if (upper.includes('MLP')) return 'MLP';
  if (upper.includes('EPS')) return 'EPS';
  if (upper.includes('PMMA')) return 'PMMA';
  if (upper.includes('PLA')) return 'PLA';
  if (upper.includes('PBAT')) return 'PBAT';
  if (upper.includes('PBS')) return 'PBS';
  if (/\bPP\b/.test(upper) || upper.includes('POLYPROPYLENE')) return 'PP';
  if (upper.includes('PS') || upper.includes('POLYSTYRENE')) return 'PS';
  if (/\bPE\b/.test(upper)) return 'PE';
  if (normalized && isPortalPlasticMaterial(normalized)) return normalized;
  return isPortalPlasticMaterial(raw) ? raw : '';
}

export function resolveSec5bCountry(row = {}) {
  const country = String(row.country || row.extraction?.country || '').trim();
  if (country && !/^india$/i.test(country) && country.toLowerCase() !== 'in') {
    return country.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'India';
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

export function toPortalInputDate(value = '') {
  const iso = toInputDate(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

export function resolvePurchaseDate(row = {}) {
  return toInputDate(
    row.invoice_date
    || row.procurement_date
    || row.date_of_entry
    || row.date
    || row.extraction?.invoice_date
    || row.extraction?.date,
  );
}

export function resolvePurchaseInvoicePath(row = {}) {
  const source = row._source_fields && typeof row._source_fields === 'object' ? row._source_fields : {};
  return (
    source.local_pdf_path
    || row.local_pdf_path
    || row.file_path
    || row.pdf_path
    || row.invoiceDoc
    || source.file_path
    || ''
  );
}

const CATEGORY_3C_KEYS = ['cat1', 'cat2', 'cat3', 'cat4'];
export const SECTION5_PARTA_TOLERANCE = 0.4;

export function mapSec5aProcType(entityType = '') {
  const value = String(entityType || '').trim();
  if (/brand owner/i.test(value)) return 'Brand Owner';
  if (/importer/i.test(value)) return 'Importer';
  if (/producer/i.test(value)) return 'Producer';
  if (/processor|recycl/i.test(value)) return 'Plastic Waste Processor';
  return 'Importer';
}

export function normalizeSec5aRowForPortal(row = {}) {
  return {
    ...row,
    regType: 'Registered',
    procType: mapSec5aProcType(row.procType || row.entity_type || row.entityType || 'Importer'),
    recycledPercent: row.recycledPercent != null && row.recycledPercent !== ''
      ? String(row.recycledPercent)
      : '0',
    category: row.category ? toPartBCategoryLabel(row.category) || row.category : row.category,
  };
}

export function categoryLabelToIndex(category = '') {
  const text = String(category || '').trim();
  if (!text) return -1;

  const normalized = normalizePlasticCategory(text);
  if (normalized) {
    const idx = PLASTIC_CATEGORIES.indexOf(normalized);
    if (idx >= 0) return idx;
  }

  for (let i = 0; i < PLASTIC_CATEGORIES.length; i += 1) {
    const label = toPartBCategoryLabel(PLASTIC_CATEGORIES[i]);
    if (text === label) return i;
    const cat = PLASTIC_CATEGORIES[i];
    if (new RegExp(`\\(${cat.replace('-', '\\-')}\\)`, 'i').test(text)) return i;
  }

  const lower = text.toLowerCase();
  for (let i = 0; i < PLASTIC_CATEGORIES.length; i += 1) {
    const cat = PLASTIC_CATEGORIES[i].toLowerCase();
    if (lower.includes(cat) || lower.includes(`cat-${['i', 'ii', 'iii', 'iv'][i]}`)) return i;
  }
  return -1;
}

export function sumSec5CategoryYear(rows = [], year = '', catIndex = 0) {
  let sum = 0;
  for (const row of rows || []) {
    if (String(row.financialYear || '') !== String(year || '')) continue;
    if (categoryLabelToIndex(row.category) !== catIndex) continue;
    sum += Number(row.quantity) || 0;
  }
  return Number(sum.toFixed(4));
}

export function sumSec5abCategoryYear(sec5a = [], sec5b = [], year = '', catIndex = 0) {
  return Number((
    sumSec5CategoryYear(sec5a, year, catIndex) + sumSec5CategoryYear(sec5b, year, catIndex)
  ).toFixed(4));
}

export function validateSection5abAgainstPlasticConsumed(
  sec5a = [],
  sec5b = [],
  plasticConsumed = {},
  years = [],
  tolerance = SECTION5_PARTA_TOLERANCE,
) {
  const issues = [];
  const fyList = years.length
    ? years
    : [...new Set([
      ...sec5a.map((r) => r.financialYear),
      ...sec5b.map((r) => r.financialYear),
    ].filter(Boolean))];

  for (const year of fyList) {
    for (let i = 0; i < PLASTIC_CATEGORIES.length; i += 1) {
      const catKey = CATEGORY_3C_KEYS[i];
      const label = toPartBCategoryLabel(PLASTIC_CATEGORIES[i]) || PLASTIC_CATEGORIES[i];
      const partAVal = Number(plasticConsumed?.[year]?.[catKey]) || 0;
      const procuredSum = sumSec5abCategoryYear(sec5a, sec5b, year, i);

      if (partAVal <= 0 && procuredSum <= 0) continue;

      if (partAVal <= 0 && procuredSum > 0) {
        issues.push({
          year,
          category: label,
          catKey,
          partAVal,
          procuredSum,
          message: `Section 5a+5b ${label} (${year}): procured total ${procuredSum} TPA, but Part A 3c has ${catKey}=0.`,
        });
        continue;
      }

      const minAllowed = Number((partAVal * (1 - tolerance)).toFixed(4));
      const maxAllowed = Number((partAVal * (1 + tolerance)).toFixed(4));
      if (procuredSum < minAllowed || procuredSum > maxAllowed) {
        issues.push({
          year,
          category: label,
          catKey,
          partAVal,
          procuredSum,
          minAllowed,
          maxAllowed,
          message: `Section 5a+5b ${label} (${year}): procured ${procuredSum} TPA is outside ±40% of Part A 3c ${partAVal} (${minAllowed}–${maxAllowed}).`,
        });
      }
    }
  }

  return issues;
}

export function formatSection5abPartAIssue(issue = {}) {
  return issue.message
    || `Section 5a+5b ${issue.category || ''} (${issue.year || ''}) does not match Part A 3c.`;
}

export function validateSection5bAgainstPlasticConsumed(
  sec5b = [],
  plasticConsumed = {},
  years = [],
  tolerance = SECTION5_PARTA_TOLERANCE,
) {
  const issues = validateSection5abAgainstPlasticConsumed([], sec5b, plasticConsumed, years, tolerance);
  return issues.map((issue) => ({
    ...issue,
    message: (issue.message || '').replace(/Section 5a\+5b/g, 'Section 5b'),
  }));
}

export function formatSection5bPartAIssue(issue = {}) {
  return issue.message
    || `Section 5b ${issue.category || ''} (${issue.year || ''}) does not match Part A 3c.`;
}

export function filterSec5bToPortalYears(sec5b = [], years = []) {
  const allowed = new Set((years || []).map(String));
  return (sec5b || []).filter((row) => allowed.has(String(row.financialYear || '').trim()));
}

/** Scale existing 5b rows per FY+category so totals match Part A 3c (±40% portal rule). */
export function alignSec5bRowsToPlasticConsumed(
  sec5b = [],
  plasticConsumed = {},
  years = [],
  tolerance = SECTION5_PARTA_TOLERANCE,
) {
  const rows = (sec5b || []).map((row) => ({ ...row }));

  for (const year of years) {
    for (let i = 0; i < PLASTIC_CATEGORIES.length; i += 1) {
      const catKey = CATEGORY_3C_KEYS[i];
      const partAVal = Number(plasticConsumed?.[year]?.[catKey]) || 0;
      if (partAVal <= 0) continue;

      const indices = [];
      let current = 0;
      for (let j = 0; j < rows.length; j += 1) {
        if (String(rows[j].financialYear || '') !== String(year)) continue;
        if (categoryLabelToIndex(rows[j].category) !== i) continue;
        indices.push(j);
        current += Number(rows[j].quantity) || 0;
      }
      if (!indices.length || current <= 0) continue;

      const minAllowed = Number((partAVal * (1 - tolerance)).toFixed(4));
      const maxAllowed = Number((partAVal * (1 + tolerance)).toFixed(4));
      if (current >= minAllowed && current <= maxAllowed) continue;

      const factor = partAVal / current;
      for (const j of indices) {
        rows[j] = {
          ...rows[j],
          quantity: String(Number((Number(rows[j].quantity) * factor).toFixed(4))),
          _alignedToPartA3c: true,
        };
      }
    }
  }

  return rows.map(normalizeSec5bRowForPortal);
}

/** Prepare unregistered purchase (5b) rows for CPCB portal — 5a is manual / not automated yet. */
export function prepareSec5bForPortal({
  plasticConsumed = {},
  sec5b = [],
  years = [],
  tolerance = SECTION5_PARTA_TOLERANCE,
  alignToPartA = true,
} = {}) {
  let rows = filterSec5bToPortalYears(sec5b, years).map(normalizeSec5bRowForPortal);
  if (alignToPartA && years.length) {
    rows = alignSec5bRowsToPlasticConsumed(rows, plasticConsumed, years, tolerance);
  }
  return rows;
}

/** @deprecated 5a automation not ready — use prepareSec5bForPortal */
export function prepareSec5abForPortal(opts = {}) {
  return {
    sec5a: opts.sec5a || [],
    sec5b: prepareSec5bForPortal(opts),
  };
}

/** @deprecated use prepareSec5bForPortal when 5a is empty */
export function buildSec5aBalanceRowsForPlasticConsumed() {
  return [];
}

export function buildSec5aRowFromPurchase(row = {}) {
  const quantityMt = resolveRecordTotalMt(row, 'purchase');
  const firstLine = (row.line_items || row.lineItems || [])[0] || {};
  const category = toPartBCategoryLabel(
    row.category_of_plastic || firstLine.plasticCategory || firstLine.category_of_plastic,
  );
  const financialYear = row.financial_year
    || resolveFinancialYear(row.procurement_date || row.invoice_date || row.date_of_entry)
    || '';

  return {
    regType: 'Registered',
    procType: mapSec5aProcType(row.entity_type),
    invoiceNo: row.invoice_no || row.invoice_number || row.application_number || '',
    quantity: quantityMt != null ? String(Number(quantityMt.toFixed(4))) : '',
    recycledPercent: row.recycled_plastic_percent != null && row.recycled_plastic_percent !== ''
      ? String(row.recycled_plastic_percent)
      : '0',
    category,
    financialYear,
    sourceRecordId: row.id,
    sourceInvoiceNo: row.invoice_no || row.invoice_number || '',
  };
}

export function buildSec5aFromPurchases(purchases = [], { companyId = null, docStatus = 'published' } = {}) {
  let rows = filterByCompany(purchases, companyId);
  if (docStatus && docStatus !== 'all') {
    rows = rows.filter((row) => (row.doc_status || 'inbox') === docStatus);
  }
  rows = rows.filter((row) => !isUnregisteredRegistrationType(row.registration_type));

  return rows
    .map(buildSec5aRowFromPurchase)
    .filter((row) => row.invoiceNo || row.quantity);
}

export function buildSec5bRowFromPurchase(row = {}) {
  const quantityMt = resolveRecordTotalMt(row, 'purchase');
  const firstLine = (row.line_items || row.lineItems || [])[0] || {};
  const category = toPartBCategoryLabel(
    row.category_of_plastic || firstLine.plasticCategory || firstLine.category_of_plastic,
  );
  const entityType = mapSec5bEntityType(row.entity_type);
  const materialType = resolvePlasticMaterialFromRecord(row) || 'Others';
  const financialYear = row.financial_year
    || resolveFinancialYear(row.procurement_date || row.invoice_date || row.date_of_entry)
    || '';

  return {
    regType: 'UnRegistered',
    entityType: entityType || 'Importer',
    entityName: row.supplier_name || row.vendor_name || '',
    country: resolveSec5bCountry(row),
    address: row.address_line_1 || resolveProcurementAddress(row) || row.address || '',
    mobile: row.supplier_mobile_number || row.mobile_number || '',
    materialType,
    plastic_type: row.plastic_type || materialType,
    category,
    financialYear,
    date: resolvePurchaseDate(row),
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
  rows = rows.filter((row) => {
    const raw = String(row.entity_type || '').trim();
    if (!raw) return true;
    return isSec5PortalEntityType(raw);
  });

  return rows
    .map(buildSec5bRowFromPurchase)
    .filter((row) => row.entityName || row.quantity);
}

export function normalizeSec5bRowForPortal(row = {}) {
  let entityType = String(row.entityType || row.entity_type || '').trim();
  if (!isSec5PortalEntityType(entityType)) {
    entityType = mapSec5bEntityType(entityType) || 'Importer';
  }

  let materialType = String(row.materialType || row.plastic_type || row.plasticType || '').trim();
  if (!isPortalPlasticMaterial(materialType)) {
    const mapped = mapPlasticMaterialForPortal(materialType, {}, '');
    materialType = isPortalPlasticMaterial(mapped) ? mapped : '';
  }
  if (!materialType) materialType = 'Others';

  return {
    ...row,
    regType: 'UnRegistered',
    entityType,
    materialType,
    plastic_type: row.plastic_type || materialType,
    country: row.country || 'India',
    date: toInputDate(row.date || row.invoice_date || row.procurement_date),
    recycledPercent: row.recycledPercent != null && row.recycledPercent !== ''
      ? String(row.recycledPercent)
      : '0',
  };
}

function existingSec5RowMaps(existing = []) {
  const bySource = new Map();
  const byComposite = new Map();
  for (const row of existing) {
    if (row.sourceRecordId != null) bySource.set(String(row.sourceRecordId), row);
    const name = String(row.entityName || '').trim().toLowerCase();
    const invoice = String(row.sourceInvoiceNo || row.invoiceNo || '').trim().toLowerCase();
    const date = String(row.date || '').trim();
    const compositeKey = `${name}::${invoice}::${date}`;
    if (name && !byComposite.has(compositeKey)) byComposite.set(compositeKey, row);
  }
  return { bySource, byComposite };
}

function findExistingSec5Row(maps, computedRow = {}) {
  const byId = maps.bySource.get(String(computedRow.sourceRecordId ?? ''));
  if (byId) return byId;
  const name = String(computedRow.entityName || '').trim().toLowerCase();
  const invoice = String(computedRow.sourceInvoiceNo || '').trim().toLowerCase();
  const date = String(computedRow.date || '').trim();
  if (name) {
    const exact = maps.byComposite.get(`${name}::${invoice}::${date}`);
    if (exact) return exact;
  }
  return null;
}

export function normalizeSec5dRowForPortal(row = {}) {
  let entityType = String(row.entityType || row.entity_type || '').trim();
  if (!isSec5PortalEntityType(entityType)) {
    entityType = mapSec5dEntityType(entityType);
  }
  let materialType = String(row.materialType || row.plastic_type || row.plasticType || '').trim();
  if (!isPortalPlasticMaterial(materialType)) {
    const mapped = mapPlasticMaterialForPortal(materialType, {}, '');
    materialType = isPortalPlasticMaterial(mapped) ? mapped : '';
  }
  if (!materialType) materialType = 'Others';
  return {
    ...row,
    regType: 'UnRegistered',
    entityType,
    materialType,
    plastic_type: row.plastic_type || materialType,
    recycledPercent: row.recycledPercent != null && row.recycledPercent !== ''
      ? String(row.recycledPercent)
      : '0',
  };
}

function sec5RowCompositeKey(row = {}) {
  const name = String(row.entityName || '').trim().toLowerCase();
  const invoice = String(row.sourceInvoiceNo || row.invoiceNo || '').trim().toLowerCase();
  const date = String(row.date || '').trim();
  return `${name}::${invoice}::${date}`;
}

function preserveManualSec5Rows(existing = [], fromComputed = [], computed = []) {
  const normalizedExisting = existing.map(normalizeSec5bRowForPortal).filter(sec5bRowHasData);
  const computedSourceIds = new Set(
    computed.map((row) => String(row.sourceRecordId ?? '')).filter(Boolean),
  );
  const computedKeys = new Set(fromComputed.map(sec5RowCompositeKey));

  return normalizedExisting.filter((row) => {
    if (row.sourceRecordId != null && row.sourceRecordId !== '') {
      return !computedSourceIds.has(String(row.sourceRecordId));
    }
    return !computedKeys.has(sec5RowCompositeKey(row));
  });
}

export function reconcileSec5bForAutomation(existing = [], computed = []) {
  const normalizedExisting = existing.map(normalizeSec5bRowForPortal).filter(sec5bRowHasData);

  if (!computed.length) {
    return normalizedExisting;
  }

  const maps = existingSec5RowMaps(normalizedExisting);
  const fromComputed = computed
    .map((computedRow) => {
      const prev = findExistingSec5Row(maps, computedRow);
      return normalizeSec5bRowForPortal({
        ...(prev || {}),
        ...computedRow,
        entityType: computedRow.entityType,
        materialType: computedRow.materialType,
        plastic_type: computedRow.plastic_type || computedRow.materialType,
        category: computedRow.category || prev?.category || '',
        date: computedRow.date || prev?.date || '',
        invoiceDoc: computedRow.invoiceDoc || prev?.invoiceDoc || '',
      });
    })
    .filter(sec5bRowHasData);

  const manualRows = preserveManualSec5Rows(normalizedExisting, fromComputed, computed);
  return [...fromComputed, ...manualRows];
}

function preserveManualSec5dRows(existing = [], fromComputed = [], computed = []) {
  const normalizedExisting = existing.map(normalizeSec5dRowForPortal).filter(sec5dRowHasData);
  const computedSourceIds = new Set(
    computed.map((row) => String(row.sourceRecordId ?? '')).filter(Boolean),
  );
  const computedKeys = new Set(fromComputed.map(sec5RowCompositeKey));

  return normalizedExisting.filter((row) => {
    if (row.sourceRecordId != null && row.sourceRecordId !== '') {
      return !computedSourceIds.has(String(row.sourceRecordId));
    }
    return !computedKeys.has(sec5RowCompositeKey(row));
  });
}

export function reconcileSec5dForAutomation(existing = [], computed = []) {
  const normalizedExisting = existing.map(normalizeSec5dRowForPortal).filter(sec5dRowHasData);

  if (!computed.length) {
    return normalizedExisting;
  }

  const maps = existingSec5RowMaps(normalizedExisting);
  const fromComputed = computed
    .map((computedRow) => {
      const prev = findExistingSec5Row(maps, computedRow);
      return normalizeSec5dRowForPortal({
        ...(prev || {}),
        ...computedRow,
        entityType: computedRow.entityType,
        materialType: computedRow.materialType,
        plastic_type: computedRow.plastic_type || computedRow.materialType,
        category: computedRow.category || prev?.category || '',
        invoiceDoc: computedRow.invoiceDoc || prev?.invoiceDoc || '',
      });
    })
    .filter(sec5dRowHasData);

  const manualRows = preserveManualSec5dRows(normalizedExisting, fromComputed, computed);
  return [...fromComputed, ...manualRows];
}

export function sec5bRowHasData(row = {}) {
  return Boolean(
    String(row.entityName || '').trim()
    || Number(row.quantity) > 0
    || String(row.invoiceDoc || '').trim(),
  );
}

export function sec5aRowHasData(row = {}) {
  return Boolean(
    Number(row.quantity) > 0
    && String(row.category || '').trim()
    && String(row.financialYear || '').trim(),
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
  if (/brand owner/i.test(value)) return 'Brand Owner';
  if (/importer/i.test(value)) return 'Importer';
  return 'Brand Owner';
}

export function resolveSec5dState(state = '', gstNumber = '') {
  return resolveState(state, gstNumber) || normalizeStateLabel(state) || String(state || '').trim();
}

export function buildSec5dRowFromSale(row = {}) {
  const quantityMt = resolveRecordTotalMt(row, 'sale');
  const firstLine = (row.line_items || row.lineItems || [])[0] || {};
  const category = toPartBCategoryLabel(
    row.category_of_plastic || firstLine.plasticCategory || firstLine.category_of_plastic,
  );
  const gstPaid = resolveSalesGstOtherCharges(row);
  const financialYear = row.financial_year
    || resolveFinancialYear(row.invoice_date || row.date)
    || '';

  return {
    regType: 'UnRegistered',
    entityType: mapSec5dEntityType(row.entity_type),
    entityName: row.entity_name || row.customer_name || '',
    address: row.address || resolveSalesAddress(row) || '',
    state: resolveSec5dState(row.state, row.customer_gstin),
    mobile: row.mobile_number || '',
    materialType: resolvePlasticMaterialFromRecord(row) || 'Others',
    category,
    financialYear,
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
  return reconcileSec5dForAutomation(existing, computed);
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
  return reconcileSec5bForAutomation(existing, computed);
}
