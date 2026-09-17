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

export const SIMP_PLASTIC_TYPES = [
  'HDPE',
  'PET',
  'PP',
  'PS',
  'LDPE',
  'LLDPE',
  'PLA',
  'PBAT',
  'PBS',
  'MLP',
  'PE',
  'PVC',
  'PMMA',
  'EPS',
  'Others',
];

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
  const exact = SIMP_PLASTIC_TYPES.find((t) => normalizePlasticTypeKey(t) === compact);
  if (exact) return exact;
  const partial = SIMP_PLASTIC_TYPES.find((t) => compact.includes(normalizePlasticTypeKey(t)));
  return partial || 'Others';
}

export function formatSimpImportDate(value = '') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export function resolveSimpSupplyContact(sale = {}, supplierMaster = []) {
  const extraction = parseNestedObject(sale.extraction);
  const sourceFields = parseNestedObject(sale._source_fields);
  const candidates = [
    sale.mobile_number,
    sale.contact,
    sale.phone,
    sale.mobile,
    extraction.mobile_number,
    extraction.mobile,
    extraction.phone,
    extraction.buyer_mobile,
    sourceFields.mobile_number,
    sourceFields.mobile,
  ];
  for (const value of candidates) {
    if (String(value || '').replace(/\s+/g, '').trim()) return String(value).trim();
  }
  const fromMaster = findSimpPartyMaster(sale, supplierMaster);
  return String(fromMaster?.mobile || fromMaster?.mobile_number || '').trim();
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
        country: String(purchase.country || purchase.origin_country || purchase.supplier_country || '').trim(),
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

const SIMP_EXCEL_DROPDOWN_LAST_ROW = 500;

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

function addLookupColumn(sheet, colIndex, heading, values = []) {
  sheet.getCell(1, colIndex).value = heading;
  values.forEach((value, i) => {
    sheet.getCell(i + 2, colIndex).value = value;
  });
  const letter = excelColumnLetter(colIndex);
  const last = Math.max(values.length, 1) + 1;
  return `Lookups!$${letter}$2:$${letter}$${last}`;
}

function applySimpExcelListValidation(sheet, colIndex, lookupRef, prompt) {
  if (!colIndex) return;
  const letter = excelColumnLetter(colIndex);
  sheet.dataValidations.add(`${letter}2:${letter}${SIMP_EXCEL_DROPDOWN_LAST_ROW}`, {
    type: 'list',
    allowBlank: true,
    formulae: [lookupRef],
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Select from list',
    error: prompt,
    showInputMessage: true,
    promptTitle: 'Select',
    prompt,
  });
}

function applySimpPartBExcelDropdowns(workbook, sheet, columns = [], extraLists = {}) {
  let lookups = workbook.getWorksheet('Lookups');
  if (!lookups) {
    lookups = workbook.addWorksheet('Lookups');
    lookups.state = 'hidden';
  }

  const fyRef = addLookupColumn(lookups, 1, 'Financial Year', excelFinancialYearDropdownValues());
  const plasticRef = addLookupColumn(lookups, 2, 'Type Of Plastic Raw Material', SIMP_PLASTIC_TYPES);
  const fyCol = columns.findIndex((col) => col.key === 'financialYear') + 1;
  const plasticCol = columns.findIndex((col) => col.key === 'plasticType') + 1;
  applySimpExcelListValidation(sheet, fyCol, fyRef, 'Choose Financial Year from the dropdown.');
  applySimpExcelListValidation(sheet, plasticCol, plasticRef, 'Choose Type Of Plastic Raw Material from the dropdown.');

  if (extraLists.registrationType?.length) {
    const ref = addLookupColumn(lookups, 3, 'Registration Type', extraLists.registrationType);
    const col = columns.findIndex((item) => item.key === 'registrationType') + 1;
    applySimpExcelListValidation(sheet, col, ref, 'Choose Registration Type from the dropdown.');
  }
  if (extraLists.entityType?.length) {
    const ref = addLookupColumn(lookups, 4, 'Entity Type', extraLists.entityType);
    const col = columns.findIndex((item) => item.key === 'entityType') + 1;
    applySimpExcelListValidation(sheet, col, ref, 'Choose Entity Type from the dropdown.');
  }
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
      country: String(r.country || r.origin_country || '').trim(),
      address: String(r.address || r.supplier_address || '').trim(),
      contact: String(r.contact || r.phone || r.mobile || '').trim(),
      financialYear: normalizeFinancialYearKey(r.financialYear || r.financial_year || r.fy || ''),
      plasticType: mapToSimpPlasticType(r.plasticType || r.plastic_type || r.resinType || ''),
      quantityTons: qty,
      importDate: formatSimpImportDate(r.importDate || r.import_date || r.invoice_date || ''),
    });
  }

  applySimpPartBExcelDropdowns(workbook, sheet, SIMP_IMPORT_DETAILS_COLUMNS);
  return workbook.xlsx.writeBuffer();
}

/**
 * Creates an Excel workbook buffer for Producers/Sellers Supplied Details.
 *
 * @param {Array<object>} records
 * @returns {Promise<Buffer>}
 */
export async function generateSimpSupplyDetailsExcelBuffer(records = []) {
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

  for (const r of records) {
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
      contact: String(r.contact || r.phone || r.mobile || '').trim(),
      financialYear: normalizeFinancialYearKey(r.financialYear || r.financial_year || r.fy || ''),
      plasticType: mapToSimpPlasticType(r.plasticType || r.plastic_type || r.resinType || ''),
      quantityTons: qty,
      salesDate: formatSimpImportDate(r.salesDate || r.sales_date || r.invoice_date || ''),
    });
  }

  applySimpPartBExcelDropdowns(workbook, sheet, SIMP_SUPPLY_DETAILS_COLUMNS, {
    registrationType: SIMP_SALES_EXCEL_REGISTRATION_TYPES,
    entityType: SIMP_SALES_ENTITY_TYPES,
  });
  return workbook.xlsx.writeBuffer();
}

function excelCellText(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatSimpImportDate(value);
  if (typeof value === 'object') {
    if (value.text) return String(value.text).trim();
    if (value.richText) return value.richText.map((part) => part.text || '').join('').trim();
    if (value.result != null) return String(value.result).trim();
    if (value.hyperlink) return String(value.text || value.hyperlink).trim();
  }
  if (typeof value === 'number' && cell.numFmt && /yy/i.test(String(cell.numFmt))) {
    const parsed = excelJsDateToIso(value);
    if (parsed) return parsed;
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
  if (h === 'contact' || h === 'mobile' || h === 'mobilenumber' || h === 'phone') return 'contact';
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
  if (h === 'address') return 'address';
  if (h === 'contact' || h === 'mobile' || h === 'mobilenumber' || h === 'phone') return 'contact';
  if (h === 'financialyear' || h === 'fy') return 'financialYear';
  if (h.includes('typeofplastic') || h === 'plastictype' || h === 'resintype') return 'plasticType';
  if (h.includes('quantity')) return 'quantityTons';
  if (h.includes('salesdate') || h === 'date') return 'salesDate';
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
