import * as XLSX from 'xlsx';

/** Shared plastic category options (Purchase + Sale) */
export const PLASTIC_CATEGORIES = ['Cat-I', 'Cat-II', 'Cat-III'];

export function normalizePlasticCategory(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (['cat-i', 'cati', 'categoryi', 'category-i', 'cat1', 'i'].includes(compact)) return 'Cat-I';
  if (['cat-ii', 'catii', 'categoryii', 'category-ii', 'cat2', 'ii'].includes(compact)) return 'Cat-II';
  if (['cat-iii', 'catiii', 'categoryiii', 'category-iii', 'cat3', 'iii'].includes(compact)) return 'Cat-III';
  if (PLASTIC_CATEGORIES.includes(raw)) return raw;
  return raw;
}

/** Exact Excel column labels for Procurement (Purchases) */
export const PURCHASE_EXCEL_HEADERS = [
  'Category of Plastic',
  'Name of Supplier',
  'Address Line 1',
  'Address Line 2',
  'State',
  'City',
  'PIN Code',
  'Buyer GST',
  'Is Supplier GST Available (Yes/No)',
  'Supplier GST Number',
  'HSN Code',
  'Invoice No./GST E-Invoice Number',
  'IRN No.',
  'Qty. of Waste Plastic (MT)',
  'Qty. of Waste Plastic (Kg)',
  'Date of Entry (YYYY-MM-DD)',
  'Procurement date (YYYY-MM-DD)',
  'Invoice Filename',
];

export const PURCHASE_TABLE_COLUMNS = [
  { key: 'category_of_plastic', label: 'Categories of Plastic' },
  { key: 'supplier_name', label: 'Name of Supplier' },
  { key: 'address_line_1', label: 'Address Line 1' },
  { key: 'address_line_2', label: 'Address Line 2' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'pin_code', label: 'PIN Code' },
  { key: 'buyer_gst', label: 'Buyer GST' },
  { key: 'supplier_gst_number', label: 'Supplier GST' },
  { key: 'hsn_code', label: 'HSN Code' },
  { key: 'invoice_number', label: 'Invoice No./GST E-Invoice Number' },
  { key: 'invoice_date', label: 'Invoice Date' },
  { key: 'quantity_mt', label: 'Qty. of Waste Plastic (MT)' },
  { key: 'quantity_kg', label: 'Qty. of Waste Plastic (Kg)' },
  { key: 'date_of_entry', label: 'Date of Entry' },
  { key: 'procurement_date', label: 'Procurement date' },
  { key: 'invoice_filename', label: 'Invoice Filename' },
];

const PURCHASE_HEADER_TO_KEY = {
  category_of_plastic: 'category_of_plastic',
  name_of_supplier: 'supplier_name',
  supplier_name: 'supplier_name',
  address_line_1: 'address_line_1',
  address_line_2: 'address_line_2',
  state: 'state',
  city: 'city',
  pin_code: 'pin_code',
  pincode: 'pin_code',
  buyer_gst: 'buyer_gst',
  is_supplier_gst_available: 'is_supplier_gst_available',
  is_supplier_gst_available_yesno: 'is_supplier_gst_available',
  is_supplier_gst_available_yes_no: 'is_supplier_gst_available',
  supplier_gst_number: 'supplier_gst_number',
  supplier_gstin: 'supplier_gst_number',
  supplier_gst: 'supplier_gst_number',
  hsn_code: 'hsn_code',
  hsn: 'hsn_code',
  invoice_nogst_einvoice_number: 'invoice_number',
  invoice_number: 'invoice_number',
  invoice_no: 'invoice_number',
  irn_no: 'irn_no',
  qty_of_waste_plastic_mt: 'quantity_mt',
  quantity_mt: 'quantity_mt',
  qty_of_waste_plastic_kg: 'quantity_kg',
  quantity_kg: 'quantity_kg',
  // legacy / collided header before unit was preserved
  qty_of_waste_plastic: 'quantity_mt',
  date_of_entry: 'date_of_entry',
  date_of_entry_yyyymmdd: 'date_of_entry',
  procurement_date: 'procurement_date',
  procurement_date_yyyymmdd: 'procurement_date',
  invoice_filename: 'invoice_filename',
  invoice_file_name: 'invoice_filename',
};

/** Exact Excel column labels for Post Consumer (Sales) */
export const SALE_EXCEL_HEADERS = [
  'S-No.',
  'Category of Plastic',
  'Process Code',
  'Plastic Type',
  'Product Type',
  '(%) of Recycled Plastic in Product',
  'Conversion Factor',
  'Available Quantity (MT)',
  'Quantity Sold (MT)',
  'Registration type',
  'Name of the Entity',
  'Address',
  'State',
  'District',
  'Account Number',
  'IFSC Code',
  'GST & Other Charges',
  'Invoice File Name',
  'Application Number',
];

export const SALE_TABLE_COLUMNS = [
  { key: 'category_of_plastic', label: 'Category of Plastic' },
  { key: 'product_type', label: 'Product Type' },
  { key: 'quantity_sold_mt', label: 'Quantity Sold (MT)' },
  { key: 'entity_name', label: 'Name of the Entity' },
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
  name_of_the_entity: 'entity_name',
  entity_name: 'entity_name',
  address: 'address',
  state: 'state',
  district: 'district',
  account_number: 'account_number',
  ifsc_code: 'ifsc_code',
  gst_other_charges: 'gst_other_charges',
  invoice_file_name: 'invoice_file_name',
  invoice_file_name_shall_exactly_match_the_name_of_pdf_uploaded_in_zip_folder: 'invoice_file_name',
  application_number: 'application_number',
};

const PURCHASE_SAMPLE = {
  'Category of Plastic': 'Cat-I',
  'Name of Supplier': 'Green Plastics India',
  'Address Line 1': 'Plot 12, MIDC',
  'Address Line 2': 'Near Truck Terminal',
  State: 'Haryana',
  City: 'Gurugram',
  'PIN Code': '122001',
  'Buyer GST': '06AABCC1234D1Z5',
  'Is Supplier GST Available (Yes/No)': 'Yes',
  'Supplier GST Number': '06AABCG1111H1Z8',
  'HSN Code': '3915',
  'Invoice No./GST E-Invoice Number': 'PO-2025-001',
  'IRN No.': '',
  'Qty. of Waste Plastic (MT)': 12,
  'Qty. of Waste Plastic (Kg)': 12000,
  'Date of Entry (YYYY-MM-DD)': '2025-07-30',
  'Procurement date (YYYY-MM-DD)': '2025-07-28',
  'Invoice Filename': 'invoice_PO_2025_001.pdf',
};

const SALE_SAMPLE = {
  'S-No.': 1,
  'Category of Plastic': 'Cat-I',
  'Process Code': 'PC-01',
  'Plastic Type': 'PET',
  'Product Type': 'Granules',
  '(%) of Recycled Plastic in Product': 100,
  'Conversion Factor': 1,
  'Available Quantity (MT)': 10,
  'Quantity Sold (MT)': 5,
  'Registration type': 'PWM',
  'Name of the Entity': 'Eco Packaging Co',
  Address: '12 Industrial Area',
  State: 'Maharashtra',
  District: 'Pune',
  'Account Number': '1234567890',
  'IFSC Code': 'SBIN0001234',
  'GST & Other Charges': 9000,
  'Invoice File Name': 'invoice_SC_2025_001.pdf',
  'Application Number': 'APP-2025-001',
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
  const invoice_number = str(flat.invoice_number);
  const procurement_date = excelDateToIso(flat.procurement_date);
  const invoice_filename = str(flat.invoice_filename);
  let quantity_mt = num(flat.quantity_mt);
  let quantity_kg = num(flat.quantity_kg);
  if (!quantity_kg && quantity_mt) quantity_kg = Number((quantity_mt * 1000).toFixed(3));
  if (!quantity_mt && quantity_kg) quantity_mt = Number((quantity_kg / 1000).toFixed(6));

  if (!supplier_name && !invoice_number && !invoice_filename && !quantity_mt) {
    return null;
  }

  if (!supplier_name) {
    errors.push(`Row ${rowNum}: Name of Supplier is required`);
    return null;
  }
  if (!invoice_number) {
    errors.push(`Row ${rowNum}: Invoice Number is required`);
    return null;
  }
  if (!procurement_date) {
    errors.push(`Row ${rowNum}: Procurement Date is required (YYYY-MM-DD)`);
    return null;
  }
  if (!invoice_filename) {
    errors.push(`Row ${rowNum}: Invoice Filename is required`);
    return null;
  }

  let is_gst = str(flat.is_supplier_gst_available).toLowerCase();
  if (is_gst === 'y' || is_gst === 'true' || is_gst === '1') is_gst = 'Yes';
  if (is_gst === 'n' || is_gst === 'false' || is_gst === '0') is_gst = 'No';
  if (is_gst !== 'Yes' && is_gst !== 'No') {
    is_gst = str(flat.supplier_gst_number) ? 'Yes' : 'No';
  }

  const supplier_gst_number = str(flat.supplier_gst_number).toUpperCase();
  if (is_gst === 'Yes' && !supplier_gst_number) {
    errors.push(`Row ${rowNum}: Supplier GST Number is required when GST Available is Yes`);
    return null;
  }

  return {
    company_id: null,
    record_type: 'purchase_epr',
    category_of_plastic: normalizePlasticCategory(flat.category_of_plastic),
    supplier_name,
    address_line_1: str(flat.address_line_1),
    address_line_2: str(flat.address_line_2),
    state: str(flat.state),
    city: str(flat.city),
    pin_code: str(flat.pin_code),
    buyer_gst: str(flat.buyer_gst).toUpperCase(),
    is_supplier_gst_available: is_gst,
    supplier_gst_number,
    hsn_code: str(flat.hsn_code),
    invoice_number,
    irn_no: str(flat.irn_no),
    quantity_mt,
    quantity_kg,
    date_of_entry: excelDateToIso(flat.date_of_entry) || new Date().toISOString().slice(0, 10),
    procurement_date,
    invoice_filename,
    vendor_name: supplier_name,
    vendor_gstin: supplier_gst_number,
    invoice_no: invoice_number,
    invoice_date: procurement_date,
    item_name: normalizePlasticCategory(flat.category_of_plastic) || 'Plastic',
    quantity: quantity_mt,
    unit: 'MT',
    total_amount: 0,
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
  XLSX.utils.book_append_sheet(wb, lookupWs, 'Lookups');

  if (isPurchase) {
    const ws = XLSX.utils.json_to_sheet([PURCHASE_SAMPLE], {
      header: PURCHASE_EXCEL_HEADERS,
    });
    ws['!cols'] = PURCHASE_EXCEL_HEADERS.map((h) => ({
      wch: Math.min(40, Math.max(16, h.length + 2)),
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Procurement');
    XLSX.writeFile(wb, 'procurement_template.xlsx');
    return;
  }

  const ws = XLSX.utils.json_to_sheet([SALE_SAMPLE], { header: SALE_EXCEL_HEADERS });
  ws['!cols'] = SALE_EXCEL_HEADERS.map((h) => ({
    wch: Math.min(36, Math.max(16, h.length + 2)),
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'PostConsumer');
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
  for (const row of rows) {
    if (type === 'sale') {
      await window.pwp.sales.add(row);
    } else {
      await window.pwp.purchases.add(row);
    }
    saved += 1;
  }
  return saved;
}

export async function exportExcelData(type, rows) {
  const isPurchase = type !== 'sale';
  const wb = XLSX.utils.book_new();

  const sheetData = rows.map(r => {
    const mapped = {};
    const columns = isPurchase ? PURCHASE_TABLE_COLUMNS : SALE_TABLE_COLUMNS;
    for (const col of columns) {
      if (col.key === 'category_of_plastic') {
        mapped[col.label] = 'Cat-II';
      } else if (col.key === 'product_type') {
        const hsn = String(r.hsn_code || r.hsn || '').trim();
        mapped[col.label] = hsn === '25231000' ? 'Clinker' : 'Cement';
      } else if (col.key === 'quantity_mt' && !r[col.key] && r.quantity) {
        mapped[col.label] = r.quantity;
      } else if (col.key === 'quantity_kg' && !r[col.key] && r.quantity_mt) {
        mapped[col.label] = r.quantity_mt * 1000;
      } else if (col.key === 'entity_name' && !r[col.key] && r.customer_name) {
        mapped[col.label] = r.customer_name;
      } else if (col.key === 'supplier_name' && !r[col.key] && r.vendor_name) {
        mapped[col.label] = r.vendor_name;
      } else if (col.key === 'invoice_number' && !r[col.key] && r.invoice_no) {
        mapped[col.label] = r.invoice_no;
      } else if (col.key === 'procurement_date' && !r[col.key] && r.invoice_date) {
        mapped[col.label] = r.invoice_date;
      } else if (col.key === 'supplier_gst_number' && !r[col.key] && r.vendor_gstin) {
        mapped[col.label] = r.vendor_gstin;
      } else {
        mapped[col.label] = r[col.key];
      }
    }
    return mapped;
  });

  const headers = isPurchase ? PURCHASE_EXCEL_HEADERS : SALE_EXCEL_HEADERS;
  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers });

  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(40, Math.max(16, h.length + 2)),
  }));

  XLSX.utils.book_append_sheet(wb, ws, isPurchase ? 'Procurement Data' : 'Sales Data');
  XLSX.writeFile(wb, `${isPurchase ? 'procurement' : 'sales'}_data.xlsx`);
}
