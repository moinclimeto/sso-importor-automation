import { resolveRecordTotalMt } from './procurementConversionFactor.js';
import { normalizePlasticCategory } from './plasticCategories.js';
import { normalizeStateLabel, resolveState } from './gstStateCodes.js';
import { normalizePlasticMaterial } from './reviewEnrichment.js';
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

export function buildSec5bRowFromPurchase(row = {}) {
  const quantityMt = resolveRecordTotalMt(row, 'purchase');
  const firstLine = (row.line_items || row.lineItems || [])[0] || {};
  const category = toPartBCategoryLabel(
    row.category_of_plastic || firstLine.plasticCategory || firstLine.category_of_plastic,
  );
  const entityType = mapSec5bEntityType(row.entity_type);
  const materialType = resolvePlasticMaterialFromRecord(row) || 'Others';

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
    financialYear: row.financial_year || '',
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

export function reconcileSec5bForAutomation(existing = [], computed = []) {
  if (computed.length) {
    const maps = existingSec5RowMaps(existing);
    return computed
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
      .filter((row) => row.entityName || row.quantity);
  }

  return existing
    .map(normalizeSec5bRowForPortal)
    .filter((row) => row.entityName || row.quantity);
}

export function reconcileSec5dForAutomation(existing = [], computed = []) {
  if (computed.length) {
    const maps = existingSec5RowMaps(existing);
    return computed
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
      .filter((row) => row.entityName || row.quantity);
  }

  return existing
    .map(normalizeSec5dRowForPortal)
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

  return {
    regType: 'UnRegistered',
    entityType: mapSec5dEntityType(row.entity_type),
    entityName: row.entity_name || row.customer_name || '',
    address: row.address || resolveSalesAddress(row) || '',
    state: resolveSec5dState(row.state, row.customer_gstin),
    mobile: row.mobile_number || '',
    materialType: resolvePlasticMaterialFromRecord(row) || 'Others',
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
