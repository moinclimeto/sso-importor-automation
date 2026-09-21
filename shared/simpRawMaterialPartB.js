import ExcelJS from 'exceljs';
import { getCpcbPortalPartA3cYears } from './financialYearScope.js';
import {
  itemToLineDraft,
  parseRecordLineItems,
  resolveFinancialYear,
  resolveLineMt,
  resolveRecordTotalMt,
} from './procurementConversionFactor.js';
import { resolveSalesAddress } from './reviewEnrichment.js';

/** CPCB SIMP Importer Import/Sales template dropdown — PVC/PE/PBS/PMMA/EPS are rejected. */
export const SIMP_PLASTIC_TYPES = [
  'HDPE',
  'PET',
  'PP',
  'PS',
  'LDPE',
  'LLDPE',
  'PLA',
  'PBAT',
  'MLP',
  'Others',
];

const SIMP_PLASTIC_TYPE_ALIASES = {
  PVC: 'Others',
  PE: 'LDPE',
  PBS: 'Others',
  PMMA: 'Others',
  EPS: 'PS',
  OTHER: 'Others',
  OTHERS: 'Others',
};

export const SIMP_REGISTRATION_TYPES = ['Registered', 'Unregistered'];

export function emptySimpImportRow() {
  return {
    id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityName: '',
    country: '',
    address: '',
    contact: '',
    financialYear: '',
    plasticType: '',
    quantityTons: '',
    quantityTpa: '',
    importDate: '',
  };
}

export function emptySimpSupplyRow() {
  return {
    id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    registrationType: 'Registered',
    entityType: '',
    eprRegistrationNo: '',
    entityName: '',
    country: 'India',
    address: '',
    contact: '',
    financialYear: '',
    plasticType: '',
    quantityTons: '',
    quantityTpa: '',
    salesDate: '',
  };
}

/** CPCB "Importer Import Template.xlsx" — sheet Operations. */
export const SIMP_IMPORT_EXCEL_SHEET_NAME = 'Operations';
export const SIMP_IMPORT_EXCEL_FILE_NAME = 'Importer Import Template.xlsx';
export const SIMP_SUPPLY_EXCEL_SHEET_NAME = 'Operations';
export const SIMP_SUPPLY_EXCEL_FILE_NAME = 'Importer Sales Template.xlsx';

export const SIMP_SALES_ENTITY_TYPES = [
  'Producer',
  'Seller of raw material',
  'Producer (Small or Micro)',
];

export const SIMP_SALES_EXCEL_REGISTRATION_TYPES = ['Registered', 'UnRegistered'];

export const SIMP_IMPORT_DETAILS_COLUMNS = [
  { header: 'Name', key: 'entityName', width: 28 },
  { header: 'Country', key: 'country', width: 16 },
  { header: 'Address', key: 'address', width: 36 },
  { header: 'Contact', key: 'contact', width: 16 },
  { header: 'Financial Year', key: 'financialYear', width: 16 },
  { header: 'Type Of Plastic Raw Material', key: 'plasticType', width: 28 },
  { header: 'Quantity(tons)', key: 'quantityTons', width: 16 },
  { header: 'Import Date (YYYY-MM-DD)', key: 'importDate', width: 24 },
];

export const SIMP_SUPPLY_DETAILS_COLUMNS = [
  { header: 'Registration Type', key: 'registrationType', width: 20 },
  { header: 'Entity Type', key: 'entityType', width: 22 },
  { header: 'EPR Registration No.', key: 'eprRegistrationNo', width: 22 },
  { header: 'Name', key: 'entityName', width: 28 },
  { header: 'Address', key: 'address', width: 36 },
  { header: 'Contact', key: 'contact', width: 16 },
  { header: 'Financial Year', key: 'financialYear', width: 16 },
  { header: 'Type Of Plastic Raw Material', key: 'plasticType', width: 28 },
  { header: 'Quantity(tons)', key: 'quantityTons', width: 16 },
  { header: 'Sales Date (YYYY-MM-DD)', key: 'salesDate', width: 24 },
];

export function normalizePlasticTypeKey(value = '') {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeFinancialYearKey(value = '') {
  const v = String(value || '').trim();
  const match = v.match(/(20\d{2})\s*[-/]\s*(\d{2,4})/);
  if (match) {
    const start = match[1];
    let end = match[2];
    if (end.length === 4) end = end.slice(2);
    return `${start}-${end}`;
  }
  return v;
}

export function buildGroupKey(financialYear = '', plasticType = '') {
  const fy = normalizeFinancialYearKey(financialYear);
  const pt = normalizePlasticTypeKey(plasticType);
  return `${fy}::${pt}`;
}

export function requiredSimpImportFinancialYears(asOfDate = new Date()) {
  return getCpcbPortalPartA3cYears(asOfDate);
}

export function mapToSimpPlasticType(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = normalizePlasticTypeKey(raw);
  if (SIMP_PLASTIC_TYPE_ALIASES[compact]) return SIMP_PLASTIC_TYPE_ALIASES[compact];
  const exact = SIMP_PLASTIC_TYPES.find((t) => normalizePlasticTypeKey(t) === compact);
  if (exact) return exact;
  const longerFirst = [...SIMP_PLASTIC_TYPES].sort(
    (a, b) => normalizePlasticTypeKey(b).length - normalizePlasticTypeKey(a).length,
  );
  const partial = longerFirst.find((t) => compact.includes(normalizePlasticTypeKey(t)));
  return partial || 'Others';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatSimpImportDate(value = '') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  const text = String(value || '').replace(/^\u200B/, '').replace(/^'/, '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

function defaultSimpCountry(value = '') {
  return String(value || '').trim() || 'India';
}

export function importRowQuantity(row = {}) {
  const qty = Number(row.quantityTons ?? row.quantityTpa ?? row.quantity_tpa ?? row.quantity ?? 0);
  return Number.isFinite(qty) ? qty : 0;
}

/**
 * Portal rejects Excel unless both previous FYs have at least one quantity row.
 */
export function validateSimpImportCoveringRequiredYears(
  rows = [],
  years = requiredSimpImportFinancialYears(),
) {
  const present = new Set();
  for (const row of rows || []) {
    const fy = normalizeFinancialYearKey(row.financialYear || row.financial_year || row.fy);
    if (years.includes(fy) && importRowQuantity(row) > 0) present.add(fy);
  }
  const missing = years.filter((year) => !present.has(year));
  if (!missing.length) return [];
  return [{
    missingYears: missing,
    requiredYears: years,
    message:
      `Financial Year column must contain at least one entry for each of the previous two financial years (${years.join(', ')}). Missing: ${missing.join(', ')}.`,
  }];
}

function isPublishedDoc(row = {}) {
  return (row.doc_status || 'inbox') === 'published';
}

function parseNestedObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveSimpImportContact(purchase = {}, supplierMaster = []) {
  const extraction = parseNestedObject(purchase.extraction);
  const sourceFields = parseNestedObject(purchase._source_fields);
  const candidates = [
    purchase.supplier_mobile_number,
    purchase.mobile_number,
    purchase.contact,
    purchase.phone,
    purchase.mobile,
    purchase.supplier_phone,
    purchase.supplier_mobile,
    extraction.supplier_mobile_number,
    extraction.supplier_mobile,
    extraction.mobile_number,
    extraction.mobile,
    extraction.phone,
    sourceFields.supplier_mobile_number,
    sourceFields.mobile,
  ];
  for (const value of candidates) {
    const text = String(value || '').replace(/\s+/g, '').trim();
    if (text) return String(value).trim();
  }

  const gst = String(purchase.supplier_gst_number || purchase.vendor_gstin || '').trim().toUpperCase();
  const name = String(purchase.supplier_name || purchase.vendor_name || '').trim().toLowerCase();
  const fromMaster = (supplierMaster || []).find((row) => {
    const rowGst = String(row.gst_number || row.gstin || '').trim().toUpperCase();
    const rowName = String(row.trade_name || row.legal_name || row.name || '').trim().toLowerCase();
    if (gst && rowGst && rowGst === gst) return true;
    if (name && rowName && rowName === name) return true;
    return false;
  });
  return String(fromMaster?.mobile || fromMaster?.mobile_number || '').trim();
}

function findSimpPartyMaster(record = {}, supplierMaster = []) {
  const gst = String(
    record.customer_gstin || record.buyer_gst || record.gst_number || record.gstin || '',
  ).trim().toUpperCase();
  const name = String(
    record.entity_name || record.customer_name || record.buyer_name || record.trade_name || '',
  ).trim().toLowerCase();
  return (supplierMaster || []).find((row) => {
    const rowGst = String(row.gst_number || row.gstin || '').trim().toUpperCase();
    const rowName = String(row.trade_name || row.legal_name || row.name || '').trim().toLowerCase();
    if (gst && rowGst && rowGst === gst) return true;
    if (name && rowName && rowName === name) return true;
    return false;
  }) || null;
}

export function resolveSimpSupplyRegistrationType(sale = {}, supplierMaster = []) {
  const fromSale = String(sale.registration_type || sale.registrationType || '').trim();
  if (/unreg/i.test(fromSale)) return 'Unregistered';
  if (/regist/i.test(fromSale)) return 'Registered';
  const fromMaster = findSimpPartyMaster(sale, supplierMaster)?.registration_type;
  if (/unreg/i.test(String(fromMaster || ''))) return 'Unregistered';
  if (/regist/i.test(String(fromMaster || ''))) return 'Registered';
  return 'Registered';
}

export function firstNonEmptySimpContact(...values) {
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, '').trim();
    if (text) return String(value).trim();
  }
  return '';
}

export function defaultSimpDateForFinancialYear(financialYear = '') {
  const fy = normalizeFinancialYearKey(financialYear);
  const start = fy.match(/^(20\d{2})/);
  return start ? `${start[1]}-04-01` : '';
}

export function resolveSimpSupplyContact(sale = {}, supplierMaster = []) {
  const extraction = parseNestedObject(sale.extraction);
  const sourceFields = parseNestedObject(sale._source_fields);
  const fromMaster = findSimpPartyMaster(sale, supplierMaster);
  return firstNonEmptySimpContact(
    sale.mobile_number,
    sale.customer_mobile_number,
    sale.buyer_mobile,
    sale.buyer_mobile_number,
    sale.contact,
    sale.contact_number,
    sale.phone,
    sale.mobile,
    extraction.mobile_number,
    extraction.mobile,
    extraction.phone,
    extraction.buyer_mobile,
    extraction.customer_mobile,
    sourceFields.mobile_number,
    sourceFields.mobile,
    fromMaster?.mobile,
    fromMaster?.mobile_number,
    fromMaster?.phone,
    fromMaster?.contact,
  );
}

export function prepareSimpSupplyRowsForPortal(records = [], { fallbackContact = '' } = {}) {
  return (records || [])
    .filter((row) => importRowQuantity(row) > 0)
    .map((row) => {
      const financialYear = normalizeFinancialYearKey(row.financialYear || row.financial_year || row.fy || '');
      const salesDate = formatSimpImportDate(
        row.salesDate || row.sales_date || row.invoice_date || row.importDate || '',
      ) || defaultSimpDateForFinancialYear(financialYear)
        || defaultSimpDateForFinancialYear(requiredSimpImportFinancialYears()[0]);
      const entityType = String(row.entityType || row.entity_type || '').trim() || 'Producer';
      return {
        ...emptySimpSupplyRow(),
        ...row,
        registrationType: /unreg/i.test(String(row.registrationType || row.registration_type || ''))
          ? 'Unregistered'
          : 'Registered',
        entityType,
        eprRegistrationNo: String(row.eprRegistrationNo || row.epr_registration_number || '').trim(),
        entityName: String(row.entityName || row.entity_name || row.name || '').trim(),
        country: defaultSimpCountry(row.country || row.buyer_country),
        address: String(row.address || row.buyer_address || '').trim(),
        contact: firstNonEmptySimpContact(
          row.contact,
          row.phone,
          row.mobile,
          row.mobile_number,
          fallbackContact,
        ),
        financialYear,
        plasticType: mapToSimpPlasticType(row.plasticType || row.plastic_type || row.resinType || ''),
        quantityTons: importRowQuantity(row),
        quantityTpa: importRowQuantity(row),
        salesDate,
      };
    });
}

export function prepareSimpImportRowsForPortal(records = [], { fallbackContact = '' } = {}) {
  return (records || [])
    .filter((row) => importRowQuantity(row) > 0)
    .map((row) => {
      const financialYear = normalizeFinancialYearKey(row.financialYear || row.financial_year || row.fy || '');
      const importDate = formatSimpImportDate(
        row.importDate || row.import_date || row.invoice_date || '',
      ) || defaultSimpDateForFinancialYear(financialYear);
      return {
        ...emptySimpImportRow(),
        ...row,
        entityName: String(row.entityName || row.entity_name || row.name || '').trim(),
        country: defaultSimpCountry(row.country || row.origin_country),
        address: String(row.address || row.supplier_address || '').trim(),
        contact: firstNonEmptySimpContact(row.contact, row.phone, row.mobile, row.mobile_number, fallbackContact),
        financialYear,
        plasticType: mapToSimpPlasticType(row.plasticType || row.plastic_type || row.resinType || ''),
        quantityTons: importRowQuantity(row),
        quantityTpa: importRowQuantity(row),
        importDate,
      };
    });
}

export function validateSimpSupplyPortalRows(rows = []) {
  const issues = [];
  (rows || []).forEach((row, index) => {
    const n = index + 1;
    if (!String(row.entityName || '').trim()) {
      issues.push({ row: n, field: 'name', message: `Row ${n}: 'name' is required and cannot be empty` });
    }
    if (!String(row.country || '').trim()) {
      issues.push({ row: n, field: 'country', message: `Row ${n}: 'country' is required and cannot be empty` });
    }
    if (!String(row.contact || '').trim()) {
      issues.push({ row: n, field: 'contact', message: `Row ${n}: 'contact' is required and cannot be empty` });
    }
    if (!String(row.salesDate || row.importDate || '').trim()) {
      issues.push({ row: n, field: 'importDate', message: `Row ${n}: 'Import date' is required and cannot be empty` });
    }
    if (!String(row.entityType || '').trim()) {
      issues.push({ row: n, field: 'entityType', message: `Row ${n}: 'entity type' is required and cannot be empty` });
    }
  });
  return issues;
}

export function resolveSimpSupplyEprNo(sale = {}, supplierMaster = []) {
  const extraction = parseNestedObject(sale.extraction);
  const candidates = [
    sale.epr_registration_number,
    sale.eprRegistrationNo,
    sale.registration_number,
    extraction.epr_registration_number,
    extraction.registration_number,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  const fromMaster = findSimpPartyMaster(sale, supplierMaster);
  return String(fromMaster?.registration_number || fromMaster?.epr_registration_number || '').trim();
}

export function buildSimpSupplyRowsFromSales(
  sales = [],
  {
    reportingYears = requiredSimpImportFinancialYears(),
    companyId = null,
    supplierMaster = [],
  } = {},
) {
  const years = (reportingYears || []).map((y) => normalizeFinancialYearKey(y)).filter(Boolean);
  const rows = [];

  for (const sale of sales || []) {
    if (!isPublishedDoc(sale)) continue;
    if (companyId != null && companyId !== '' && sale.company_id != null && sale.company_id !== ''
      && String(sale.company_id).trim() !== String(companyId).trim()) {
      continue;
    }

    const date = sale.invoice_date || sale.sales_date || sale.date || '';
    const fy = normalizeFinancialYearKey(
      sale.financial_year || resolveFinancialYear(date, sale.financial_year),
    );
    if (years.length && fy && !years.includes(fy)) continue;

    const items = parseRecordLineItems(sale);
    const headerMt = resolveRecordTotalMt(sale, 'sale')
      ?? Number(sale.quantity_sold_mt || sale.quantity_mt || sale.quantity || sale.available_quantity_mt || 0);
    const lines = items.length ? items : [sale];
    const fromMaster = findSimpPartyMaster(sale, supplierMaster);
    let usedHeaderQty = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = items.length ? lines[i] : sale;
      const draft = items.length ? itemToLineDraft(line, i) : {};
      let mt = items.length ? resolveLineMt(draft) : headerMt;
      if (mt == null || mt <= 0) {
        if (!usedHeaderQty && Number(headerMt) > 0) {
          mt = Number(headerMt);
          usedHeaderQty = true;
        } else {
          continue;
        }
      }
      const qty = Number(Number(mt).toFixed(4));
      if (!(qty > 0)) continue;
      const address = String(
        sale.address
        || resolveSalesAddress(sale)
        || fromMaster?.address
        || '',
      ).trim();
      rows.push({
        ...emptySimpSupplyRow(),
        registrationType: resolveSimpSupplyRegistrationType(sale, supplierMaster),
        entityType: String(sale.entity_type || fromMaster?.entity_type || '').trim(),
        eprRegistrationNo: resolveSimpSupplyEprNo(sale, supplierMaster),
        entityName: String(
          sale.entity_name || sale.customer_name || sale.buyer_name || fromMaster?.trade_name || '',
        ).trim(),
        country: defaultSimpCountry(sale.country || sale.buyer_country || fromMaster?.country),
        address,
        contact: resolveSimpSupplyContact(sale, supplierMaster),
        financialYear: fy,
        plasticType: mapToSimpPlasticType(
          draft.plasticMaterial || line.plastic_material || sale.plastic_type || sale.plastic_material || sale.item_name,
        ),
        quantityTons: qty,
        quantityTpa: qty,
        salesDate: formatSimpImportDate(date),
      });
    }
  }
  return rows;
}

export function buildSimpImportRowsFromPurchases(
  purchases = [],
  {
    reportingYears = requiredSimpImportFinancialYears(),
    companyId = null,
    supplierMaster = [],
  } = {},
) {
  const years = (reportingYears || []).map((y) => normalizeFinancialYearKey(y)).filter(Boolean);
  const rows = [];

  for (const purchase of purchases || []) {
    if (!isPublishedDoc(purchase)) continue;
    if (companyId != null && companyId !== '' && purchase.company_id != null
      && String(purchase.company_id) !== String(companyId)) {
      continue;
    }

    const date = purchase.invoice_date || purchase.procurement_date || purchase.date || '';
    const fy = normalizeFinancialYearKey(resolveFinancialYear(date, purchase.financial_year));
    if (years.length && !years.includes(fy)) continue;

    const items = parseRecordLineItems(purchase);
    const lines = items.length ? items : [purchase];
    for (let i = 0; i < lines.length; i += 1) {
      const draft = itemToLineDraft(lines[i], i);
      const mt = resolveLineMt(draft);
      if (mt == null || mt <= 0) continue;
      const qty = Number(mt.toFixed(4));
      rows.push({
        ...emptySimpImportRow(),
        entityName: String(purchase.supplier_name || purchase.vendor_name || purchase.entity_name || '').trim(),
        country: defaultSimpCountry(purchase.country || purchase.origin_country || purchase.supplier_country),
        address: [purchase.address_line_1, purchase.address_line_2, purchase.address]
          .map((part) => String(part || '').trim())
          .filter(Boolean)
          .join(', '),
        contact: resolveSimpImportContact(purchase, supplierMaster),
        financialYear: fy,
        plasticType: mapToSimpPlasticType(
          draft.plasticMaterial || lines[i].plastic_material || purchase.plastic_material || purchase.item_name,
        ),
        quantityTons: qty,
        quantityTpa: qty,
        importDate: formatSimpImportDate(date),
      });
    }
  }
  return rows;
}

/**
 * Validates that for each Financial Year + Plastic Type combination:
 * Total Supplied (TPA) <= Total Imported (TPA).
 *
 * @param {Array<object>} importRows
 * @param {Array<object>} supplyRows
 * @returns {Array<object>} list of validation issue objects (empty if valid)
 */
export function validateSimpRawMaterialSupplyAgainstImport(importRows = [], supplyRows = []) {
  const importsMap = new Map();
  const suppliesMap = new Map();

  for (const row of importRows) {
    const fy = normalizeFinancialYearKey(row.financialYear || row.financial_year || row.fy);
    const pt = String(row.plasticType || row.plastic_type || row.resinType || '').trim();
    const qty = Number(row.quantityTons ?? row.quantityTpa ?? row.quantity_tpa ?? row.quantity ?? row.tpa ?? 0);
    if (!fy || !pt || Number.isNaN(qty) || qty <= 0) continue;

    const key = buildGroupKey(fy, pt);
    const curr = importsMap.get(key) || { financialYear: fy, plasticType: pt, totalImported: 0 };
    curr.totalImported = Number((curr.totalImported + qty).toFixed(4));
    importsMap.set(key, curr);
  }

  for (const row of supplyRows) {
    const fy = normalizeFinancialYearKey(row.financialYear || row.financial_year || row.fy);
    const pt = String(row.plasticType || row.plastic_type || row.resinType || '').trim();
    const qty = Number(row.quantityTons ?? row.quantityTpa ?? row.quantity_tpa ?? row.quantity ?? row.tpa ?? 0);
    if (!fy || !pt || Number.isNaN(qty) || qty <= 0) continue;

    const key = buildGroupKey(fy, pt);
    const curr = suppliesMap.get(key) || { financialYear: fy, plasticType: pt, totalSupplied: 0 };
    curr.totalSupplied = Number((curr.totalSupplied + qty).toFixed(4));
    suppliesMap.set(key, curr);
  }

  const issues = [];

  for (const [key, supplyInfo] of suppliesMap.entries()) {
    const importInfo = importsMap.get(key) || {
      financialYear: supplyInfo.financialYear,
      plasticType: supplyInfo.plasticType,
      totalImported: 0,
    };

    const imported = importInfo.totalImported || 0;
    const supplied = supplyInfo.totalSupplied || 0;

    if (supplied > imported) {
      const diff = Number((supplied - imported).toFixed(4));
      issues.push({
        financialYear: supplyInfo.financialYear,
        plasticType: supplyInfo.plasticType,
        totalImported: imported,
        totalSupplied: supplied,
        difference: diff,
        message: `For ${supplyInfo.financialYear} (${supplyInfo.plasticType}): Total Supplied (${supplied} TPA) exceeds Total Imported (${imported} TPA) by ${diff} TPA.`,
      });
    }
  }

  return issues;
}

function excelColumnLetter(index1Based) {
  let n = Number(index1Based);
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function excelFinancialYearDropdownValues() {
  return requiredSimpImportFinancialYears().slice().reverse();
}

function excelListFormula(values = []) {
  return `"${values.join(',')}"`;
}

function applySimpExcelListValidation(sheet, colIndex, values, lastRow, prompt) {
  if (!colIndex || !values?.length) return;
  const letter = excelColumnLetter(colIndex);
  sheet.dataValidations.add(`${letter}2:${letter}${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [excelListFormula(values)],
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Select from list',
    error: prompt,
  });
}

function applyYmdTextColumn(sheet, columns = [], lastRow = 50) {
  for (const key of ['importDate', 'salesDate']) {
    const colIndex = columns.findIndex((col) => col.key === key) + 1;
    if (!colIndex) continue;
    const column = sheet.getColumn(colIndex);
    column.numFmt = '@';
    column.width = Math.max(column.width || 0, 22);
    for (let row = 2; row <= lastRow; row += 1) {
      const cell = sheet.getCell(row, colIndex);
      cell.numFmt = '@';
      if (cell.value == null || cell.value === '') continue;
      const raw = cell.value?.richText
        ? cell.value.richText.map((part) => part.text || '').join('')
        : cell.value;
      const ymd = formatSimpImportDate(raw);
      cell.value = ymd || null;
    }
  }
}

function applySimpPartBExcelDropdowns(workbook, sheet, columns = [], extraLists = {}, rowCount = 0) {
  const lastRow = Math.max(rowCount + 25, 50);
  const fyCol = columns.findIndex((col) => col.key === 'financialYear') + 1;
  const plasticCol = columns.findIndex((col) => col.key === 'plasticType') + 1;
  applySimpExcelListValidation(
    sheet,
    fyCol,
    excelFinancialYearDropdownValues(),
    lastRow,
    'Choose Financial Year from the dropdown.',
  );
  applySimpExcelListValidation(
    sheet,
    plasticCol,
    SIMP_PLASTIC_TYPES,
    lastRow,
    'Choose Type Of Plastic Raw Material from the dropdown.',
  );
  if (extraLists.registrationType?.length) {
    const col = columns.findIndex((item) => item.key === 'registrationType') + 1;
    applySimpExcelListValidation(
      sheet,
      col,
      extraLists.registrationType,
      lastRow,
      'Choose Registration Type from the dropdown.',
    );
  }
  if (extraLists.entityType?.length) {
    const col = columns.findIndex((item) => item.key === 'entityType') + 1;
    applySimpExcelListValidation(
      sheet,
      col,
      extraLists.entityType,
      lastRow,
      'Choose Entity Type from the dropdown.',
    );
  }
  applyYmdTextColumn(sheet, columns, lastRow);
}

/**
 * Creates an Excel workbook buffer for Import Details.
 *
 * @param {Array<object>} records
 * @returns {Promise<Buffer>}
 */
export async function generateSimpImportDetailsExcelBuffer(records = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SIMP_IMPORT_EXCEL_SHEET_NAME);

  sheet.columns = SIMP_IMPORT_DETAILS_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F4F8' },
  };

  for (const r of records) {
    const qty = importRowQuantity(r);
    sheet.addRow({
      entityName: String(r.entityName || r.entity_name || r.name || '').trim(),
      country: defaultSimpCountry(r.country || r.origin_country),
      address: String(r.address || r.supplier_address || '').trim(),
      contact: firstNonEmptySimpContact(r.contact, r.phone, r.mobile, r.mobile_number),
      financialYear: normalizeFinancialYearKey(r.financialYear || r.financial_year || r.fy || ''),
      plasticType: mapToSimpPlasticType(r.plasticType || r.plastic_type || r.resinType || ''),
      quantityTons: qty,
      importDate: formatSimpImportDate(r.importDate || r.import_date || r.invoice_date || '')
        || defaultSimpDateForFinancialYear(r.financialYear || r.financial_year),
    });
  }

  applySimpPartBExcelDropdowns(workbook, sheet, SIMP_IMPORT_DETAILS_COLUMNS, {}, records.length);
  return workbook.xlsx.writeBuffer();
}

/**
 * Creates an Excel workbook buffer for Producers/Sellers Supplied Details.
 *
 * @param {Array<object>} records
 * @returns {Promise<Buffer>}
 */
export async function generateSimpSupplyDetailsExcelBuffer(records = [], { fallbackContact = '' } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SIMP_SUPPLY_EXCEL_SHEET_NAME);

  sheet.columns = SIMP_SUPPLY_DETAILS_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F8ED' },
  };

  const prepared = prepareSimpSupplyRowsForPortal(records, { fallbackContact });
  for (const r of prepared) {
    const qty = importRowQuantity(r);
    const regType = /unreg/i.test(String(r.registrationType || r.registration_type || ''))
      ? 'UnRegistered'
      : 'Registered';

    sheet.addRow({
      registrationType: regType,
      entityType: String(r.entityType || r.entity_type || '').trim(),
      eprRegistrationNo: String(r.eprRegistrationNo || r.epr_registration_number || '').trim(),
      entityName: String(r.entityName || r.entity_name || r.name || '').trim(),
      address: String(r.address || r.buyer_address || '').trim(),
      contact: String(r.contact || '').trim(),
      financialYear: normalizeFinancialYearKey(r.financialYear || r.financial_year || r.fy || ''),
      plasticType: mapToSimpPlasticType(r.plasticType || r.plastic_type || r.resinType || ''),
      quantityTons: qty,
      salesDate: formatSimpImportDate(r.salesDate || r.sales_date || r.invoice_date || r.importDate || '')
        || defaultSimpDateForFinancialYear(r.financialYear || r.financial_year)
        || defaultSimpDateForFinancialYear(requiredSimpImportFinancialYears()[0]),
    });
  }

  applySimpPartBExcelDropdowns(workbook, sheet, SIMP_SUPPLY_DETAILS_COLUMNS, {
    registrationType: SIMP_SALES_EXCEL_REGISTRATION_TYPES,
    entityType: SIMP_SALES_ENTITY_TYPES,
  }, records.length);
  return workbook.xlsx.writeBuffer();
}

function excelCellText(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatSimpImportDate(value);
  if (typeof value === 'object') {
    if (value.text) return formatSimpImportDate(value.text);
    if (value.richText) return formatSimpImportDate(value.richText.map((part) => part.text || '').join(''));
    if (value.result != null) return String(value.result).trim();
    if (value.hyperlink) return String(value.text || value.hyperlink).trim();
  }
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) {
      const parsed = excelJsDateToIso(value);
      if (parsed) return parsed;
    }
    return String(value).trim();
  }
  return String(value).trim();
}

function excelJsDateToIso(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 20000) return '';
  const utc = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (Number.isNaN(utc.getTime())) return '';
  return formatSimpImportDate(utc.toISOString());
}

function normalizeExcelHeader(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mapImportHeaderToKey(header = '') {
  const h = normalizeExcelHeader(header);
  if (h === 'name' || h === 'nameofentity' || h === 'entityname') return 'entityName';
  if (h === 'country') return 'country';
  if (h === 'address') return 'address';
  if (h === 'contact' || h === 'mobile' || h === 'mobilenumber' || h === 'phone' || h === 'contactnumber') return 'contact';
  if (h === 'financialyear' || h === 'fy') return 'financialYear';
  if (h.includes('typeofplastic') || h === 'plastictype' || h === 'resintype') return 'plasticType';
  if (h.includes('quantity')) return 'quantityTons';
  if (h.includes('importdate') || (h === 'date' && !h.includes('financial'))) return 'importDate';
  return '';
}

function mapSupplyHeaderToKey(header = '') {
  const h = normalizeExcelHeader(header);
  if (h === 'registrationtype') return 'registrationType';
  if (h === 'entitytype') return 'entityType';
  if (h.includes('epr') || h.includes('registrationno')) return 'eprRegistrationNo';
  if (h === 'name' || h === 'nameofentity' || h === 'entityname') return 'entityName';
  if (h === 'country') return 'country';
  if (h === 'address') return 'address';
  if (h === 'contact' || h === 'mobile' || h === 'mobilenumber' || h === 'phone' || h === 'contactnumber') return 'contact';
  if (h === 'financialyear' || h === 'fy') return 'financialYear';
  if (h.includes('typeofplastic') || h === 'plastictype' || h === 'resintype') return 'plasticType';
  if (h.includes('quantity')) return 'quantityTons';
  if (h.includes('salesdate') || h.includes('importdate') || h === 'date') return 'salesDate';
  return '';
}

async function loadWorkbookSheet(buffer, preferredName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet(preferredName)
    || workbook.worksheets.find((sheet) => sheet.rowCount > 0)
    || workbook.worksheets[0];
}

function parseSheetRows(sheet, mapHeader, makeRow) {
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const keyByCol = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = mapHeader(excelCellText(cell));
    if (key) keyByCol[colNumber] = key;
  });
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const mapped = {};
    row.eachCell((cell, colNumber) => {
      const key = keyByCol[colNumber];
      if (!key) return;
      mapped[key] = excelCellText(cell);
    });
    const hasValue = Object.values(mapped).some((value) => String(value || '').trim());
    if (!hasValue) return;
    rows.push(makeRow(mapped));
  });
  return rows;
}

export async function parseSimpImportDetailsExcelBuffer(buffer) {
  const sheet = await loadWorkbookSheet(buffer, SIMP_IMPORT_EXCEL_SHEET_NAME);
  return parseSheetRows(sheet, mapImportHeaderToKey, (mapped) => {
    const qty = mapped.quantityTons || '';
    const row = emptySimpImportRow();
    row.entityName = mapped.entityName || '';
    row.country = mapped.country || '';
    row.address = mapped.address || '';
    row.contact = mapped.contact || '';
    row.financialYear = normalizeFinancialYearKey(mapped.financialYear || '');
    row.plasticType = mapToSimpPlasticType(mapped.plasticType || '');
    row.quantityTons = qty;
    row.quantityTpa = qty;
    row.importDate = formatSimpImportDate(mapped.importDate || '');
    return row;
  });
}

export async function parseSimpSupplyDetailsExcelBuffer(buffer) {
  const sheet = await loadWorkbookSheet(buffer, SIMP_SUPPLY_EXCEL_SHEET_NAME);
  return parseSheetRows(sheet, mapSupplyHeaderToKey, (mapped) => {
    const qty = mapped.quantityTons || mapped.quantityTpa || '';
    const row = emptySimpSupplyRow();
    row.registrationType = /unreg/i.test(mapped.registrationType || '') ? 'Unregistered' : 'Registered';
    row.entityType = String(mapped.entityType || '').trim();
    row.eprRegistrationNo = String(mapped.eprRegistrationNo || '').trim();
    row.entityName = mapped.entityName || '';
    row.country = defaultSimpCountry(mapped.country);
    row.address = mapped.address || '';
    row.contact = mapped.contact || '';
    row.financialYear = normalizeFinancialYearKey(mapped.financialYear || '');
    row.plasticType = mapToSimpPlasticType(mapped.plasticType || '');
    row.quantityTons = qty;
    row.quantityTpa = qty;
    row.salesDate = formatSimpImportDate(mapped.salesDate || '');
    return row;
  });
}
