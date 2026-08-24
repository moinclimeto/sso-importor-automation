import {
  applyPackagingMasterToDraft,
  lookupPackagingMasterRow,
  shouldAutoApplyPackagingMaster,
  resolveFinancialYear,
  resolveLineRate,
  formatLineRate,
  resolveLineMt,
} from './procurementConversionFactor.js';
import { sanitizePlasticMaterial } from './packagingMasterSync.js';
import { resolveState } from './gstStateCodes.js';
import { fillLineItemsHsn, normalizeHsnCode, resolveLineHsn, resolveReviewLineHsn, splitHsnFromDescription } from './hsnUtils.js';
import { normalizePlasticCategory } from './plasticCategories.js';

/** Resolve invoice / document number from row + OCR extraction + filename. */
export function resolveInvoiceNumberFromRecord(row = {}) {
  const extraction =
    row.extraction && typeof row.extraction === 'object' ? row.extraction : {};

  const candidates = [
    row.invoice_number,
    row.invoice_no,
    row.application_number,
    extraction.invoice_number,
    extraction.invoiceNumber,
    extraction.inv,
    extraction.invoice_no,
    extraction.billNo,
    extraction.billNumber,
    extraction.document_number,
    extraction.documentNumber,
  ];

  for (const c of candidates) {
    if (c != null && String(c).trim() && String(c).trim() !== '—') {
      return String(c).trim();
    }
  }

  const fname = row.invoice_filename || row.invoice_file_name || '';
  const fromName = String(fname).match(/(?:invoice|inv|bill)[\s_-]*#?(\d[\d/-]*\d|\d+)/i);
  if (fromName?.[1]) return fromName[1].replace(/\//g, '-');
  const digits = String(fname).match(/(\d{6,})/);
  if (digits?.[1]) return digits[1];

  return '';
}

function normalizeCategory(value) {
  return normalizePlasticCategory(value) || '';
}

function firstNonEmptyAddress(...values) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== '-' && s !== '—') return s;
  }
  return '';
}

/** Guess district from comma-separated buyer address (e.g. "..., Pune, Maharashtra 411001"). */
function extractDistrictFromAddress(address) {
  const addr = String(address || '').trim();
  if (!addr) return '';
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2].replace(/\d{6}/g, '').trim();
    if (candidate && !/^\d+$/.test(candidate)) return candidate;
  }
  return '';
}

function sumLineItemsAmountWithGst(items) {
  if (!Array.isArray(items) || !items.length) return null;
  let sum = 0;
  let has = false;
  for (const item of items) {
    const amt = Number(item.amount ?? item.a ?? item.total ?? item.lineTotal ?? 0);
    const gst = Number(item.gstAmount ?? item.gst_amount ?? item.ga ?? 0);
    if (Number.isFinite(amt) && amt !== 0) {
      sum += amt;
      has = true;
    }
    if (Number.isFinite(gst) && gst !== 0) {
      sum += gst;
      has = true;
    }
  }
  return has ? sum : null;
}

/** Supplier / seller address from DB row or OCR extraction payload. */
export function resolveProcurementAddress(row = {}) {
  const extraction =
    row.extraction && typeof row.extraction === 'object' ? row.extraction : {};

  const direct = firstNonEmptyAddress(
    row.address_line_1,
    row.address,
    extraction.supplier_address,
    extraction.supplierAddress,
    extraction.seller_address,
    extraction.sellerAddress,
    extraction.vendor_address,
    extraction.address,
    extraction.addr,
    extraction.a1,
    extraction.address_line_1,
    extraction.addressLine1,
    extraction.bill_from_address,
  );
  if (direct) return direct;

  const parts = [
    row.address_line_2,
    extraction.address_line_2,
    row.city || extraction.supplier_city || extraction.supplierCity || extraction.city,
    row.state || extraction.supplier_state || extraction.state,
    row.pin_code || extraction.supplier_pin_code || extraction.pin_code || extraction.pin,
  ]
    .map((v) => (v != null ? String(v).trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
}

/** Buyer / customer address + state from row (never supplier address on sale records). */
export function resolveBuyerAddressFields(row = {}) {
  const ext = parseRowExtraction(row);
  const buyerGst =
    row.customer_gstin ||
    row.buyer_gst ||
    ext.buyer_gst ||
    ext.buyerGst ||
    ext.bg ||
    '';

  const line1 = firstNonEmptyAddress(
    row.buyer_address,
    ext.buyer_address,
    ext.buyerAddress,
    ext.consignee_address,
    ext.consigneeAddress,
    ext.ship_to_address,
    ext.shipToAddress,
    ext.bill_to_address,
    ext.billToAddress,
  );

  const city = firstNonEmptyAddress(row.buyer_city, ext.buyer_city, ext.buyerCity, ext.city);
  const pin = firstNonEmptyAddress(
    row.buyer_pin_code,
    ext.buyer_pin_code,
    ext.buyerPinCode,
    ext.pin,
    row.pin_code,
  );
  const district = firstNonEmptyAddress(
    row.buyer_district,
    ext.buyer_district,
    ext.buyerDistrict,
    ext.dist,
    ext.district,
    city,
  );

  const buyerStateRaw = firstNonEmptyAddress(
    row.buyer_state,
    ext.buyer_state,
    ext.buyerState,
  );

  const stateFromGst = resolveState('', buyerGst);
  const state = resolveState(buyerStateRaw, buyerGst);

  const address =
    line1 ||
    [
      ext.a1,
      ext.addr,
      ext.addressLine1,
      ext.address,
      city,
      district,
      stateFromGst || state,
      pin,
    ]
      .map((v) => (v != null ? String(v).trim() : ''))
      .filter(Boolean)
      .join(', ');

  return {
    address,
    state: stateFromGst || state,
    district,
    pin_code: pin,
    city,
  };
}

/** Buyer / customer address from DB row or OCR extraction payload. */
export function resolveSalesAddress(row = {}) {
  const buyerFields = resolveBuyerAddressFields(row);
  if (buyerFields.address) return buyerFields.address;

  const extraction =
    row.extraction && typeof row.extraction === 'object' ? row.extraction : {};

  const isSale =
    String(row.record_type || '').includes('sale') ||
    row._routing?.decidedType === 'sale';

  const direct = firstNonEmptyAddress(
    row.address,
    extraction.address,
    extraction.addr,
    extraction.a1,
    extraction.addressLine1,
  );
  if (direct) return direct;

  if (!isSale) {
    const supplierLine = firstNonEmptyAddress(row.address_line_1);
    if (supplierLine) return supplierLine;
  }

  const parts = [
    extraction.city || row.city,
    buyerFields.state,
    buyerFields.pin_code,
  ]
    .map((v) => (v != null ? String(v).trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
}

export function parseRowExtraction(row = {}) {
  if (!row?.extraction) return {};
  if (typeof row.extraction === 'object') return row.extraction;
  try {
    return JSON.parse(row.extraction);
  } catch {
    return {};
  }
}

export function resolveSalesDistrict(row = {}) {
  const ext = parseRowExtraction(row);
  const direct = firstNonEmptyAddress(
    row.district,
    ext.district,
    ext.dist,
  );
  if (direct) return direct;

  const fromCity = firstNonEmptyAddress(row.city, ext.city);
  if (fromCity) return fromCity;

  return extractDistrictFromAddress(resolveSalesAddress(row));
}

export function resolveSalesGstOtherCharges(row = {}) {
  const ext = parseRowExtraction(row);
  const direct = [
    row.gst_other_charges,
    row.total_amount,
    ext.gst_other_charges,
    ext.gstOtherCharges,
    ext.totalInvoiceAmount,
    ext.tot,
    ext.total_amount,
  ];
  for (const c of direct) {
    if (c != null && c !== '') {
      const n = Number(c);
      if (Number.isFinite(n) && n !== 0) return n;
    }
  }

  const itemSources = [
    row.line_items,
    row.lineItems,
    ext.line_items,
    ext.lineItems,
    ext.products,
  ];
  for (const items of itemSources) {
    const sum = sumLineItemsAmountWithGst(items);
    if (sum != null) return sum;
  }

  return '';
}

export function buildSalesHeaderFromRow(row = {}) {
  const ext = parseRowExtraction(row);
  const buyerFields = resolveBuyerAddressFields(row);
  const date = row.invoice_date || ext.invoiceDate || '';
  const customerGst =
    row.customer_gstin ||
    ext.buyerGst ||
    ext.buyer_gst ||
    ext.gstNumber ||
    ext.gst ||
    '';
  return {
    entity_name: row.entity_name || row.customer_name || ext.buyerName || ext.buyer_name || '',
    customer_name: row.customer_name || row.entity_name || ext.buyerName || ext.buyer_name || '',
    customer_gstin: customerGst,
    address: resolveSalesAddress(row),
    state: buyerFields.state || resolveState(row.buyer_state || ext.buyer_state, customerGst),
    district: buyerFields.district || resolveSalesDistrict(row),
    mobile_number: row.mobile_number || ext.mobile || ext.mob || '',
    invoice_number: resolveInvoiceNumberFromRecord(row) || row.invoice_no || row.application_number || '',
    invoice_date: date,
    financial_year: resolveFinancialYear(date, row.financial_year || ext.financialYear),
    registration_type:
      row.registration_type ||
      ext.registration_type ||
      ext.registrationType ||
      ext.reg ||
      '',
    entity_type:
      row.entity_type ||
      ext.entity_type ||
      ext.entityType ||
      ext.ent ||
      '',
    product_type: row.product_type || '',
    process_code: row.process_code || '',
    recycled_plastic_percent: row.recycled_plastic_percent ?? ext.recycled_plastic_percent ?? '',
    conversion_factor: row.conversion_factor ?? '',
    account_number: row.account_number || ext.accountNumber || ext.account_number || ext.ac || '',
    ifsc_code: row.ifsc_code || ext.ifscCode || ext.ifsc_code || ext.ifsc || '',
    gst_other_charges: resolveSalesGstOtherCharges(row),
    quantity_sold_mt:
      row.quantity_sold_mt != null && row.quantity_sold_mt !== ''
        ? String(row.quantity_sold_mt)
        : '',
  };
}

/** Merge OCR / extraction fallbacks into a sales row for table, edit modal, or view. */
export function enrichSaleRecord(row = {}) {
  const buyerFields = resolveBuyerAddressFields(row);
  const district = buyerFields.district || resolveSalesDistrict(row);
  const gst = resolveSalesGstOtherCharges(row);
  const ext = parseRowExtraction(row);
  const gstValue = gst !== '' && gst != null ? gst : row.gst_other_charges ?? '';
  const customerGst = row.customer_gstin || ext.buyerGst || ext.buyer_gst || ext.gstNumber || '';
  return {
    ...row,
    district: district || row.district || '',
    gst_other_charges: gstValue === '' || gstValue == null ? '' : String(gstValue),
    customer_gstin: customerGst,
    address: resolveSalesAddress(row) || row.address || buyerFields.address || '',
    state:
      buyerFields.state ||
      resolveState(row.buyer_state || ext.buyer_state, customerGst) ||
      '',
  };
}

export function normalizePlasticMaterial(value) {
  const cleaned = sanitizePlasticMaterial(value);
  if (cleaned) return cleaned;
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.toLowerCase() === 'other') return 'Others';
  return v.length <= 32 ? v : '';
}

/** Apply bulk category/material to every review line. */
export function applyBulkPlasticToLines(lines = [], bulkCat = '', bulkMaterial = '') {
  const cat = String(bulkCat || '').trim();
  const material = normalizePlasticMaterial(bulkMaterial);
  if (!cat && !material) {
    return { lines, updated: 0 };
  }

  let updated = 0;
  const next = lines.map((line) => {
    const patch = {};
    if (cat) patch.plasticCategory = cat;
    if (material) patch.plasticMaterial = material;
    const nextLine = {
      ...line,
      ...patch,
      lineStatus: line.lineStatus === 'new' ? 'incomplete' : line.lineStatus,
    };
    if (
      nextLine.plasticCategory !== line.plasticCategory ||
      nextLine.plasticMaterial !== line.plasticMaterial
    ) {
      updated += 1;
    }
    return nextLine;
  });

  return { lines: next, updated };
}
export function enrichReviewLines(drafts = [], row = {}, packagingRows = []) {
  const defaultCat = normalizeCategory(
    row.category_of_plastic || row.plasticCategory || row.extraction?.category_of_plastic,
  ) || 'Cat-II';

  const defaultMaterial =
    String(
      row.plastic_type ||
        row.plastic_material ||
        row.extraction?.plastic_material_type ||
        row.extraction?.plastic_type ||
        '',
    ).trim() || 'Others';

  const extractionLines =
    row.extraction?.line_items ||
    row.extraction?.lineItems ||
    row.extraction?.products ||
    [];

  return drafts.map((draft, idx) => {
    let line = { ...draft };
    if (!String(line.rate || '').trim()) {
      const extLine = extractionLines[idx];
      if (extLine) {
        const rateVal = resolveLineRate(extLine, line.quantity, line.amount);
        if (rateVal != null) line.rate = formatLineRate(rateVal);
      }
    }
    if (!String(line.rate || '').trim()) {
      const rateVal = resolveLineRate(line, line.quantity, line.amount);
      if (rateVal != null) line.rate = formatLineRate(rateVal);
    }
    if (!String(line.hsn || '').trim()) {
      const split = splitHsnFromDescription(line.productDescription);
      if (split.hsn) {
        line.hsn = split.hsn;
        line.productDescription = split.description;
      } else {
        const extLine = extractionLines[idx];
        const parsedHsn = resolveReviewLineHsn(line, extLine, row, idx);
        if (parsedHsn) line.hsn = parsedHsn;
      }
    } else {
      const split = splitHsnFromDescription(line.productDescription);
      if (
        split.hsn &&
        normalizeHsnCode(line.hsn) === normalizeHsnCode(split.hsn) &&
        split.description &&
        split.description !== line.productDescription
      ) {
        line.productDescription = split.description;
      }
    }
    const master = lookupPackagingMasterRow(packagingRows, line);
    if (master && shouldAutoApplyPackagingMaster(line)) {
      line = applyPackagingMasterToDraft(line, master);
    }
    if (!String(line.plasticCategory || '').trim()) {
      line.plasticCategory = defaultCat;
    } else {
      line.plasticCategory = normalizeCategory(line.plasticCategory);
    }
    if (!String(line.plasticMaterial || '').trim()) {
      line.plasticMaterial = defaultMaterial;
    } else {
      line.plasticMaterial = normalizePlasticMaterial(line.plasticMaterial);
    }
    if (line.lineStatus === 'new' && line.plasticCategory && line.plasticMaterial) {
      line.lineStatus = 'incomplete';
    }
    return line;
  });
}

export function buildProcurementHeaderFromRow(row = {}) {
  const date = row.procurement_date || row.invoice_date || '';
  return {
    supplier_name: row.supplier_name || row.vendor_name || '',
    address_line_1: resolveProcurementAddress(row),
    supplier_gst_number: row.supplier_gst_number || row.vendor_gstin || '',
    invoice_number: resolveInvoiceNumberFromRecord(row),
    invoice_date: date,
    financial_year: resolveFinancialYear(date, row.financial_year),
    registration_type:
      row.registration_type ||
      row.extraction?.registration_type ||
      row.extraction?.registrationType ||
      row.extraction?.reg ||
      '',
    entity_type:
      row.entity_type ||
      row.extraction?.entity_type ||
      row.extraction?.entityType ||
      row.extraction?.ent ||
      '',
    state: resolveState(
      row.state ||
        row.extraction?.supplier_state ||
        row.extraction?.state ||
        row.extraction?.st,
      row.supplier_gst_number || row.vendor_gstin || row.supplier_gst,
    ),
    supplier_mobile_number:
      row.supplier_mobile_number ||
      row.extraction?.supplier_mobile ||
      row.extraction?.supplier_mobile_number ||
      row.extraction?.mobile ||
      '',
    country: row.country || row.extraction?.country || '',
    procurement_source: row.procurement_source || '',
  };
}

/** Live validation for OCR review — used to enable Publish when required fields are complete. */
export function validateReviewDocument({
  header = {},
  lines = [],
  record = {},
  packagingRows = [],
  mode = 'purchase',
} = {}) {
  const headerDraft = { ...header };
  if (!headerDraft.invoice_number?.trim()) {
    headerDraft.invoice_number = resolveInvoiceNumberFromRecord(record || {});
  }
  headerDraft.financial_year = resolveFinancialYear(
    headerDraft.invoice_date,
    headerDraft.financial_year,
  );

  const enrichedLines = enrichReviewLines(lines, { ...record, ...headerDraft }, packagingRows);
  const errors = [];

  if (mode === 'sale' && !headerDraft.entity_name?.trim()) {
    errors.push('Customer / entity name is required');
  }
  if (!headerDraft.invoice_number?.trim()) errors.push('Document number is required');
  if (!headerDraft.invoice_date?.trim()) errors.push('Document date is required');
  if (!headerDraft.financial_year?.trim()) errors.push('Financial year is required');
  if (!enrichedLines.length) errors.push('At least one line item is required');

  enrichedLines.forEach((line, i) => {
    const mt = resolveLineMt(line);
    if (mt == null || mt <= 0) errors.push(`Line ${i + 1}: Qty (MT) is required`);
    if (!line.plasticCategory?.trim()) errors.push(`Line ${i + 1}: Category is required`);
    if (!line.plasticMaterial?.trim()) errors.push(`Line ${i + 1}: Material is required`);
  });

  return {
    ok: errors.length === 0,
    errors,
    headerDraft,
    enrichedLines,
  };
}
