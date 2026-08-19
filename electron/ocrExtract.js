/**

 * Compact Gemini extraction (climeto-ocr style) + QR-priority merge.

 * Uses short JSON keys to cut tokens; expands to EPR + lineItems.

 */

import path from 'path';
import {
  deriveProcessedQuantityMT,
  isWeightUom,
  itemToLineDraft,
  lineDraftToPersist,
  sumLineProcessedMt,
  CONVERSION_METHOD,
  normalizeLineUom,
  resolveFinancialYear,
  resolveLineRate,
} from '../shared/procurementConversionFactor.js';
import { resolveState } from '../shared/gstStateCodes.js';
import { normalizePlasticCategory } from '../shared/plasticCategories.js';



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

/** Return null when value is missing/blank; otherwise normalized string. */
function nullVal(v) {
  const s = nf(v);
  return s || null;
}

/** Return null when numeric value is missing/invalid. */
function nullNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePlasticCategoryOrNull(value) {
  const cat = normalizePlasticCategory(value);
  return cat || null;
}

function parsePlasticQuantity(raw = {}) {
  const qtyRaw = raw.total_plastic_quantity ?? raw.quantity ?? raw.qty ?? raw.quantity_mt;
  const unitRaw = raw.quantity_unit ?? raw.unit ?? raw.qty_unit;
  const qty = nullNum(qtyRaw);
  const unit = nullVal(unitRaw);
  if (qty == null) return { quantity: null, unit: null, quantity_mt: null };

  const unitLower = String(unit || 'mt').toLowerCase();
  let quantityMt = qty;
  if (/\b(kg|kgs|kilogram)/.test(unitLower)) quantityMt = Number((qty / 1000).toFixed(6));
  else if (/\b(g|gram|grams)\b/.test(unitLower)) quantityMt = Number((qty / 1_000_000).toFixed(6));

  return {
    quantity: qty,
    unit: unit || 'MT',
    quantity_mt: quantityMt,
  };
}

function isWeightQuantityUnit(unit) {
  const u = String(unit || '').toLowerCase();
  return /\b(kg|kgs|kilogram|mt|ton|tonne|tonnes|t)\b/.test(u);
}

function weightToMt(value, unit) {
  const n = num(value);
  if (!n) return null;
  const u = String(unit || 'kg').toLowerCase();
  if (/\b(kg|kgs|kilogram)/.test(u)) return Number((n / 1000).toFixed(6));
  if (/\b(g|gram|grams)\b/.test(u)) return Number((n / 1_000_000).toFixed(6));
  if (/\b(mt|ton|tonne|tonnes|t)\b/.test(u)) return n;
  return Number((n / 1000).toFixed(6));
}

function sumLineQuantities(lineItems = []) {
  let sum = 0;
  let has = false;
  for (const li of lineItems) {
    const q = num(li.quantity);
    if (q > 0) {
      sum += q;
      has = true;
    }
  }
  return has ? sum : null;
}

function sumNonWeightLineQuantities(lineItems = []) {
  let sum = 0;
  let has = false;
  for (const li of lineItems) {
    if (isWeightQuantityUnit(li.unit)) continue;
    const q = num(li.quantity);
    if (q > 0) {
      sum += q;
      has = true;
    }
  }
  return has ? sum : null;
}

function lineWeightMt(item = {}) {
  const fromMt = num(item.weight_mt);
  if (fromMt > 0) return fromMt;
  const raw = item.weight ?? item.total_weight ?? item.net_weight ?? null;
  if (raw == null || String(raw).trim() === '') return null;
  return weightToMt(raw, item.weight_unit ?? item.weightUnit ?? 'kg');
}

function sumLineWeightMt(lineItems = []) {
  let sum = 0;
  let has = false;
  for (const li of lineItems) {
    const w = lineWeightMt(li);
    if (w != null && w > 0) {
      sum += w;
      has = true;
    }
  }
  return has ? Number(sum.toFixed(6)) : null;
}

/** Total plastic MT: sum line TOTAL weights; else kg/ton qty; else pieces ÷ CF. */
export function calcTotalPlasticQuantityMt(lineItems = [], conversionFactor) {
  const weightTotal = sumLineWeightMt(lineItems);
  if (weightTotal != null) return weightTotal;

  let totalMt = 0;
  let hasWeightQty = false;
  for (const li of lineItems) {
    const q = num(li.quantity);
    if (q <= 0 || !isWeightQuantityUnit(li.unit)) continue;
    const mt = weightToMt(q, li.unit);
    if (mt != null && mt > 0) {
      totalMt += mt;
      hasWeightQty = true;
    }
  }
  if (hasWeightQty) return Number(totalMt.toFixed(6));

  const cf = num(conversionFactor);
  const pieceSum = sumNonWeightLineQuantities(lineItems);
  if (pieceSum != null && cf > 0) {
    return Number((pieceSum / cf).toFixed(6));
  }

  return null;
}

function mapProcurementLineItems(raw = {}) {
  const src = Array.isArray(raw.line_items)
    ? raw.line_items
    : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : Array.isArray(raw.products)
        ? raw.products
        : [];

  return src.slice(0, 50).map((item, i) => {
    const uom = normalizeLineUom(item);
    const quantity = nullVal(uom.quantity || (item.quantity ?? item.qty ?? item.q));
    const unit = nullVal(uom.unit || (item.unit ?? item.quantity_unit ?? item.u));
    const qtyNum = nullNum(item.quantity ?? item.qty ?? item.q);
    const weightRaw =
      item.weight ?? item.total_weight ?? item.net_weight ?? item.line_weight ?? null;
    const weightUnit = nullVal(item.weight_unit ?? item.weightUnit ?? item.wt_unit) || 'kg';
    const weightMt = weightRaw != null ? weightToMt(weightRaw, weightUnit) : null;
    const amount = nullNum(item.amount ?? item.a);
    const rate = resolveLineRate(item, quantity, amount);
    const resolvedAmount =
      amount ??
      (qtyNum != null && rate != null ? Number((qtyNum * rate).toFixed(2)) : null);
    const gstPaid = nullNum(item.gst ?? item.gst_amount ?? item.gstPaid);

    const baseDraft = itemToLineDraft(
      {
        product: nullVal(item.product ?? item.product_name ?? item.name ?? item.p),
        productDescription: nullVal(
          item.product_description ?? item.productDescription ?? item.description ?? item.d
        ),
        quantity,
        unit,
        weight: weightRaw != null ? String(weightRaw) : null,
        weight_unit: weightUnit,
        weight_mt: weightMt,
        rate,
        amount: resolvedAmount,
        gstPaid,
        hsn: nullVal(item.hsn ?? item.hsn_code),
        quantityDerivationType: isWeightUom(unit) || weightMt ? 'default' : 'manual',
        conversionMethodUsed: CONVERSION_METHOD.DEFAULT,
        lineStatus: 'incomplete',
      },
      i,
    );

    const mt = deriveProcessedQuantityMT({
      quantity: baseDraft.quantity,
      unitInInvoice: baseDraft.unit,
      quantityDerivationType: baseDraft.quantityDerivationType,
      weightMt: baseDraft.weight_mt,
      lineAmount: baseDraft.amount,
      lineGstAmount: baseDraft.gstPaid,
    });

    return lineDraftToPersist({
      ...baseDraft,
      processedQuantity: mt != null ? String(mt) : baseDraft.processedQuantity,
    });
  });
}

function sumMtFromProcurementLines(lineItems = []) {
  const drafts = (lineItems || []).map((li, i) => itemToLineDraft(li, i));
  return sumLineProcessedMt(drafts);
}

function resolveSupplierName(raw = {}) {
  return nullVal(
    raw.supplier_name ??
      raw.supplierName ??
      raw.party_name ??
      raw.partyName ??
      raw.seller_name ??
      raw.sellerName ??
      raw.vendor_name ??
      raw.vendorName ??
      raw.name_of_supplier ??
      raw.bill_from ??
      raw.billFrom
  );
}

function resolveSupplierAddress(raw = {}) {
  return nullVal(
    raw.supplier_address ??
      raw.supplierAddress ??
      raw.seller_address ??
      raw.sellerAddress ??
      raw.vendor_address ??
      raw.bill_from_address
  );
}

function resolveBuyerName(raw = {}) {
  return nullVal(
    raw.buyer_name ??
      raw.buyerName ??
      raw.bill_to ??
      raw.billTo ??
      raw.consignee_name ??
      raw.consigneeName ??
      raw.ship_to
  );
}

function resolveBuyerGst(raw = {}) {
  const gst = nullVal(raw.buyer_gst ?? raw.buyerGst ?? raw.buyer_gstin ?? raw.buyerGstin);
  return gst ? gst.toUpperCase() : null;
}

function resolveSupplierGst(raw = {}) {
  const gst = nullVal(
    raw.supplier_gst ??
      raw.supplierGst ??
      raw.supplier_gstin ??
      raw.seller_gst ??
      raw.sellerGst ??
      raw.seller_gstin ??
      raw.vendor_gstin
  );
  return gst ? gst.toUpperCase() : null;
}

/** Keep supplier / seller / vendor name fields in sync for purchase rows. */
export function normalizePurchasePartyFields(row = {}) {
  const supplier = nullVal(row.supplier_name ?? row.vendor_name ?? row.seller_name);
  const buyer = nullVal(row.buyer_name);
  return {
    ...row,
    supplier_name: supplier,
    vendor_name: supplier,
    seller_name: supplier,
    buyer_name: buyer,
  };
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



export function qtyToMt(raw, unit) {
  const s = nf(raw);
  if (!s) return 0;

  if (unit) {
    const qtyOnly = parseFloat(String(s).replace(/,/g, '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(qtyOnly)) return 0;
    const mt = deriveProcessedQuantityMT({
      quantity: qtyOnly,
      unitInInvoice: unit,
      quantityDerivationType: 'default',
    });
    return mt != null && mt > 0 ? mt : 0;
  }

  const n = num(s);
  if (!n) return 0;

  const lower = s.toLowerCase();
  if (/\b(kg|kgs|kilogram)/.test(lower)) return Number((n / 1000).toFixed(6));
  if (/\b(g|gram|grams)\b/.test(lower)) return Number((n / 1_000_000).toFixed(6));
  if (/\b(qtl|quintal|quintals|q)\b/.test(lower)) return Number((n / 10).toFixed(6));
  if (/\b(mt|ton|tonne|tonnes|t)\b/.test(lower)) return n;

  // Bare numbers or PC/NOS/etc. — not MT without explicit weight unit.
  return 0;
}



/**

 * Compact climeto-style prompt. Short keys = fewer tokens.

 * Header + products[] line items (max 15).

 */

export function buildExtractionPrompt(type, financialYear = 'all', companyDocType = null) {

  if (type === 'company_document') {
    switch (companyDocType) {
      case 'auto':
        return `OCR Company Document. IDENTIFY the document type and extract accordingly. JSON only minified. 
        Determine "doc_type" from: [gst, pan, cin, cto, electricity, udyam, iec, other].
        If gst: Extract: {"doc_type":"gst","document_number":"","entity_name":"","trade_name":"","constitution_of_business":"","address":"","issue_date":"YYYY-MM-DD","date_of_liability":"YYYY-MM-DD"}. (document_number=GSTIN)
        If pan: Extract: {"doc_type":"","document_number":"","entity_name":"","father_name":"","dob":"YYYY-MM-DD","issue_date":"YYYY-MM-DD"}. (document_number=PAN, if 4th letter 'C' set doc_type="company_pan" else "person_pan". For person_pan: dob=Date of Birth on card as YYYY-MM-DD, also copy to issue_date. For company_pan: dob="", issue_date=Date of Incorporation if printed.)
        If cin: Extract: {"doc_type":"cin","document_number":"","entity_name":"","issue_date":"","address":""}.
        If cto: Extract: {"doc_type":"cto","document_number":"","entity_name":"","address":"","industry_category":"","allowed_capacity":"","issue_date":"YYYY-MM-DD","validity_date":"YYYY-MM-DD"}.
        If electricity: Extract: {"doc_type":"electricity","document_number":"","entity_name":"","address":"","provider":"","issue_date":"YYYY-MM-DD","due_date":"YYYY-MM-DD","billing_month":"","units_consumed":0,"amount":0}.
        If udyam: Extract: {"doc_type":"udyam","document_number":"","entity_name":"","enterprise_type":"","social_category":"","address":"","date_of_incorporation":"","date_of_commencement":"","issue_date":"YYYY-MM-DD","units":[{"sno":"","name":""}],"nic_codes":[{"nic_2":"","nic_4":"","nic_5":"","activity":""}]}.
        If iec: Extract: {"doc_type":"iec","document_number":"","entity_name":"","address":"","issue_date":"YYYY-MM-DD"}.
        If unknown, use "other" and extract basic info: {"doc_type":"unknown","document_number":"","entity_name":"","issue_date":"YYYY-MM-DD"}.`;
      case 'gst':
        return `OCR GST Certificate. JSON only minified. Extract: {"doc_type":"gst","document_number":"","entity_name":"","trade_name":"","constitution_of_business":"","address":"","issue_date":"YYYY-MM-DD","date_of_liability":"YYYY-MM-DD"}. RULES: document_number=GSTIN. entity_name=Legal Name. trade_name=Trade Name. issue_date=Date of Registration.`;
      case 'pan':
        return `OCR PAN Card. JSON only minified. Extract: {"doc_type":"","document_number":"","entity_name":"","father_name":"","dob":"YYYY-MM-DD","issue_date":"YYYY-MM-DD"}. RULES: document_number=PAN number. If 4th letter of PAN is 'C' set doc_type="company_pan", otherwise set doc_type="person_pan". entity_name=Name on card. father_name=Father's Name (blank if company). For person_pan: dob=Date of Birth exactly as on card converted to YYYY-MM-DD (look for "DOB", "Date of Birth", birth date field). Set issue_date same as dob. For company_pan: dob="", issue_date=Date of Incorporation if present.`;
      case 'cin':
        return `OCR CIN/Incorporation Certificate. JSON only minified. Extract: {"doc_type":"cin","document_number":"","entity_name":"","issue_date":"","address":""}. RULES: document_number=Corporate Identity Number (CIN). entity_name=Name of Company. issue_date=Date of Incorporation (YYYY-MM-DD, or just YYYY if full date missing). address=Registered Office Address.`;
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
    const fyHint =
      financialYear && String(financialYear).toLowerCase() !== 'all'
        ? `Default financial_year to "${financialYear}" only if not visible on document.`
        : 'Extract financial_year from document if visible (e.g. 2025-26).';

    return `OCR PROCUREMENT / PURCHASE invoice. JSON only minified. Extract SUPPLIER (seller/vendor) details for data entry. Also extract BUYER details only for company matching — never copy buyer into supplier fields.
${fyHint}
{"registration_type":null,"entity_type":null,"supplier_name":null,"supplier_gst":null,"supplier_address":null,"supplier_state":null,"supplier_city":null,"supplier_pin_code":null,"supplier_mobile":null,"buyer_name":null,"buyer_gst":null,"invoice_number":null,"irn_no":null,"account_number":null,"ifsc_code":null,"country":null,"plastic_material_type":null,"category_of_plastic":null,"financial_year":null,"date":null,"total_plastic_quantity":null,"quantity_unit":null,"recycled_plastic_percent":null,"conversion_factor":null,"line_items":[{"product":null,"product_description":null,"quantity":null,"unit":null,"weight":null,"weight_unit":null,"rate":null}]}
CRITICAL PARTY RULES:
- supplier_name / supplier_gst / supplier_address / supplier_mobile = SELLER/VENDOR party ONLY (Bill From, Sold By, Dispatched From, Supplier, Party Name on purchase side).
- buyer_name / buyer_gst = BUYER party ONLY (Bill To, Buyer, Consignee, Ship To — this is the importer/target company on the invoice).
- NEVER put buyer name/address/GST into supplier_* fields.
- If only one party block is visible and it is Bill To, leave supplier_* as null.
INVOICE / BANK (extract if printed on invoice, else null — do not guess):
invoice_number=Invoice No / Bill No / GST e-invoice document number.
irn_no=GST e-invoice IRN (64-char hex) if printed.
account_number=Supplier bank account number if printed.
ifsc_code=Supplier bank IFSC if printed.
OTHER RULES:
registration_type=Registered or Unregistered (of supplier entity if printed).
entity_type=PWPs/Producers/Brand Owners/PIBOs/Importers (supplier entity type if printed).
country=Supplier country.
supplier_state=Supplier state from address block (State / Place of Supply for supplier side).
supplier_city=Supplier city if printed.
supplier_pin_code=Supplier PIN / pincode if printed.
plastic_material_type=Plastic material (PET/HDPE/LDPE/PP/PS/Multi-layer/etc).
category_of_plastic=Cat-I/Cat-II/Cat-III/Cat-IV or Category I/II/III/IV.
financial_year=FY like 2025-26.
date=Procurement/invoice date as YYYY-MM-DD.
total_plastic_quantity=numeric grand total plastic/mass if printed (not piece count).
quantity_unit=unit printed with total quantity (MT/Ton/Kg/etc).
recycled_plastic_percent=numeric recycled % if mentioned, else null.
line_items=ALL product rows (max 50). Skip freight/tax/subtotal/grand-total rows.
Each line_items[]: product, product_description, quantity (count e.g. 24 PC), unit (PC/KG/MT),
weight=TOTAL weight for entire line row (use Total Weight / Gross Weight column — all pieces combined, NOT net unit weight per piece),
weight_unit (KG/MT/G — default KG),
rate=unit rate / price per unit (numeric, exclude GST unless only tax-inclusive rate is printed),
amount=taxable line amount if printed (use to derive rate = amount/quantity when rate column missing).
conversion_factor=numeric if printed else null.`;
  }

  return `OCR SALE. JSON only minified.
Counterparty=BUYER(Bill To).Also extract seller GST+name for company match.Seller bank for bank fields.
${fy}
{"inv":"","dt":"YYYY-MM-DD","cpy":"original","buyerName":"","buyerGst":"","sellerName":"","sellerGst":"","addr":"","st":"","dist":"","pin":"","city":"","ac":"","ifsc":"","mob":"","ent":"","reg":"","fy":"","tot":0,"pc":"","products":[{"d":"","h":"","m":"","q":"","a":0,"ga":0,"gr":0,"c":"","rp":""}]}
RULES:buyerName/buyerGst/addr/st/dist/pin/city/mob=buyer(customer).sellerName/sellerGst=seller.st=State name from buyer address (not code).dist=District if printed.pin=PIN if printed.sellerName/sellerGst=seller.ac/ifsc=seller bank.tot=grand total.dt=YYYY-MM-DD.ent=Entity Type (PWPs/Producers/Brand Owners/PIBOs/Importers).reg=Registration Type (Registered/Unregistered).fy=Financial Year (e.g. 2023-24).c/rp/pc/reg only if printed else "".cpy='original'|'duplicate'|'triplicate' from header top right (default original).${productsHint}`;
}

/** Normalize raw Gemini JSON (short or long keys) → common shape */

export function expandRawExtraction(raw = {}) {

  const productsSrc = Array.isArray(raw.products)
    ? raw.products
    : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : Array.isArray(raw.line_items)
        ? raw.line_items
        : [];



  const products = productsSrc.slice(0, 15).map((p, i) => {
    const uom = normalizeLineUom({
      quantity: p.q ?? p.quantity ?? p.qty,
      unit: p.u ?? p.unit ?? p.uom ?? p.UOM,
    });
    const quantity = nf(uom.quantity || (p.q ?? p.quantity ?? p.qty));
    const amount = num(p.a ?? p.amount);
    const rate = resolveLineRate(p, quantity, amount);

    return {

      lineNo: i + 1,

      productDescription: nf(p.d ?? p.productDescription ?? p.description ?? p.item_name),

      hsn: nf(p.h ?? p.hsn ?? p.hsnCode ?? p.hsn_code),

      plasticMaterial: nf(p.m ?? p.plasticMaterial ?? p.plasticType ?? p.plastic_type),

      plasticCategory: nf(p.c ?? p.plasticCategory ?? p.category_of_plastic),

      recycledPercent: nf(p.rp ?? p.recycledPercent ?? p.recycled_plastic_percent),

      quantity,

      unit: nf(uom.unit || (p.u ?? p.unit ?? p.uom)),

      uom: nf(uom.unit || (p.u ?? p.unit ?? p.uom)),

      rate: rate ?? null,

      valueInMt: null,

      amount,

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

    addressLine1: nf(raw.a1 ?? raw.addressLine1 ?? raw.addr ?? raw.address ?? raw.partyAddress) || null,

    addressLine2: nf(raw.a2 ?? raw.addressLine2) || null,

    city: nf(raw.city) || null,

    state: resolveState(nf(raw.st ?? raw.state ?? raw.supplier_state), buyerGst) || null,

    district: nf(raw.dist ?? raw.district) || null,

    pinCode: nf(raw.pin ?? raw.pinCode ?? raw.pin_code) || null,

    mobile: nf(raw.mob ?? raw.mobile ?? raw.contactNumber) || null,
    
    country: nf(raw.country) || null,

    accountNumber: nf(raw.ac ?? raw.accountNumber ?? raw.bankAccount) || null,

    ifscCode: nf(raw.ifsc ?? raw.ifscCode) || null,

    totalInvoiceAmount: num(raw.tot ?? raw.gstOtherCharges ?? raw.totalInvoiceAmount ?? raw.total_amount) || null,

    registrationType: nf(raw.reg ?? raw.registrationType) || null,
    
    entityType: nf(raw.ent ?? raw.entityType ?? raw.entity_type) || null,
    
    financialYear: nf(raw.fy ?? raw.financialYear ?? raw.financial_year) || null,

    processCode: nf(raw.pc ?? raw.processCode) || null,
    
    category_of_plastic: nf(raw.category_of_plastic) || null,
    
    plastic_type: nf(raw.plastic_type) || null,
    
    recycled_plastic_percent: num(raw.recycled_plastic_percent) || null,

    copyType: nf(raw.cpy ?? raw.copyType ?? 'original').toLowerCase(),

    products,

  };

}



export function mapProductsToLineItems(products = []) {

  return (products || []).map((p, i) => {
    const uom = normalizeLineUom(p);
    return {
    lineNo: p.lineNo || i + 1,

    productDescription: nf(p.productDescription),

    hsn: nf(p.hsn),

    plasticMaterial: nf(p.plasticMaterial),

    plasticCategory: nf(p.plasticCategory),

    recycledPercent: nf(p.recycledPercent),

    quantity: nf(uom.quantity || p.quantity),

    unit: nf(uom.unit || p.unit || p.uom),

    uom: nf(uom.unit || p.unit || p.uom),

    rate: p.rate ?? resolveLineRate(p, uom.quantity || p.quantity, p.amount),

    valueInMt: p.valueInMt != null ? p.valueInMt : null,

    amount: num(p.amount),

    gstAmount: num(p.gstAmount),

    gstRate: num(p.gstRate),

  };
  });

}



function sumMtFromLines(lineItems) {
  const drafts = (lineItems || []).map((li, i) => itemToLineDraft(li, i));
  return sumLineProcessedMt(drafts) || 0;
}



function firstLine(lineItems) {

  return lineItems[0] || null;

}



/** Map → procurement EPR row (registration-style fields + line items). */
export function mapPurchaseFromOcr(raw, fileName, financialYear = 'all') {
  const lineItems = mapProcurementLineItems(raw);
  const headerQty = parsePlasticQuantity(raw);
  const qtyFromLines = sumMtFromProcurementLines(lineItems);
  const defaultFy =
    financialYear && String(financialYear).toLowerCase() !== 'all' ? financialYear : null;
  const firstLineItem = lineItems[0] || null;
  const supplierGst = resolveSupplierGst(raw);
  const extractedState =
    raw.supplier_state ?? raw.supplierState ?? raw.state ?? raw.st ?? null;
  const invoiceDate = nullVal(toIsoDate(raw.date ?? raw.procurement_date ?? raw.invoice_date ?? raw.dt));

  return {
    company_id: null,
    record_type: 'purchase_epr',
    registration_type: nullVal(raw.registration_type ?? raw.registrationType ?? raw.reg),
    entity_type: nullVal(raw.entity_type ?? raw.entityType ?? raw.ent),
    supplier_name: resolveSupplierName(raw),
    supplier_gst_number: resolveSupplierGst(raw),
    vendor_gstin: resolveSupplierGst(raw),
    seller_gst: resolveSupplierGst(raw),
    is_supplier_gst_available: resolveSupplierGst(raw) ? 'Yes' : null,
    buyer_name: resolveBuyerName(raw),
    buyer_gst: resolveBuyerGst(raw),
    country: nullVal(raw.country ?? raw.supplier_country),
    address_line_1: resolveSupplierAddress(raw) ?? nullVal(raw.address ?? raw.address_line_1),
    address_line_2: null,
    state: nullVal(resolveState(extractedState, supplierGst)),
    city: nullVal(raw.supplier_city ?? raw.supplierCity ?? raw.city),
    pin_code: nullVal(
      raw.supplier_pin_code ?? raw.supplierPinCode ?? raw.pin_code ?? raw.pin ?? raw.pincode,
    ),
    supplier_mobile_number: nullVal(
      raw.supplier_mobile ?? raw.supplier_mobile_number ?? raw.mobile_number ?? raw.mobile
    ),
    plastic_type: nullVal(
      raw.plastic_material_type ?? raw.plastic_type ?? raw.plasticMaterial ?? firstLineItem?.product
    ),
    category_of_plastic: normalizePlasticCategoryOrNull(
      raw.category_of_plastic ?? raw.plasticCategory ?? raw.category
    ),
    financial_year: nullVal(
      resolveFinancialYear(
        invoiceDate,
        raw.financial_year ?? raw.financialYear ?? raw.fy ?? defaultFy,
      ),
    ),
    procurement_date: invoiceDate,
    invoice_date: invoiceDate,
    quantity_mt: qtyFromLines ?? headerQty.quantity_mt,
    quantity: qtyFromLines ?? headerQty.quantity_mt ?? null,
    unit: 'MT',
    conversion_factor: nullNum(raw.conversion_factor ?? raw.conversionFactor),
    doc_status: 'inbox',
    recycled_plastic_percent: nullNum(raw.recycled_plastic_percent ?? raw.recycledPlasticPercent),
    invoice_number: nullVal(
      raw.invoice_number ?? raw.invoiceNumber ?? raw.inv ?? raw.invoice_no ?? raw.billNo
    ),
    invoice_no: nullVal(
      raw.invoice_number ?? raw.invoiceNumber ?? raw.inv ?? raw.invoice_no ?? raw.billNo
    ),
    irn_no: nullVal(raw.irn_no ?? raw.irn ?? raw.Irn ?? raw.printedIrn),
    account_number: nullVal(
      raw.account_number ?? raw.accountNumber ?? raw.ac ?? raw.bank_account ?? raw.bankAccount
    ),
    ifsc_code: (() => {
      const code = nullVal(raw.ifsc_code ?? raw.ifscCode ?? raw.ifsc);
      return code ? code.toUpperCase() : null;
    })(),
    invoice_filename: fileName || null,
    vendor_name: resolveSupplierName(raw),
    seller_name: resolveSupplierName(raw),
    item_name: nullVal(firstLineItem?.product ?? firstLineItem?.productDescription),
    lineItems,
    extraction: raw,
    _source_fields: {},
  };
}



/** Map → sale EPR row + lineItems */

export function mapSaleFromOcr(raw, fileName, sNo = 1) {

  const x = expandRawExtraction(raw);

  const lineItems = mapProductsToLineItems(x.products);

  const first = firstLine(lineItems);

  const qty = sumMtFromLines(lineItems) || qtyToMt(raw.quantitySoldMt ?? raw.quantityMt, 'MT');

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

    state: nullVal(resolveState(x.state, x.buyerGst || x.gstNumber)),

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

    financial_year: nullVal(resolveFinancialYear(x.invoiceDate, x.financialYear)),

    item_name: nf(first?.productDescription),

    quantity: qty,

    unit: 'MT',

    total_amount: x.totalInvoiceAmount,

    hsn_code: nf(first?.hsn),

    lineItems,

    extraction: x,

    _source_fields: {},

    doc_status: 'inbox',

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

    const sellerName = nf(qrData.SellerNm || qrData.SellerName || qrData.sellerName);
    if (sellerName) {
      out.supplier_name = sellerName;
      out.vendor_name = sellerName;
      out.seller_name = sellerName;
      mark('supplier_name');
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

      out.irn_no = irn;

      mark('irn_no');

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


