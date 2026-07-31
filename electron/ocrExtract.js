/**

 * Compact Gemini extraction (climeto-ocr style) + QR-priority merge.

 * Uses short JSON keys to cut tokens; expands to EPR + lineItems.

 */

import path from 'path';



function nf(v) {

  if (v === null || v === undefined) return '';

  const s = String(v).trim();

  if (!s || /^not[_\s-]?found$/i.test(s) || s === '-' || s === 'N/A') return '';

  return s;

}



function num(v) {

  if (v === null || v === undefined || v === '') return 0;

  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

  const cleaned = String(v).replace(/,/g, '').replace(/[^0-9.-]/g, '');

  const n = parseFloat(cleaned);

  return Number.isFinite(n) ? n : 0;

}



/** DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD → YYYY-MM-DD */

export function toIsoDate(v) {

  const s = nf(v);

  if (!s) return '';

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);

  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);

  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  return s;

}



export function qtyToMt(raw) {

  const s = nf(raw);

  if (!s) return 0;

  const n = num(s);

  if (!n) return 0;

  const lower = s.toLowerCase();

  if (/\b(kg|kgs|kilogram)/.test(lower)) return Number((n / 1000).toFixed(6));

  if (/\b(g|gram|grams)\b/.test(lower)) return Number((n / 1_000_000).toFixed(6));

  if (/\b(mt|ton|tonne|tonnes|t)\b/.test(lower)) return n;

  return n;

}



/**

 * Compact climeto-style prompt. Short keys = fewer tokens.

 * Header + products[] line items (max 15).

 */

export function buildExtractionPrompt(type, financialYear = 'all') {

  const isPurchase = type === 'purchase';

  const fy =

    financialYear && String(financialYear).toLowerCase() !== 'all'

      ? `FY:${financialYear}.`

      : '';



  const productsHint =

    'products:max15 lines only (skip freight/tax/totals). d=desc h=HSN m=polymer(PP|HDPE|LDPE|PET|PS|PVC|LLDPE|MLP|"" ) q=qty+unit a=lineAmt ga=gstAmt gr=gst% c=plasticCat rp=recycled%';



  if (isPurchase) {

    return `OCR PURCHASE. JSON only minified.

MODE:SELLER only.Ignore buyer.

${fy}

{"inv":"","dt":"YYYY-MM-DD","name":"","gst":"","a1":"","a2":"","city":"","st":"","pin":"","mob":"","tot":0,"products":[{"d":"","h":"","m":"","q":"","a":0,"ga":0,"gr":0,"c":"","rp":""}]}

RULES:name/gst/a*/city/st/pin/mob=seller.dt=issue date.tot=grand total.GSTIN 15ch O→0 I→1.m only if printed else "".${productsHint}`;

  }



  return `OCR SALE. JSON only minified.

MODE:BUYER(Bill To) for party.Seller bank only for bank fields.

${fy}

{"inv":"","dt":"YYYY-MM-DD","name":"","gst":"","addr":"","st":"","dist":"","ac":"","ifsc":"","tot":0,"reg":"","pc":"","products":[{"d":"","h":"","m":"","q":"","a":0,"ga":0,"gr":0,"c":"","rp":""}]}

RULES:name/gst/addr/st/dist=buyer.ac/ifsc=seller bank.tot=grand total.dt=YYYY-MM-DD.m/c/rp/pc/reg only if printed else "".${productsHint}`;

}



/** Normalize raw Gemini JSON (short or long keys) → common shape */

export function expandRawExtraction(raw = {}) {

  const productsSrc = Array.isArray(raw.products)

    ? raw.products

    : Array.isArray(raw.lineItems)

      ? raw.lineItems

      : [];



  const products = productsSrc.slice(0, 15).map((p, i) => {

    const quantity = nf(p.q ?? p.quantity ?? p.qty);

    return {

      lineNo: i + 1,

      productDescription: nf(p.d ?? p.productDescription ?? p.description ?? p.item_name),

      hsn: nf(p.h ?? p.hsn ?? p.hsnCode ?? p.hsn_code),

      plasticMaterial: nf(p.m ?? p.plasticMaterial ?? p.plasticType ?? p.plastic_type),

      plasticCategory: nf(p.c ?? p.plasticCategory ?? p.category_of_plastic),

      recycledPercent: nf(p.rp ?? p.recycledPercent ?? p.recycled_plastic_percent),

      quantity,

      valueInMt: qtyToMt(quantity) || null,

      amount: num(p.a ?? p.amount),

      gstAmount: num(p.ga ?? p.gstAmount ?? p.gst_amount),

      gstRate: num(p.gr ?? p.gstRate ?? p.gst_rate),

    };

  });



  return {

    invoiceNumber: nf(raw.inv ?? raw.invoiceNumber ?? raw.invoice_no ?? raw.invoice_number),

    invoiceDate: toIsoDate(raw.dt ?? raw.invoiceDate ?? raw.invoice_date),

    companyName: nf(raw.name ?? raw.supplierName ?? raw.entityName ?? raw.companyName),

    gstNumber: nf(raw.gst ?? raw.supplierGstin ?? raw.buyerGstin ?? raw.gstNumber).toUpperCase(),

    addressLine1: nf(raw.a1 ?? raw.addressLine1 ?? raw.addr ?? raw.address ?? raw.partyAddress),

    addressLine2: nf(raw.a2 ?? raw.addressLine2),

    city: nf(raw.city),

    state: nf(raw.st ?? raw.state),

    district: nf(raw.dist ?? raw.district),

    pinCode: nf(raw.pin ?? raw.pinCode ?? raw.pin_code),

    mobile: nf(raw.mob ?? raw.mobile ?? raw.contactNumber),

    accountNumber: nf(raw.ac ?? raw.accountNumber ?? raw.bankAccount),

    ifscCode: nf(raw.ifsc ?? raw.ifscCode),

    totalInvoiceAmount: num(raw.tot ?? raw.gstOtherCharges ?? raw.totalInvoiceAmount ?? raw.total_amount),

    registrationType: nf(raw.reg ?? raw.registrationType),

    processCode: nf(raw.pc ?? raw.processCode),

    products,

  };

}



export function mapProductsToLineItems(products = []) {

  return (products || []).map((p, i) => ({

    lineNo: p.lineNo || i + 1,

    productDescription: nf(p.productDescription),

    hsn: nf(p.hsn),

    plasticMaterial: nf(p.plasticMaterial),

    plasticCategory: nf(p.plasticCategory),

    recycledPercent: nf(p.recycledPercent),

    quantity: nf(p.quantity),

    valueInMt: p.valueInMt != null ? p.valueInMt : qtyToMt(p.quantity) || null,

    amount: num(p.amount),

    gstAmount: num(p.gstAmount),

    gstRate: num(p.gstRate),

  }));

}



function sumMtFromLines(lineItems) {

  let sum = 0;

  for (const li of lineItems) {

    const mt = num(li.valueInMt) || qtyToMt(li.quantity);

    sum += mt;

  }

  return sum > 0 ? Number(sum.toFixed(6)) : 0;

}



function firstLine(lineItems) {

  return lineItems[0] || null;

}



/** Map → purchase EPR row + lineItems */

export function mapPurchaseFromOcr(raw, fileName) {

  const x = expandRawExtraction(raw);

  const lineItems = mapProductsToLineItems(x.products);

  const first = firstLine(lineItems);

  const qty = sumMtFromLines(lineItems) || qtyToMt(raw.quantityMt);

  const gst = x.gstNumber;



  return {

    company_id: null,

    record_type: 'purchase_epr',

    category_of_plastic: nf(first?.plasticCategory || raw.plasticCategory),

    supplier_name: x.companyName,

    address_line_1: x.addressLine1,

    address_line_2: x.addressLine2,

    state: x.state,

    city: x.city,

    pin_code: x.pinCode,

    is_supplier_gst_available: gst ? 'Yes' : 'No',

    supplier_gst_number: gst,

    supplier_mobile_number: x.mobile,

    procurement_date: x.invoiceDate,

    quantity_mt: qty,

    invoice_number: x.invoiceNumber,

    hsn_code: nf(first?.hsn || raw.hsnCode),

    invoice_filename: fileName || '',

    vendor_name: x.companyName,

    vendor_gstin: gst,

    invoice_no: x.invoiceNumber,

    invoice_date: x.invoiceDate,

    item_name: nf(first?.productDescription),

    quantity: qty,

    unit: 'MT',

    total_amount: x.totalInvoiceAmount,

    lineItems,

    extraction: x,

    _source_fields: {},

  };

}



/** Map → sale EPR row + lineItems */

export function mapSaleFromOcr(raw, fileName, sNo = 1) {

  const x = expandRawExtraction(raw);

  const lineItems = mapProductsToLineItems(x.products);

  const first = firstLine(lineItems);

  const qty = sumMtFromLines(lineItems) || qtyToMt(raw.quantitySoldMt ?? raw.quantityMt);



  return {

    company_id: null,

    record_type: 'sale_epr',

    s_no: String(sNo),

    category_of_plastic: nf(first?.plasticCategory || raw.plasticCategory),

    process_code: x.processCode,

    plastic_type: nf(first?.plasticMaterial || raw.plasticType),

    product_type: nf(first?.productDescription || raw.productType),

    recycled_plastic_percent: num(first?.recycledPercent || raw.recycledPlasticPercent),

    conversion_factor: num(raw.conversionFactor) || 0,

    available_quantity_mt: num(raw.availableQuantityMt),

    quantity_sold_mt: qty,

    registration_type: x.registrationType,

    entity_name: x.companyName,

    address: x.addressLine1,

    state: x.state,

    district: x.district,

    account_number: x.accountNumber,

    ifsc_code: x.ifscCode,

    gst_other_charges: x.totalInvoiceAmount,

    invoice_file_name: fileName || '',

    application_number: x.invoiceNumber,

    customer_name: x.companyName,

    customer_gstin: x.gstNumber,

    invoice_no: x.invoiceNumber,

    invoice_date: x.invoiceDate,

    item_name: nf(first?.productDescription),

    quantity: qty,

    unit: 'MT',

    total_amount: x.totalInvoiceAmount,

    hsn_code: nf(first?.hsn),

    lineItems,

    extraction: x,

    _source_fields: {},

  };

}



/**

 * QR e-invoice fields override OCR when present.

 */

export function applyQrPriority(row, qrData, type) {

  if (!qrData || typeof qrData !== 'object') return row;

  const out = { ...row, _source_fields: { ...(row._source_fields || {}) } };

  const mark = (key) => {

    out._source_fields[key] = 'qr';

  };



  const docNo = nf(qrData.DocNo || qrData.docNo);

  const docDt = toIsoDate(qrData.DocDt || qrData.docDt || qrData.IrnDt);

  const hsn = nf(qrData.MainHsnCode || qrData.mainHsnCode);

  const tot = num(qrData.TotInvVal ?? qrData.totInvVal);

  const sellerGst = nf(qrData.SellerGstin || qrData.sellerGstin).toUpperCase();

  const buyerGst = nf(qrData.BuyerGstin || qrData.buyerGstin).toUpperCase();

  const irn = nf(qrData.Irn || qrData.irn || qrData.printedIrn);



  if (type === 'purchase') {

    if (docNo) {

      out.invoice_number = docNo;

      out.invoice_no = docNo;

      mark('invoice_number');

    }

    if (docDt) {

      out.procurement_date = docDt;

      out.invoice_date = docDt;

      mark('procurement_date');

    }

    if (sellerGst) {

      out.supplier_gst_number = sellerGst;

      out.vendor_gstin = sellerGst;

      out.is_supplier_gst_available = 'Yes';

      mark('supplier_gst_number');

    }

    if (hsn) {

      out.hsn_code = hsn;

      mark('hsn_code');

      if (Array.isArray(out.lineItems) && out.lineItems.length === 1 && !out.lineItems[0].hsn) {

        out.lineItems = [{ ...out.lineItems[0], hsn }];

      }

    }

    if (tot) {

      out.total_amount = tot;

      mark('total_amount');

    }

    if (irn) {

      out.notes = [out.notes, `IRN:${irn}`].filter(Boolean).join(' | ');

      mark('irn');

    }

  } else {

    if (docNo) {

      out.application_number = out.application_number || docNo;

      out.invoice_no = docNo;

      mark('application_number');

    }

    if (docDt) {

      out.invoice_date = docDt;

      mark('invoice_date');

    }

    if (buyerGst) {

      out.customer_gstin = buyerGst;

      mark('customer_gstin');

    }

    if (tot) {

      out.gst_other_charges = tot;

      out.total_amount = tot;

      mark('gst_other_charges');

    }

    if (hsn) {

      out.hsn_code = hsn;

      mark('hsn_code');

      if (Array.isArray(out.lineItems) && out.lineItems.length === 1 && !out.lineItems[0].hsn) {

        out.lineItems = [{ ...out.lineItems[0], hsn }];

      }

    }

    if (irn) {

      out.notes = [out.notes, `IRN:${irn}`].filter(Boolean).join(' | ');

      mark('irn');

    }

  }



  out._qr = {

    DocNo: docNo,

    DocDt: docDt,

    SellerGstin: sellerGst,

    BuyerGstin: buyerGst,

    TotInvVal: tot,

    MainHsnCode: hsn,

    Irn: irn,

  };

  return out;

}



export function getRowLineItems(row) {

  if (!row) return [];

  if (Array.isArray(row.lineItems) && row.lineItems.length) return row.lineItems;

  if (Array.isArray(row.extraction?.products) && row.extraction.products.length) {

    return mapProductsToLineItems(row.extraction.products);

  }

  return [];

}



export function fileBaseName(filePath) {

  return path.basename(filePath || '') || '';

}


