import * as XLSX from 'xlsx';
export { PLASTIC_CATEGORIES, normalizePlasticCategory } from '../../shared/plasticCategories.js';
import { PLASTIC_CATEGORIES, normalizePlasticCategory } from '../../shared/plasticCategories.js';
import { resolveRecordTotalMt } from '../../shared/procurementConversionFactor.js';

/** Exact Excel column labels for Procurement (Purchases) */
export const PURCHASE_EXCEL_HEADERS = [
  'Registration Type',
  'Entity Type',
  'GST Number',
  'Company Name',
  'Legal Name',
  'Trade Name',
  'Country',
  'Address',
  'Mobile Number',
  'Item Description',
  'HSN/SAC',
  'UOM',
  'Quantity',
  'Rate',
  'Taxable Amount',
  'Plastic Material Type',
  'Category Of Plastic',
  'Financial Year',
  'Date',
  'Total Plastic Quantity (Ton)',
  'Recycled Plastic %',
  'Invoice Filename',
];

export const PURCHASE_TABLE_COLUMNS = [
  { key: 'registration_type', label: 'Registration Type' },
  { key: 'entity_type', label: 'Entity Type' },
  { key: 'supplier_gst_number', label: 'GST Number' },
  { key: 'supplier_name', label: 'Company Name' },
  { key: 'legal_name', label: 'Legal Name' },
  { key: 'trade_name', label: 'Trade Name' },
  { key: 'country', label: 'Country' },
  { key: 'address_line_1', label: 'Address' },
  { key: 'supplier_mobile_number', label: 'Mobile Number' },
  { key: 'item_name', label: 'Item Description' },
  { key: 'hsn', label: 'HSN/SAC' },
  { key: 'unit', label: 'UOM' },
  { key: 'invoice_quantity', label: 'Quantity' },
  { key: 'rate', label: 'Rate' },
  { key: 'total_amount', label: 'Taxable Amount' },
  { key: 'plastic_type', label: 'Plastic Material Type' },
  { key: 'category_of_plastic', label: 'Category Of Plastic' },
  { key: 'financial_year', label: 'Financial Year' },
  { key: 'procurement_date', label: 'Date' },
  { key: 'quantity_mt', label: 'Total Plastic Quantity (Ton)' },
  { key: 'recycled_plastic_percent', label: 'Recycled Plastic %' },
  { key: 'invoice_filename', label: 'Invoice Filename' },
];

const PURCHASE_HEADER_TO_KEY = {
  registration_type: 'registration_type',
  entity_type: 'entity_type',
  gst_number: 'supplier_gst_number',
  company_name: 'supplier_name',
  name_of_the_entity: 'supplier_name',
  legal_name: 'legal_name',
  trade_name: 'trade_name',
  country: 'country',
  address: 'address_line_1',
  mobile_number: 'supplier_mobile_number',
  item_description: 'item_name',
  hsn_sac: 'hsn',
  hsn: 'hsn',
  uom: 'unit',
  quantity: 'invoice_quantity',
  rate: 'rate',
  taxable_amount: 'total_amount',
  plastic_material_type: 'plastic_type',
  category_of_plastic: 'category_of_plastic',
  financial_year: 'financial_year',
  date: 'procurement_date',
  total_plastic_quantity_ton: 'quantity_mt',
  recycled_plastic_percent: 'recycled_plastic_percent',
  invoice_filename: 'invoice_filename',
};

/** Exact Excel column labels for Post Consumer (Sales) */
export const SALE_EXCEL_HEADERS = [
  'Category of Plastic',
  'Product Type',
  'Item Description',
  'HSN/SAC',
  'UOM',
  'Quantity',
  'Rate',
  'Amount',
  'Quantity Sold (MT)',
  'Company Name',
  'Legal Name',
  'Trade Name',
  'Address',
  'State',
  'District',
  'Account Number',
  'IFSC Code',
  'GST & Other Charges',
  'Invoice File Name',
  'Application Number',
  'Invoice Date',
];

export const SALE_TABLE_COLUMNS = [
  { key: 'category_of_plastic', label: 'Category of Plastic' },
  { key: 'item_name', label: 'Item Description' },
  { key: 'hsn', label: 'HSN/SAC' },
  { key: 'unit', label: 'UOM' },
  { key: 'invoice_quantity', label: 'Quantity' },
  { key: 'rate', label: 'Rate' },
  { key: 'total_amount', label: 'Amount' },
  { key: 'quantity_sold_mt', label: 'Quantity Sold (MT)' },
  { key: 'entity_name', label: 'Company Name' },
  { key: 'legal_name', label: 'Legal Name' },
  { key: 'trade_name', label: 'Trade Name' },
  { key: 'address', label: 'Address' },
  { key: 'state', label: 'State' },
  { key: 'district', label: 'District' },
  { key: 'account_number', label: 'Account Number' },
  { key: 'ifsc_code', label: 'IFSC Code' },
  { key: 'gst_other_charges', label: 'GST & Other Charges' },
  { key: 'invoice_file_name', label: 'Invoice File Name' },
  { key: 'application_number', label: 'Application Number' },
  { key: 'invoice_date', label: 'Invoice Date' },
];

const SALE_HEADER_TO_KEY = {
  sno: 's_no',
  s_no: 's_no',
  s_no_: 's_no',
  category_of_plastic: 'category_of_plastic',
  process_code: 'process_code',
  plastic_type: 'plastic_type',
  product_type: 'product_type',
  of_recycled_plastic_in_product: 'recycled_plastic_percent',
  recycled_plastic_percent: 'recycled_plastic_percent',
  percent_of_recycled_plastic_in_product: 'recycled_plastic_percent',
  conversion_factor: 'conversion_factor',
  available_quantity_mt: 'available_quantity_mt',
  available_quantity: 'available_quantity_mt',
  quantity_sold_mt: 'quantity_sold_mt',
  quantity_sold: 'quantity_sold_mt',
  registration_type: 'registration_type',
  company_name: 'entity_name',
  name_of_the_entity: 'entity_name',
  entity_name: 'entity_name',
  legal_name: 'legal_name',
  trade_name: 'trade_name',
  address: 'address',
  state: 'state',
  district: 'district',
  account_number: 'account_number',
  ifsc_code: 'ifsc_code',
  gst_other_charges: 'gst_other_charges',
  invoice_file_name: 'invoice_file_name',
  invoice_file_name_shall_exactly_match_the_name_of_pdf_uploaded_in_zip_folder: 'invoice_file_name',
  application_number: 'application_number',
  invoice_date: 'invoice_date',
  item_description: 'item_name',
  hsn_sac: 'hsn',
  hsn: 'hsn',
  uom: 'unit',
  quantity: 'invoice_quantity',
  rate: 'rate',
  amount: 'total_amount',
};

const PURCHASE_SAMPLE = {
  'Registration Type': 'Producer',
  'Entity Type': 'Brand',
  'GST Number': '06AABCG1111H1Z8',
  'Company Name': 'Green Plastics India',
  'Legal Name': 'Green Plastics India Pvt Ltd',
  'Trade Name': 'Green Plastics',
  'Country': 'India',
  'Address': 'Plot 12, MIDC, Gurugram, Haryana',
  'Mobile Number': '9876543210',
  'Item Description': 'Plastic Scrap',
  'HSN/SAC': '3915',
  'UOM': 'MT',
  'Quantity': 12,
  'Rate': 25000,
  'Taxable Amount': 300000,
  'Plastic Material Type': 'HDPE',
  'Category Of Plastic': 'Cat-I',
  'Financial Year': '2024-25',
  'Date': '2025-07-28',
  'Total Plastic Quantity (Ton)': 12,
  'Recycled Plastic %': 50,
  'Invoice Filename': 'invoice_PO_2025_001.pdf',
};

const SALE_SAMPLE = {
  'Category of Plastic': 'Cat-I',
  'Product Type': 'Granules',
  'Item Description': 'HDPE Granules Recycled',
  'HSN/SAC': '3901',
  'UOM': 'MT',
  'Quantity': 5,
  'Rate': 45000,
  'Amount': 225000,
  'Quantity Sold (MT)': 5,
  'Company Name': 'Eco Packaging Co',
  'Legal Name': 'Eco Packaging Private Limited',
  'Trade Name': 'Eco Packaging',
  'Address': '12 Industrial Area',
  'State': 'Maharashtra',
  'District': 'Pune',
  'Account Number': '1234567890',
  'IFSC Code': 'SBIN0001234',
  'GST & Other Charges': 9000,
  'Invoice File Name': 'invoice_SC_2025_001.pdf',
  'Application Number': 'APP-2025-001',
  'Invoice Date': '2025-07-30',
};

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/%/g, 'percent')
    // Keep unit/format tokens from parentheses (MT/Kg); drop Yes/No and date-format hints
    .replace(/\(([^)]*)\)/g, (_, inner) => {
      const token = String(inner)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      if (!token || token === 'yes_no' || token === 'yesno') return ' ';
      if (token === 'yyyy_mm_dd' || token === 'yyyymmdd') return ' ';
      return `_${token}`;
    })
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function excelDateToIso(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    const utc = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function mapSaleRow(mapped, rowNum, errors) {
  const get = (...keys) => {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      const field = SALE_HEADER_TO_KEY[nk] || nk;
      if (mapped[field] !== undefined && mapped[field] !== '') return mapped[field];
      if (mapped[nk] !== undefined && mapped[nk] !== '') return mapped[nk];
    }
    return '';
  };

  // Flatten raw mapped keys through SALE_HEADER_TO_KEY
  const flat = {};
  for (const [k, v] of Object.entries(mapped)) {
    const key = SALE_HEADER_TO_KEY[k] || k;
    if (flat[key] === undefined || flat[key] === '') flat[key] = v;
  }

  const entity_name = str(flat.entity_name || get('Name of the Entity'));
  const invoice_file_name = str(flat.invoice_file_name || get('Invoice File Name'));
  const application_number = str(flat.application_number || get('Application Number'));
  const quantity_sold_mt = num(flat.quantity_sold_mt || get('Quantity Sold (MT)'));
  const invoice_date = excelDateToIso(flat.invoice_date || get('Invoice Date'));

  if (!entity_name && !invoice_file_name && !application_number && !quantity_sold_mt) {
    return null; // blank row
  }

  if (!entity_name) {
    errors.push(`Row ${rowNum}: Name of the Entity is required`);
    return null;
  }
  if (!invoice_file_name) {
    errors.push(`Row ${rowNum}: Invoice File Name is required`);
    return null;
  }

  return {
    company_id: null,
    record_type: 'sale_epr',
    s_no: str(flat.s_no || get('S-No.')) || String(rowNum - 1),
    category_of_plastic: normalizePlasticCategory(flat.category_of_plastic || get('Category of Plastic')),
    process_code: str(flat.process_code || get('Process Code')),
    plastic_type: str(flat.plastic_type || get('Plastic Type')),
    product_type: str(flat.product_type || get('Product Type')),
    recycled_plastic_percent: num(flat.recycled_plastic_percent || get('(%) of Recycled Plastic in Product')),
    conversion_factor: num(flat.conversion_factor || get('Conversion Factor')),
    available_quantity_mt: num(flat.available_quantity_mt || get('Available Quantity (MT)')),
    quantity_sold_mt,
    registration_type: str(flat.registration_type || get('Registration type')),
    entity_name,
    address: str(flat.address || get('Address')),
    state: str(flat.state || get('State')),
    district: str(flat.district || get('District')),
    account_number: str(flat.account_number || get('Account Number')),
    ifsc_code: str(flat.ifsc_code || get('IFSC Code')),
    gst_other_charges: num(flat.gst_other_charges || get('GST & Other Charges')),
    invoice_file_name,
    application_number,
    invoice_date,
    doc_status: 'inbox',
    // Compat fields used elsewhere
    customer_name: entity_name,
    invoice_no: application_number || invoice_file_name,
    item_name: str(flat.product_type || flat.plastic_type || get('Product Type')),
    quantity: quantity_sold_mt,
    unit: 'MT',
    total_amount: num(flat.gst_other_charges || get('GST & Other Charges')),
  };
}

function mapPurchaseRow(mapped, rowNum, errors) {
  const flat = {};
  for (const [k, v] of Object.entries(mapped)) {
    const key = PURCHASE_HEADER_TO_KEY[k] || k;
    if (flat[key] === undefined || flat[key] === '') flat[key] = v;
  }

  const supplier_name = str(flat.supplier_name);
  const procurement_date = excelDateToIso(flat.procurement_date);
  const invoice_filename = str(flat.invoice_filename);
  const quantity_mt = num(flat.quantity_mt);

  if (!supplier_name && !invoice_filename && !quantity_mt) {
    return null;
  }

  if (!supplier_name) {
    errors.push(`Row ${rowNum}: Name Of The Entity is required`);
    return null;
  }
  if (!procurement_date) {
    errors.push(`Row ${rowNum}: Date is required (YYYY-MM-DD)`);
    return null;
  }
  if (!invoice_filename) {
    errors.push(`Row ${rowNum}: Invoice Filename is required`);
    return null;
  }

  const supplier_gst = str(flat.supplier_gst_number || flat.supplier_gst).toUpperCase();
  const is_gst = supplier_gst ? 'Yes' : 'No';

  return {
    company_id: null,
    record_type: 'purchase_epr',
    registration_type: str(flat.registration_type),
    entity_type: str(flat.entity_type),
    category_of_plastic: normalizePlasticCategory(flat.category_of_plastic),
    supplier_name,
    address_line_1: str(flat.address_line_1),
    supplier_mobile_number: str(flat.supplier_mobile_number),
    plastic_type: str(flat.plastic_type),
    country: str(flat.country),
    financial_year: str(flat.financial_year),
    is_supplier_gst_available: is_gst,
    supplier_gst_number: supplier_gst,
    quantity_mt,
    recycled_plastic_percent: num(flat.recycled_plastic_percent),
    procurement_date,
    invoice_filename,
    vendor_name: supplier_name,
    vendor_gstin: supplier_gst,
    invoice_no: invoice_filename,
    invoice_number: invoice_filename,
    invoice_date: procurement_date,
    item_name: str(flat.plastic_type) || normalizePlasticCategory(flat.category_of_plastic) || 'Plastic',
    quantity: quantity_mt,
    unit: 'MT',
    total_amount: 0,
    doc_status: 'inbox',
  };
}

export function downloadExcelTemplate(type) {
  const isPurchase = type !== 'sale';
  const wb = XLSX.utils.book_new();

  const lookupWs = XLSX.utils.aoa_to_sheet([
    ['Category of Plastic (use exactly)'],
    ...PLASTIC_CATEGORIES.map((c) => [c]),
  ]);
  lookupWs['!cols'] = [{ wch: 32 }];

  if (isPurchase) {
    const ws = XLSX.utils.aoa_to_sheet([PURCHASE_EXCEL_HEADERS]);
    ws['!cols'] = PURCHASE_EXCEL_HEADERS.map((h) => ({
      wch: Math.min(40, Math.max(16, h.length + 2)),
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Procurement');
    XLSX.utils.book_append_sheet(wb, lookupWs, 'Lookups');
    XLSX.writeFile(wb, 'procurement_template.xlsx');
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet([SALE_EXCEL_HEADERS]);
  ws['!cols'] = SALE_EXCEL_HEADERS.map((h) => ({
    wch: Math.min(36, Math.max(16, h.length + 2)),
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'PostConsumer');
  XLSX.utils.book_append_sheet(wb, lookupWs, 'Lookups');
  XLSX.writeFile(wb, 'post_consumer_template.xlsx');
}

export function parseExcelFile(file, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

        if (!rawRows.length) {
          reject(new Error('Excel file has no data rows.'));
          return;
        }

        const isPurchase = type !== 'sale';
        const rows = [];
        const errors = [];

        rawRows.forEach((raw, idx) => {
          const rowNum = idx + 2;
          const mapped = {};
          for (const [k, v] of Object.entries(raw)) {
            mapped[normalizeHeader(k)] = v;
          }

          const record = isPurchase
            ? mapPurchaseRow(mapped, rowNum, errors)
            : mapSaleRow(mapped, rowNum, errors);

          if (record) rows.push(record);
        });

        if (!rows.length && errors.length) {
          reject(new Error(errors.slice(0, 8).join('\n')));
          return;
        }
        if (!rows.length) {
          reject(new Error('No valid rows found in Excel.'));
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

export async function importExcelRows(type, rows) {
  if (!window.pwp) {
    throw new Error('Excel import needs the Electron app. Run with npm run electron:dev');
  }
  let saved = 0;
  let updated = 0;
  let duplicates = 0;

  const isSale = type === 'sale';
  const api = isSale ? window.pwp.sales : window.pwp.purchases;
  
  // Fetch existing records for matching
  const existingRecords = await api.getAll();

  for (const row of rows) {
    try {
      let match = null;

      if (isSale) {
        match = existingRecords.find(r => 
          (row.invoice_file_name && (r.invoice_file_name === row.invoice_file_name || r.invoice_no === row.invoice_file_name)) ||
          (row.application_number && r.application_number === row.application_number)
        );
      } else {
        match = existingRecords.find(r => 
          (row.invoice_filename && (r.invoice_filename === row.invoice_filename || r.invoice_no === row.invoice_filename)) ||
          (row.supplier_gst_number && row.invoice_number && (r.supplier_gst_number === row.supplier_gst_number || r.vendor_gstin === row.supplier_gst_number) && r.invoice_no === row.invoice_number)
        );
      }

      if (match) {
        await api.update({ ...row, id: match.id });
        updated += 1;
      } else {
        await api.add(row);
        saved += 1;
      }
    } catch (err) {
      if (/duplicate invoice/i.test(err?.message || '')) {
        duplicates += 1;
      } else {
        throw err;
      }
    }
  }
  return { saved, updated, duplicates };
}

export async function exportExcelData(type, rows) {
  const isPurchase = type !== 'sale';
  const wb = XLSX.utils.book_new();

  const sheetData = rows.flatMap(r => {
    const docType = isPurchase ? 'purchase' : 'sale';
    const resolvedMt = resolveRecordTotalMt(r, docType);
    let parsedLines = [];
    try {
      const raw = r.line_items || r.lineItems;
      parsedLines = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
    } catch(e) {}
    
    // Flatten line items
    const items = parsedLines.length > 0 ? parsedLines : [r];
      
    return items.map(item => {
      const mapped = {};
      const columns = isPurchase ? PURCHASE_TABLE_COLUMNS : SALE_TABLE_COLUMNS;
      
      for (const col of columns) {
        if (col.key === 'category_of_plastic') {
          mapped[col.label] = item.category_of_plastic || item.plasticCategory || r.category_of_plastic || 'Cat-II';
        } else if (col.key === 'product_type') {
        const hsn = String(r.hsn_code || r.hsn || '').trim();
        mapped[col.label] = hsn === '25231000' ? 'Clinker' : 'Cement';
      } else if (col.key === 'quantity_mt') {
        mapped[col.label] = resolvedMt ?? r.quantity_mt ?? r.quantity ?? '';
      } else if (col.key === 'quantity_sold_mt') {
        mapped[col.label] = resolvedMt ?? r.quantity_sold_mt ?? r.quantity ?? '';
      } else if (col.key === 'quantity_kg' && resolvedMt != null) {
        mapped[col.label] = resolvedMt * 1000;
      } else if (col.key === 'quantity_kg' && !r[col.key] && r.quantity_mt) {
        mapped[col.label] = r.quantity_mt * 1000;
      } else if (col.key === 'entity_name' && !r[col.key] && r.customer_name) {
        mapped[col.label] = r.customer_name;
      } else if (col.key === 'supplier_name' && !r[col.key] && r.vendor_name) {
        mapped[col.label] = r.vendor_name;
      } else if (col.key === 'legal_name') {
        const ext = r.extraction && typeof r.extraction === 'object' ? r.extraction : (typeof r.extraction === 'string' ? JSON.parse(r.extraction || '{}') : {});
        mapped[col.label] = r.legal_name || ext.legal_name || ext.legalName || '';
      } else if (col.key === 'trade_name') {
        const ext = r.extraction && typeof r.extraction === 'object' ? r.extraction : (typeof r.extraction === 'string' ? JSON.parse(r.extraction || '{}') : {});
        mapped[col.label] = r.trade_name || ext.trade_name || ext.tradeName || '';
      } else if (col.key === 'invoice_number' && !r[col.key] && r.invoice_no) {
        mapped[col.label] = r.invoice_no;
      } else if (col.key === 'procurement_date' && !r[col.key] && r.invoice_date) {
        mapped[col.label] = r.invoice_date;
      } else if (col.key === 'supplier_gst_number' && !r[col.key] && r.vendor_gstin) {
        mapped[col.label] = r.vendor_gstin;
      } else if (col.key === 'supplier_gst_number' && !r[col.key] && r.supplier_gst) {
        mapped[col.label] = r.supplier_gst;
        } else if (col.key === 'hsn') {
          mapped[col.label] = item.hsn || item.hsn_code || r.hsn || r.hsn_code || '';
        } else if (col.key === 'rate') {
          mapped[col.label] = item.rate || item.price || r.rate || r.price || '';
        } else if (col.key === 'invoice_quantity') {
          mapped[col.label] = item.quantity || r.invoice_quantity || r.quantity || '';
        } else if (col.key === 'unit') {
          mapped[col.label] = item.unit || item.uom || r.unit || '';
        } else if (col.key === 'item_name') {
          mapped[col.label] = item.productDescription || item.product || item.item_name || r.item_name || '';
        } else if (col.key === 'total_amount') {
          mapped[col.label] = item.amount || item.total_amount || r.total_amount || r.taxable_amount || '';
        } else {
          mapped[col.label] = item[col.key] ?? r[col.key] ?? '';
        }
      }
      return mapped;
    });
  });

  const headers = isPurchase ? PURCHASE_EXCEL_HEADERS : SALE_EXCEL_HEADERS;
  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers });

  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(40, Math.max(16, h.length + 2)),
  }));

  XLSX.utils.book_append_sheet(wb, ws, isPurchase ? 'Procurement Data' : 'Sales Data');
  XLSX.writeFile(wb, `${isPurchase ? 'procurement' : 'sales'}_data.xlsx`);
}
