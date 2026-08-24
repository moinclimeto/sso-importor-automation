import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { PLASTIC_CATEGORIES } from '../../shared/plasticCategories.js';

export const PACKAGING_MATERIALS = ['PET', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS', 'MLP', 'Others'];

export const PACKAGING_EXCEL_HEADERS = [
  'Record ID',
  'Company',
  'List Type',
  'Product Description',
  'HSN',
  'UOM',
  'Party GST',
  'Party Name',
  'Plastic Category',
  'Plastic Material',
  'Conversion Factor (kg per unit)',
  'Recycled %',
];

const HEADER_ALIASES = {
  record_id: 'id',
  id: 'id',
  company: 'company',
  company_name: 'company',
  list_type: 'list_type',
  listtype: 'list_type',
  product_description: 'product_description',
  description: 'product_description',
  product: 'product_description',
  hsn: 'hsn',
  hsn_code: 'hsn',
  uom: 'uom',
  unit: 'uom',
  party_gst: 'supplier_gst',
  supplier_gst: 'supplier_gst',
  customer_gst: 'supplier_gst',
  party_name: 'supplier_name',
  supplier_name: 'supplier_name',
  customer_name: 'supplier_name',
  plastic_category: 'plastic_category',
  category: 'plastic_category',
  category_of_plastic: 'plastic_category',
  plastic_material: 'plastic_material',
  material: 'plastic_material',
  plastic_type: 'plastic_material',
  conversion_factor_kg_per_unit: 'conversion_factor',
  conversion_factor: 'conversion_factor',
  cf: 'conversion_factor',
  recycled_percent: 'recycled_percent',
  recycled: 'recycled_percent',
};

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/%/g, 'percent')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeListType(value, fallback = 'sales') {
  const lt = String(value || fallback).trim().toLowerCase();
  if (lt === 'sales') return 'sales';
  if (lt === 'purchase' || lt === 'gpl') return 'purchase';
  return fallback;
}

function parseNum(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(String(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function resolveCompanyId(raw, companies) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const byId = companies.find((c) => String(c.id) === value);
    if (byId) return byId.id;
  }
  const lower = value.toLowerCase();
  const byName = companies.find((c) => String(c.name || '').trim().toLowerCase() === lower);
  return byName?.id ?? null;
}

function rowToSheetObject(row, companies = []) {
  const companyName = (id) => companies.find((c) => Number(c.id) === Number(id))?.name || String(id || '');
  return {
    'Record ID': row.id ?? '',
    Company: row.Company ?? companyName(row.company_id),
    'List Type': row.list_type === 'purchase' ? 'purchase' : (row.list_type || 'sales'),
    'Product Description': row.product_description || '',
    HSN: row.hsn || '',
    UOM: row.uom || '',
    'Party GST': row.supplier_gst || '',
    'Party Name': row.supplier_name || '',
    'Plastic Category': row.plastic_category || '',
    'Plastic Material': row.plastic_material || '',
    'Conversion Factor (kg per unit)': row.conversion_factor ?? '',
    'Recycled %': row.recycled_percent ?? '',
  };
}

async function buildPackagingWorkbook(dataRows = []) {
  const wb = new ExcelJS.Workbook();
  const lookups = wb.addWorksheet('Lookups');
  lookups.getCell('A1').value = 'Plastic Category';
  PLASTIC_CATEGORIES.forEach((cat, idx) => {
    lookups.getCell(`A${idx + 2}`).value = cat;
  });
  lookups.getCell('B1').value = 'Plastic Material';
  PACKAGING_MATERIALS.forEach((mat, idx) => {
    lookups.getCell(`B${idx + 2}`).value = mat;
  });
  lookups.getCell('C1').value = 'List Type';
  ['sales', 'purchase'].forEach((type, idx) => {
    lookups.getCell(`C${idx + 2}`).value = type;
  });
  lookups.state = 'veryHidden';

  const ws = wb.addWorksheet('Packaging');
  ws.addRow(PACKAGING_EXCEL_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  dataRows.forEach((row) => {
    ws.addRow(PACKAGING_EXCEL_HEADERS.map((header) => row[header] ?? ''));
  });

  PACKAGING_EXCEL_HEADERS.forEach((header, idx) => {
    ws.getColumn(idx + 1).width = Math.min(44, Math.max(14, header.length + 2));
  });

  const lastRow = Math.max(dataRows.length + 1, 500);
  const col = (header) => {
    const idx = PACKAGING_EXCEL_HEADERS.indexOf(header);
    if (idx < 0) return null;
    return String.fromCharCode(65 + idx);
  };
  const listTypeCol = col('List Type');
  const categoryCol = col('Plastic Category');
  const materialCol = col('Plastic Material');

  if (listTypeCol) {
    ws.dataValidations.add(`${listTypeCol}2:${listTypeCol}${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: ['Lookups!$C$2:$C$3'],
      showErrorMessage: true,
      errorTitle: 'Invalid List Type',
      error: 'Use sales or purchase.',
    });
  }
  if (categoryCol) {
    ws.dataValidations.add(`${categoryCol}2:${categoryCol}${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`Lookups!$A$2:$A$${PLASTIC_CATEGORIES.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Choose Cat-I … Cat-IV.',
    });
  }
  if (materialCol) {
    ws.dataValidations.add(`${materialCol}2:${materialCol}${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`Lookups!$B$2:$B$${PACKAGING_MATERIALS.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Material',
      error: 'Choose PET, HDPE, PVC, LDPE, PP, PS, MLP, or Others.',
    });
  }

  return wb;
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

export async function downloadPackagingMasterTemplate(companies = [], listType = 'sales') {
  const sampleCompany = companies[0]?.name || 'Your Company Name';
  const wb = await buildPackagingWorkbook([
    rowToSheetObject({
      company_id: companies[0]?.id,
      Company: sampleCompany,
      list_type: listType,
      product_description: 'PVC Cling Film 30 micron',
      hsn: '39204300',
      uom: 'Box',
      supplier_gst: '',
      supplier_name: listType === 'sales' ? 'Example Customer Pvt Ltd' : 'Example Supplier Pvt Ltd',
      plastic_category: 'Cat-III',
      plastic_material: 'PVC',
      conversion_factor: 0.05,
      recycled_percent: '',
    }),
  ]);
  const buffer = await wb.xlsx.writeBuffer();
  saveExcelBuffer(buffer, `${listType}_packaging_template.xlsx`);
}

export async function exportPackagingMasterExcel(records = [], companies = [], listType = 'sales') {
  const rows = records.map((r) => rowToSheetObject(r, companies));
  const wb = await buildPackagingWorkbook(rows);
  const buffer = await wb.xlsx.writeBuffer();
  saveExcelBuffer(buffer, `${listType}_packaging_export.xlsx`);
}

function mapPackagingRow(mapped, rowNum, companies, errors, defaultListType) {
  const companyRaw = mapped.company ?? mapped.company_name ?? '';
  const companyId = resolveCompanyId(companyRaw, companies);
  const productDescription = String(mapped.product_description ?? '').trim();
  const listType = normalizeListType(mapped.list_type, defaultListType);
  const idRaw = mapped.id ?? mapped.record_id;
  const id = idRaw !== '' && idRaw != null ? Number(idRaw) : null;

  if (!companyRaw) {
    errors.push(`Row ${rowNum}: Company is required`);
    return null;
  }
  if (!companyId) {
    errors.push(`Row ${rowNum}: Company "${companyRaw}" not found`);
    return null;
  }
  if (!productDescription && !id) {
    errors.push(`Row ${rowNum}: Product Description is required`);
    return null;
  }

  const cf = parseNum(mapped.conversion_factor);
  const record = {
    company_id: companyId,
    list_type: listType,
    product_description: productDescription,
    hsn: String(mapped.hsn ?? '').trim(),
    uom: String(mapped.uom ?? '').trim(),
    supplier_gst: String(mapped.supplier_gst ?? '').trim(),
    supplier_name: String(mapped.supplier_name ?? '').trim(),
    plastic_category: String(mapped.plastic_category ?? '').trim(),
    plastic_material: String(mapped.plastic_material ?? '').trim(),
    conversion_factor: cf,
    recycled_percent: String(mapped.recycled_percent ?? '').trim(),
    source: 'excel_import',
  };

  if (id && Number.isFinite(id)) {
    record.id = id;
  }

  return record;
}

export function parsePackagingMasterExcel(file, companies = [], { defaultListType = 'sales' } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames.find((name) => name.toLowerCase() === 'packaging') || wb.SheetNames[0];
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
          const record = mapPackagingRow(mapped, rowNum, companies, errors, defaultListType);
          if (record) rows.push(record);
        });

        if (!rows.length && errors.length) {
          reject(new Error(errors.slice(0, 8).join('\n')));
          return;
        }
        if (!rows.length) {
          reject(new Error('No valid packaging rows found in Excel.'));
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
