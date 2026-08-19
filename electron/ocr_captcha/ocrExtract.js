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

export function buildExtractionPrompt(type, financialYear = 'all', companyDocType = null, fileNameHint = '') {
  const fileHint = fileNameHint
    ? `\nFilename hint (weak): "${fileNameHint}". If filename contains "CIN", prefer doc_type=cin when a CIN number or letterhead is visible.`
    : '';

  if (type === 'company_document') {
    switch (companyDocType) {
      case 'auto':
        return `OCR Company Document. IDENTIFY the document type and extract accordingly. JSON only minified. 
          Determine "doc_type" from: [gst, unit_gst, pan, cin, iec, cto, udyam, supporting_category_doc, operations_details, plastic_packaging_picture, covering_letter, signature, self_declaration, other].
          IMPORTANT CIN RULE: If the document shows "CIN", "CIN#", Corporate Identity Number, or a 21-character CIN (e.g. U13111MP2025PTC080792), ALWAYS use doc_type=cin and extract document_number, entity_name, issue_date, address — even on company letterheads, declarations, or informal certificates. Do NOT classify such documents as self_declaration.
          If gst or unit_gst: Extract: {"doc_type":"(gst or unit_gst)","document_number":"","entity_name":"","trade_name":"","constitution_of_business":"","address":"","district":"","issue_date":"YYYY-MM-DD","date_of_liability":"YYYY-MM-DD"}. (document_number=GSTIN. address=clean comma-separated address without GST labels. district=district name only)
          If pan: Extract: {"doc_type":"","document_number":"","entity_name":"","father_name":"","dob":"YYYY-MM-DD","issue_date":"YYYY-MM-DD"}. (document_number=PAN, if 4th letter 'C' set doc_type="company_pan" else "person_pan")
          If cin: Extract: {"doc_type":"cin","document_number":"","entity_name":"","issue_date":"","address":""}. (document_number=CIN without label, entity_name=company name, issue_date=incorporation date if visible)
          If iec: Extract: {"doc_type":"iec","document_number":"","entity_name":""}.
          If cto: Extract: {"doc_type":"cto","document_number":"","entity_name":"","address":"","industry_category":"","allowed_capacity":"","issue_date":"YYYY-MM-DD","validity_date":"YYYY-MM-DD"}.
          If udyam: Extract: {"doc_type":"udyam","document_number":"","entity_name":"","enterprise_type":"","social_category":"","address":"","date_of_incorporation":"","date_of_commencement":"","issue_date":"YYYY-MM-DD","units":[{"sno":"","name":""}],"nic_codes":[{"nic_2":"","nic_4":"","nic_5":"","activity":""}]}.
          For supporting_category_doc, operations_details, plastic_packaging_picture, covering_letter, signature: DO NOT extract textual data. ONLY return {"doc_type":"..."}.
          For self_declaration or other: ONLY return {"doc_type":"..."} if no GSTIN/PAN/CIN/IEC/Udyam numbers are visible.${fileHint}`;
      case 'gst':
        return `OCR GST Certificate. JSON only minified. Extract: {"doc_type":"gst","document_number":"","entity_name":"","trade_name":"","constitution_of_business":"","address":"","district":"","issue_date":"YYYY-MM-DD","date_of_liability":"YYYY-MM-DD"}. RULES: document_number=GSTIN. entity_name=Legal Name. trade_name=Trade Name. issue_date=Date of Registration. address=clean comma-separated postal address WITHOUT labels like "Building No./Flat No.:" or "District:". district=district name only (e.g. Raisen).`;
      case 'pan':
        return `OCR PAN Card. JSON only minified. Extract: {"doc_type":"","document_number":"","entity_name":"","father_name":"","dob":"YYYY-MM-DD","issue_date":"YYYY-MM-DD"}. RULES: document_number=PAN number. If 4th letter of PAN is 'C' set doc_type="company_pan", otherwise set doc_type="person_pan". entity_name=Name on card. father_name=Father's Name (blank if company). For person_pan: dob=Date of Birth exactly as on card converted to YYYY-MM-DD (look for "DOB", "Date of Birth", birth date field). Set issue_date same as dob. For company_pan: dob="", issue_date=Date of Incorporation if present.`;
      case 'cin':
        return `OCR CIN/Incorporation Certificate or company letterhead with CIN. JSON only minified. Extract: {"doc_type":"cin","document_number":"","entity_name":"","issue_date":"","address":""}. RULES: document_number=Corporate Identity Number (CIN, 21 chars like U13111MP2025PTC080792, strip CIN# prefix). entity_name=Name of Company. issue_date=Date of Incorporation (YYYY-MM-DD, or just YYYY if full date missing). address=Registered Office Address.${fileHint}`;
      case 'cto':
        return `OCR CTO (Consent to Operate). JSON only minified. Extract: {"doc_type":"cto","document_number":"","entity_name":"","address":"","industry_category":"","allowed_capacity":"","issue_date":"YYYY-MM-DD","validity_date":"YYYY-MM-DD"}. RULES: document_number=Consent Order No. entity_name=Company/Industry Name. address=Plant Address/Location. industry_category=Category (Red/Orange/Green/White). allowed_capacity=Allowed Products/Capacity limits. issue_date=Issue/Consent Date. validity_date=Valid Upto.`;
      case 'electricity':
        return `OCR Electricity Bill. JSON only minified. Extract: {"doc_type":"electricity","document_number":"","entity_name":"","address":"","provider":"","issue_date":"YYYY-MM-DD","due_date":"YYYY-MM-DD","billing_month":"","units_consumed":0,"amount":0}. RULES: document_number=Consumer No / K No / Account ID. entity_name=Consumer Name. address=Supply/Service Address. provider=Electricity Provider/Discom Name. issue_date=Bill Date. due_date=Payment Due Date. billing_month=Billing Period/Month. units_consumed=Total Units (kWh) consumed. amount=Net Amount Payable.`;
      case 'udyam':
        return `OCR Udyam Certificate. JSON only minified. Extract: {"doc_type":"udyam","document_number":"","entity_name":"","enterprise_type":"","social_category":"","address":"","date_of_incorporation":"","date_of_commencement":"","issue_date":"YYYY-MM-DD","units":[{"sno":"","name":""}],"nic_codes":[{"nic_2":"","nic_4":"","nic_5":"","activity":""}]}. RULES: document_number=Udyam Registration Number. entity_name=Name of Enterprise. enterprise_type=Type of Enterprise (e.g. SMALL MANUFACTURING). address=Full Official Address of Enterprise. date_of_incorporation=Date of Incorporation. date_of_commencement=Date of Commencement. issue_date=Date of Udyam Registration.`;
      case 'iec':
        return `OCR IEC Certificate (Importer-Exporter Code). JSON only minified. Extract: {"doc_type":"iec","document_number":"","entity_name":"","address":"","issue_date":"YYYY-MM-DD"}. RULES: document_number=IEC Number. entity_name=Firm/Company Name. address=Registered Address. issue_date=Date of Issue.`;
      default:
        return `OCR Document. JSON only minified. Extract: {"doc_type":"unknown","document_number":"","entity_name":"","issue_date":"YYYY-MM-DD"}.`;
    }
  }

  const isPurchase = type === 'purchase';

  const fy =

    financialYear && String(financialYear).toLowerCase() !== 'all'

      ? `FY:${financialYear}.`

      : '';



  const productsHint =
    'products:max15 lines only (skip freight/tax/totals). d=desc h=HSN m=productType(if h=25231000 then Clinker else Cement) q=qty+unit a=lineAmt ga=gstAmt gr=gst% c=plasticCat rp=recycled%';



  if (isPurchase) {

    return `OCR PURCHASE. JSON only minified.

Counterparty=SELLER (supplier).Also extract buyer GST+name for company match.

${fy}

{"inv":"","dt":"YYYY-MM-DD","cpy":"original","sellerName":"","sellerGst":"","buyerName":"","buyerGst":"","a1":"","a2":"","city":"","st":"","pin":"","mob":"","tot":0,"products":[{"d":"","h":"","m":"","q":"","a":0,"ga":0,"gr":0,"c":"","rp":""}]}

RULES:sellerName/sellerGst/a*/city/st/pin/mob=seller(supplier).buyerName/buyerGst=buyer.dt=issue date.tot=grand total.GSTIN 15ch O→0 I→1.cpy='original'|'duplicate'|'triplicate' from header top right (default original).${productsHint}`;

  }



  return `OCR SALE. JSON only minified.

Counterparty=BUYER(Bill To).Also extract seller GST+name for company match.Seller bank for bank fields.

${fy}

{"inv":"","dt":"YYYY-MM-DD","cpy":"original","buyerName":"","buyerGst":"","sellerName":"","sellerGst":"","addr":"","st":"","dist":"","ac":"","ifsc":"","tot":0,"reg":"","pc":"","products":[{"d":"","h":"","m":"","q":"","a":0,"ga":0,"gr":0,"c":"","rp":""}]}

RULES:buyerName/buyerGst/addr/st/dist=buyer(customer).sellerName/sellerGst=seller.ac/ifsc=seller bank.tot=grand total.dt=YYYY-MM-DD.c/rp/pc/reg only if printed else "".cpy='original'|'duplicate'|'triplicate' from header top right (default original).${productsHint}`;

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



  const sellerGst = nf(
    raw.sg ?? raw.sellerGst ?? raw.sellerGstin ?? raw.SellerGstin ?? raw.supplierGstin ?? raw.vendorGstin ?? raw.vendorGst
  ).toUpperCase();
  const buyerGst = nf(
    raw.bg ?? raw.buyerGst ?? raw.buyerGstin ?? raw.BuyerGstin ?? raw.customerGstin ?? raw.customerGst
  ).toUpperCase();
  const sellerName = nf(raw.sn ?? raw.sellerName ?? raw.SellerNm ?? raw.supplierName ?? raw.vendorName ?? raw.partyName);
  const buyerName = nf(raw.bn ?? raw.buyerName ?? raw.BuyerNm ?? raw.customerName ?? raw.consigneeName);

  return {

    invoiceNumber: nf(raw.inv ?? raw.invoiceNumber ?? raw.invoice_no ?? raw.invoice_number ?? raw.billNo ?? raw.billNumber),

    invoiceDate: toIsoDate(raw.dt ?? raw.invoiceDate ?? raw.invoice_date ?? raw.billDate),

    companyName: nf(raw.name ?? raw.supplierName ?? raw.entityName ?? raw.companyName ?? raw.partyName),

    gstNumber: nf(raw.gst ?? raw.supplierGstin ?? raw.buyerGstin ?? raw.gstNumber).toUpperCase(),

    sellerGst,
    buyerGst,
    sellerName,
    buyerName,

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

    copyType: nf(raw.cpy ?? raw.copyType ?? 'original').toLowerCase(),

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

  const gst = x.sellerGst || x.gstNumber;
  const sellerName = x.sellerName || x.companyName;



  return {

    company_id: null,

    record_type: 'purchase_epr',

    category_of_plastic: nf(first?.plasticCategory || raw.plasticCategory),

    supplier_name: sellerName,

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

    vendor_name: sellerName,

    vendor_gstin: gst,

    seller_gst: gst,
    buyer_gst: x.buyerGst,
    seller_name: sellerName,
    buyer_name: x.buyerName,

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

  const hsnStr = String(first?.hsn || raw.hsnCode || '').replace(/[^0-9]/g, '');
  const isClinker = hsnStr.includes('25231000');

  return {

    company_id: null,

    record_type: 'sale_epr',

    s_no: String(sNo),

    category_of_plastic: nf(first?.plasticCategory || raw.plasticCategory),

    process_code: x.processCode,

    plastic_type: nf(first?.plasticMaterial || raw.plasticType),

    product_type: isClinker ? 'Clinker' : 'Cement',

    recycled_plastic_percent: isClinker ? 100 : num(first?.recycledPercent || raw.recycledPlasticPercent),

    conversion_factor: num(raw.conversionFactor) || 0,

    available_quantity_mt: num(raw.availableQuantityMt),

    quantity_sold_mt: qty,

    registration_type: x.registrationType,

    entity_name: x.buyerName || x.companyName,

    address: x.addressLine1,

    state: x.state,

    district: x.district,

    account_number: x.accountNumber,

    ifsc_code: x.ifscCode,

    gst_other_charges: x.totalInvoiceAmount,

    invoice_file_name: fileName || '',

    application_number: x.invoiceNumber,

    customer_name: x.buyerName || x.companyName,

    customer_gstin: x.buyerGst || x.gstNumber,

    seller_gst: x.sellerGst || '',
    buyer_gst: x.buyerGst || x.gstNumber,
    seller_name: x.sellerName || '',
    buyer_name: x.buyerName || x.companyName,

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


