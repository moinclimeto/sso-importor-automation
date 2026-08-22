import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {
  PURCHASE_ENTITY_TYPES,
  REGISTRATION_TYPE_OPTIONS,
  normalizeEntityType,
  normalizeGstin,
  normalizeRegistrationType,
} from '../../shared/entityRegistrationTypes.js';

export const SUPPLIER_COMPANY_NAME_COLUMN = 'Supplier/Customer Company Name';

export const SUPPLIER_EXCEL_HEADERS = [
  'Company',
  'GST Number',
  SUPPLIER_COMPANY_NAME_COLUMN,
  'Legal Name',
  'Entity Type',
  'Registration Type',
  'Address',
  'Mobile',
];

const HEADER_ALIASES = {
  company: 'company',
  company_name: 'company',
  gst_number: 'gst_number',
  gst: 'gst_number',
  gstin: 'gst_number',
  extracted_company_name: 'trade_name',
  supplier_customer_company_name: 'trade_name',
  suppliercustomer_company_name: 'trade_name',
  trade_name: 'trade_name',
  name: 'trade_name',
  legal_name: 'legal_name',
  entity_type: 'entity_type',
  registration: 'registration_type',
  registration_type: 'registration_type',
  address: 'address',
  mobile: 'mobile',
  mobile_number: 'mobile',
};

const ENTITY_TYPE_COUNT = PURCHASE_ENTITY_TYPES.length;
const REGISTRATION_TYPE_COUNT = REGISTRATION_TYPE_OPTIONS.length;

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/%/g, 'percent')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function resolveCompanyId(raw, companies) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const byId = companies.find((c) => String(c.id) === value);
    if (byId) return byId.id;
  }
  const gst = normalizeGstin(value);
  if (gst.length === 15) {
    const byGst = companies.find((c) => normalizeGstin(c.gstin) === gst);
    if (byGst) return byGst.id;
  }
  const lower = value.toLowerCase();
  const byName = companies.find((c) => String(c.name || '').trim().toLowerCase() === lower);
  return byName?.id ?? null;
}

function mapSupplierRow(mapped, rowNum, companies, errors) {
  const companyRaw = mapped.company ?? mapped.company_name ?? '';
  const companyId = resolveCompanyId(companyRaw, companies);
  const gstNumber = normalizeGstin(mapped.gst_number ?? mapped.gst ?? mapped.gstin);
  const tradeName = String(
    mapped.trade_name
    ?? mapped.extracted_company_name
    ?? mapped.supplier_customer_company_name
    ?? '',
  ).trim();
  const legalName = String(mapped.legal_name ?? '').trim();
  const entityType = normalizeEntityType(mapped.entity_type);
  const registrationType = normalizeRegistrationType(mapped.registration_type ?? mapped.registration) || 'Unregistered';
  const address = String(mapped.address ?? '').trim();
  const mobile = String(mapped.mobile ?? mapped.mobile_number ?? '').trim();

  if (!companyRaw) {
    errors.push(`Row ${rowNum}: Company is required`);
    return null;
  }
  if (!companyId) {
    errors.push(`Row ${rowNum}: Company "${companyRaw}" not found`);
    return null;
  }
  if (gstNumber.length !== 15) {
    errors.push(`Row ${rowNum}: GST Number must be 15 characters`);
    return null;
  }
  if (!tradeName) {
    errors.push(`Row ${rowNum}: ${SUPPLIER_COMPANY_NAME_COLUMN} is required`);
    return null;
  }
  if (mapped.entity_type && !entityType) {
    errors.push(`Row ${rowNum}: Invalid Entity Type "${mapped.entity_type}"`);
    return null;
  }

  return {
    company_id: companyId,
    gst_number: gstNumber,
    trade_name: tradeName,
    legal_name: legalName,
    entity_type: entityType,
    registration_type: registrationType,
    address,
    mobile,
    source: 'excel_import',
  };
}

function rowToSheetObject(row) {
  return {
    Company: row.Company ?? '',
    'GST Number': row['GST Number'] ?? '',
    [SUPPLIER_COMPANY_NAME_COLUMN]: row[SUPPLIER_COMPANY_NAME_COLUMN] ?? '',
    'Legal Name': row['Legal Name'] ?? '',
    'Entity Type': row['Entity Type'] ?? '',
    'Registration Type': row['Registration Type'] ?? '',
    Address: row.Address ?? '',
    Mobile: row.Mobile ?? '',
  };
}

async function buildSupplierWorkbook(dataRows = []) {
  const wb = new ExcelJS.Workbook();
  const lookups = wb.addWorksheet('Lookups');
  lookups.getCell('A1').value = 'Entity Type';
  PURCHASE_ENTITY_TYPES.forEach((type, idx) => {
    lookups.getCell(`A${idx + 2}`).value = type;
  });
  lookups.getCell('B1').value = 'Registration Type';
  REGISTRATION_TYPE_OPTIONS.forEach((type, idx) => {
    lookups.getCell(`B${idx + 2}`).value = type;
  });
  lookups.state = 'veryHidden';

  const ws = wb.addWorksheet('Suppliers');
  ws.addRow(SUPPLIER_EXCEL_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  dataRows.forEach((row) => {
    ws.addRow(SUPPLIER_EXCEL_HEADERS.map((header) => row[header] ?? ''));
  });

  SUPPLIER_EXCEL_HEADERS.forEach((header, idx) => {
    ws.getColumn(idx + 1).width = Math.min(42, Math.max(16, header.length + 4));
  });

  const lastRow = Math.max(dataRows.length + 1, 500);
  ws.dataValidations.add(`E2:E${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`Lookups!$A$2:$A$${ENTITY_TYPE_COUNT + 1}`],
    showErrorMessage: true,
    errorTitle: 'Invalid Entity Type',
    error: 'Choose a value from the dropdown list.',
  });
  ws.dataValidations.add(`F2:F${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`Lookups!$B$2:$B$${REGISTRATION_TYPE_COUNT + 1}`],
    showErrorMessage: true,
    errorTitle: 'Invalid Registration Type',
    error: 'Choose Registered or Unregistered.',
  });

  return wb;
}

export async function downloadSupplierMasterTemplate(companies = []) {
  const sampleCompany = companies[0]?.name || 'Your Company Name';
  const wb = await buildSupplierWorkbook([
    rowToSheetObject({
      Company: sampleCompany,
      'GST Number': '33AAAAA0000A1Z5',
      [SUPPLIER_COMPANY_NAME_COLUMN]: 'Example Supplier Pvt Ltd',
      'Legal Name': 'Example Supplier Private Limited',
      'Entity Type': 'Producer',
      'Registration Type': 'Registered',
      Address: '123 Industrial Area, Chennai',
      Mobile: '9876543210',
    }),
  ]);
  const buffer = await wb.xlsx.writeBuffer();
  saveExcelBuffer(buffer, 'supplier_master_template.xlsx');
}

export async function exportSupplierMasterExcel(records = [], companies = []) {
  const companyName = (id) => companies.find((c) => Number(c.id) === Number(id))?.name || String(id);
  const rows = records.map((r) => rowToSheetObject({
    Company: companyName(r.company_id),
    'GST Number': r.gst_number || '',
    [SUPPLIER_COMPANY_NAME_COLUMN]: r.trade_name || '',
    'Legal Name': r.legal_name || '',
    'Entity Type': r.entity_type || '',
    'Registration Type': r.registration_type || '',
    Address: r.address || '',
    Mobile: r.mobile || '',
  }));
  const wb = await buildSupplierWorkbook(rows);
  const buffer = await wb.xlsx.writeBuffer();
  saveExcelBuffer(buffer, 'supplier_master_export.xlsx');
}

function saveExcelBuffer(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseSupplierMasterExcel(file, companies = []) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames.find((name) => name.toLowerCase() === 'suppliers') || wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

        if (!rawRows.length) {
          reject(new Error('Excel file has no data rows.'));
          return;
        }

        const rows = [];
        const errors = [];

        rawRows.forEach((raw, idx) => {
          const rowNum = idx + 2;
          const mapped = {};
          for (const [key, value] of Object.entries(raw)) {
            const normalized = normalizeHeader(key);
            const field = HEADER_ALIASES[normalized] || normalized;
            mapped[field] = value;
          }
          const record = mapSupplierRow(mapped, rowNum, companies, errors);
          if (record) rows.push(record);
        });

        if (!rows.length && errors.length) {
          reject(new Error(errors.slice(0, 8).join('\n')));
          return;
        }
        if (!rows.length) {
          reject(new Error('No valid supplier rows found in Excel.'));
          return;
        }

        resolve({ rows, errors });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read Excel file'));
    reader.readAsArrayBuffer(file);
  });
}
