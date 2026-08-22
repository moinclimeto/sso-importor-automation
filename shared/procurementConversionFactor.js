/** Shared procurement CF / MT logic (Climeto-aligned). */

export const CF_MODE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'manual', label: 'Manual' },
  { value: 'conversion_factor', label: 'Auto-Master' },
  { value: 'auto_function', label: 'Auto-Function' },
];

export const CF_SETUP_OPTION_VALUE = '__cf_setup__';

/** Standard invoice UOM choices (Climeto-aligned). */
export const UOM_OPTIONS = [
  'kg', 'gm', 'Ton', 'Piece', 'PC', 'PCS', 'Liters', 'Kg', 'Qtl', 'Meter', 'Liter', 'Nos', 'Box', 'Roll', 'Bag',
];

export function resolveUomSelectOptions(currentUnit) {
  const cur = String(currentUnit ?? '').trim();
  if (!cur) return UOM_OPTIONS;
  const exists = UOM_OPTIONS.some((o) => o.toLowerCase() === cur.toLowerCase());
  return exists ? UOM_OPTIONS : [cur, ...UOM_OPTIONS];
}

export const LINE_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'completed', label: 'Completed' },
];

export const CONVERSION_METHOD = {
  DEFAULT: 'default',
  MANUAL: 'manual',
  AUTO_MASTER: 'auto_master',
  AUTO_FUNCTION: 'auto_function',
};

export const CONVERSION_METHOD_LABELS = {
  [CONVERSION_METHOD.DEFAULT]: 'Default',
  [CONVERSION_METHOD.MANUAL]: 'Manual',
  [CONVERSION_METHOD.AUTO_MASTER]: 'Auto-Master',
  [CONVERSION_METHOD.AUTO_FUNCTION]: 'Auto-Function',
};

const WEIGHT_UNITS = new Set([
  'kg', 'kgs', 'kilogram', 'kilograms', 'g', 'gm', 'gram', 'grams',
  'qtl', 'quintal', 'q', 'mt', 'ton', 'tons', 'tonne', 'tonnes', 't',
]);

export function getConversionMethodLabel(method) {
  return CONVERSION_METHOD_LABELS[method] || method || '—';
}

export function isWeightUom(unit) {
  const u = String(unit ?? '').trim().toLowerCase();
  return WEIGHT_UNITS.has(u);
}

/** Piece / count UOMs — cannot treat qty as MT without conversion factor or explicit weight. */
export function isCountUom(unit) {
  const u = String(unit ?? '').trim().toLowerCase();
  if (!u) return false;
  if (isWeightUom(u)) return false;
  if (['meter', 'meters', 'metre', 'metres', 'mtr', 'm', 'liter', 'litre', 'liters', 'litres', 'ltr', 'l'].includes(u)) {
    return false;
  }
  return true;
}

/** Detect OCR rows where piece count was wrongly copied into valueInMt / processedQuantity. */
function isLikelyCountStoredAsMt(item, unit, qty) {
  if (isCountUom(unit)) return true;
  const qtyNum = parseNum(qty);
  const stored = parseNum(
    item.valueInMt ?? item.processed_quantity ?? item.processedQuantity,
  );
  if (stored == null || qtyNum == null || stored <= 0) return false;
  if (!String(unit ?? '').trim() && Math.abs(stored - qtyNum) < 1e-6) return true;
  return false;
}

export function unitForProcessedQuantityMt(unitInInvoice) {
  const t = String(unitInInvoice ?? '').trim();
  if (!t || t === '-') return 'Ton';
  return t;
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Split combined qty strings like "24 PC", "50 Box", "24PCS" into quantity + UOM. */
export function parseQuantityAndUnit(quantity, unit) {
  const unitStr = String(unit ?? '').trim();
  if (unitStr && unitStr !== '-') {
    const qtyStr = String(quantity ?? '').trim().replace(/,/g, '');
    return { quantity: qtyStr, unit: unitStr };
  }

  let raw = String(quantity ?? '').trim();
  if (!raw || raw === '-') return { quantity: '', unit: '' };

  if (raw.startsWith('{')) {
    try {
      const o = JSON.parse(raw);
      const q = o?.value ?? o?.quantity ?? o?.qty ?? '';
      const u = o?.unit ?? o?.uom ?? o?.UOM ?? '';
      if (u) return { quantity: String(q).trim(), unit: String(u).trim() };
      raw = String(q).trim();
    } catch {
      /* fall through */
    }
  }

  raw = raw.replace(/,/g, '');

  const patterns = [
    /^([\d.]+)\s*(MT|Tons?|Tonnes?|KG|KGS|Kg|kgs|GM|G|PC|PCS|Pcs|NOS|Nos|Box|BOX|Roll|ROLL|Bag|BAG|Set|SET|Unit|UNIT|Ltr|LTR|Liter|Liters|Meter|MTR|Mtr|Qtl|QTL)$/i,
    /^([\d.]+)\s+([A-Za-z][A-Za-z0-9.\-/]{0,14})$/,
    /^([\d.]+)([A-Za-z]{1,12})$/,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (m) {
      return { quantity: m[1], unit: m[2] };
    }
  }

  return { quantity: raw, unit: '' };
}

export function normalizeLineUom(item = {}) {
  const parsed = parseQuantityAndUnit(
    item.quantity ?? item.qty ?? item.q,
    item.unit ?? item.unitInInvoice ?? item.uom ?? item.UOM ?? item.quantity_unit,
  );
  return {
    quantity: parsed.quantity,
    unit: parsed.unit,
    uom: parsed.unit,
    unitInInvoice: parsed.unit,
  };
}

export function normalizeCfBaseSource(v) {
  const s = String(v ?? 'quantity').trim().toLowerCase();
  if (s === 'sub_total' || s === 'sub-total' || s === 'subtotal') return 'subtotal';
  if (s === 'gst' || s === 'gst_paid' || s === 'gstpaid') return 'gst_paid';
  if (s === 'total' || s === 'line_total') return 'total';
  if (s === 'manual' || s === 'random') return 'manual';
  if (s === 'quantity' || s === 'qty') return 'quantity';
  return 'quantity';
}

export function resolveCfBaseNumber({
  cfBaseSource,
  quantity,
  lineAmount,
  lineGstAmount,
  cfManualBase,
}) {
  const src = normalizeCfBaseSource(cfBaseSource);
  const parseMoney = (val) => {
    if (val == null || val === '' || val === '-') return null;
    const n = parseFloat(String(val).replace(/,/g, '').replace(/[₹$€£]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const parseQtyLike = (q) => {
    if (q == null || q === '' || q === '-') return null;
    if (typeof q === 'number' && Number.isFinite(q) && q > 0) return q;
    const n = parseFloat(String(q).replace(/,/g, '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  if (src === 'manual') {
    const m = parseMoney(cfManualBase);
    return m != null && m > 0 ? m : null;
  }
  if (src === 'quantity') return parseQtyLike(quantity);
  if (src === 'subtotal') {
    const a = parseMoney(lineAmount);
    return a != null && a > 0 ? a : null;
  }
  if (src === 'gst_paid') {
    const g = parseMoney(lineGstAmount);
    return g != null && g > 0 ? g : null;
  }
  if (src === 'total') {
    const a = parseMoney(lineAmount);
    const g = parseMoney(lineGstAmount);
    if (a != null && g != null) return a + g;
    if (a != null && a > 0) return a;
    if (g != null && g > 0) return g;
    return null;
  }
  return null;
}

/** Evaluate Auto-Function formula (result in MT). Variables: gst, amount, quantity, rate, total. */
export function evaluateCfFormula(formula, ctx = {}) {
  const raw = String(formula ?? '').trim();
  if (!raw) return null;

  const gst = parseNum(ctx.lineGstAmount ?? ctx.gstPaid ?? ctx.gst);
  const amount = parseNum(ctx.lineAmount ?? ctx.amount);
  const quantity = parseNum(ctx.quantity ?? ctx.qty);
  const rate = parseNum(ctx.lineRate ?? ctx.rate);
  const total =
    amount != null && gst != null ? amount + gst : amount ?? gst ?? null;

  const replacements = [
    ['gst_paid', gst],
    ['subtotal', amount],
    ['sub_total', amount],
    ['amount', amount],
    ['quantity', quantity],
    ['qty', quantity],
    ['rate', rate],
    ['total', total],
    ['gst', gst],
  ];

  let expr = raw.toLowerCase();
  for (const [name, val] of replacements) {
    if (val == null) continue;
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(val));
  }

  if (/[a-z_]/i.test(expr)) return null;
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;

  try {
    const result = Function(`"use strict"; return (${expr})`)();
    const n = typeof result === 'number' && Number.isFinite(result) ? result : null;
    return n != null && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function convertQuantityToMT(value, unit, kgPerMeter = null, kgPerLiter = null) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  let valStr = String(value).replace(/,/g, '');
  const num = parseFloat(valStr.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num)) return null;

  let effectiveUnit = unit;
  if (!effectiveUnit || String(effectiveUnit).trim() === '' || effectiveUnit === '-') {
    const lower = valStr.toLowerCase();
    if (/\b(qtl|quintals?|q)\b/i.test(lower)) effectiveUnit = 'Qtl';
    else if (/\b(mt|tons?|tonnes?|t)\b/i.test(lower)) effectiveUnit = 'MT';
    else if (/\b(kgs?|kilograms?)\b/i.test(lower)) effectiveUnit = 'Kg';
    else if (/\b(ltrs?|liters?|litres?|l)\b/i.test(lower)) effectiveUnit = 'Ltr';
    else effectiveUnit = 'Ton';
  }

  const u = String(effectiveUnit || 'Ton').trim().toLowerCase();
  if (['ton', 'mt', 'tonne', 'tonnes', 't'].includes(u)) return num;
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(u)) return num / 1000;
  if (['qtl', 'quintal', 'quintals', 'q'].includes(u)) return num / 10;
  if (['gram', 'g', 'gm', 'grams'].includes(u)) return num / 1_000_000;
  if (['ltr', 'liter', 'litre', 'liters', 'litres', 'l'].includes(u)) {
    const factor = parseNum(kgPerLiter);
    if (factor != null && factor > 0) return (num * factor) / 1000;
    return null;
  }
  if (['meter', 'meters', 'metre', 'metres', 'mtr', 'm'].includes(u)) {
    const factor = parseNum(kgPerMeter);
    if (factor != null && factor > 0) return (num * factor) / 1000;
    return null;
  }
  return null;
}

export function deriveProcessedQuantityMT({
  quantity,
  unitInInvoice,
  quantityDerivationType = 'default',
  constantWeight = null,
  conversionFactor = null,
  kgPerMeter = null,
  kgPerLiter = null,
  manualProcessedQuantity = null,
  cfBaseSource = null,
  lineAmount = null,
  lineRate = null,
  lineGstAmount = null,
  cfManualBase = null,
  weightMt = null,
  cfFormula = null,
}) {
  const mode = String(quantityDerivationType || 'default').trim().toLowerCase();
  const unitEffective = unitForProcessedQuantityMt(unitInInvoice);
  const unitNorm = unitEffective.trim().toLowerCase();
  const isMeterUnit = ['meter', 'meters', 'metre', 'metres', 'mtr', 'm'].includes(unitNorm);
  const isLiterUnit = ['liter', 'litre', 'liters', 'litres', 'ltr', 'l'].includes(unitNorm);
  const meterFactorNum = parseNum(kgPerMeter);
  const literFactorNum = parseNum(kgPerLiter);

  const effectiveConstant = mode === 'default' ? constantWeight : null;
  const effectiveFactor = mode === 'conversion_factor' ? conversionFactor : null;
  const effectiveKgPerMeter = mode === 'default' ? kgPerMeter : null;
  const effectiveKgPerLiter = mode === 'default' ? kgPerLiter : null;
  const effectiveManual = mode === 'manual' ? manualProcessedQuantity : null;

  if (mode === 'manual') {
    const manual = parseNum(effectiveManual);
    return manual != null && manual > 0 ? manual : null;
  }

  if (mode === 'auto_function') {
    const fromFormula = evaluateCfFormula(cfFormula, {
      quantity,
      lineAmount,
      lineGstAmount,
      lineRate,
    });
    if (fromFormula != null) return fromFormula;
    return null;
  }

  if (isMeterUnit && (meterFactorNum == null || meterFactorNum <= 0)) return null;
  if (isLiterUnit && (literFactorNum == null || literFactorNum <= 0)) return null;

  if (mode === 'conversion_factor') {
    const base = resolveCfBaseNumber({
      cfBaseSource,
      quantity,
      lineAmount,
      lineRate,
      unitInInvoice,
      lineGstAmount,
      cfManualBase,
    });
    const factorKgPerUnit = isMeterUnit
      ? meterFactorNum
      : isLiterUnit
        ? literFactorNum
        : parseNum(effectiveFactor);
    if (base == null || factorKgPerUnit == null || base <= 0 || factorKgPerUnit <= 0) {
      return null;
    }
    return (base * factorKgPerUnit) / 1000;
  }

  const weightFromLine = parseNum(weightMt);
  if (weightFromLine != null && weightFromLine > 0) return weightFromLine;

  // PC / Box / Nos etc. — never treat invoice qty as MT unless CF or weight is set above.
  if (mode === 'default' && isCountUom(unitInInvoice)) {
    return null;
  }

  const constantMt = parseNum(effectiveConstant);
  if (constantMt != null && constantMt > 0) return constantMt;

  return convertQuantityToMT(quantity, unitEffective, effectiveKgPerMeter, effectiveKgPerLiter);
}

export function buildProductMatchKey(productDescription, hsn) {
  const desc = String(productDescription ?? '').trim().toLowerCase();
  const h = String(hsn ?? '').trim().replace(/\D/g, '');
  return `${desc}::${h}`;
}

export function lookupPackagingMasterRow(rows = [], line, listType = 'gpl') {
  const key = buildProductMatchKey(
    line.productDescription ?? line.product ?? line.item_name,
    line.hsn ?? line.hsn_code,
  );
  return rows.find(
    (r) =>
      String(r.list_type || '').toLowerCase() === listType.toLowerCase() &&
      r.product_match_key === key &&
      r.is_active !== 0,
  );
}

/** Only auto-apply packaging master on first pass — never overwrite saved/manual CF. */
export function shouldAutoApplyPackagingMaster(draft = {}) {
  const mode = String(draft.quantityDerivationType || 'default').trim().toLowerCase();
  if (mode !== 'default') return false;
  if (parseNum(draft.conversionFactorApplied || draft.conversionFactor) > 0) return false;
  if (String(draft.conversionMethodUsed || '').toLowerCase() === CONVERSION_METHOD.MANUAL) return false;
  if (parseNum(draft.processedQuantity) > 0 && draft.masterSource && draft.masterSource !== 'none') {
    return false;
  }
  return true;
}

export function applyPackagingMasterToDraft(draft, masterRow) {
  if (!masterRow) return draft;
  const cf = parseNum(masterRow.conversion_factor);
  const cfBase = normalizeCfBaseSource(masterRow.cf_base_source || 'quantity');
  const patch = {
    ...draft,
    plasticCategory: masterRow.plastic_category || draft.plasticCategory,
    plasticMaterial: masterRow.plastic_material || draft.plasticMaterial,
    otherPlasticMaterial: masterRow.other_plastic_material || draft.otherPlasticMaterial,
    recycledPercent: masterRow.recycled_percent ?? draft.recycledPercent,
    hsn: masterRow.hsn || draft.hsn,
    unit: masterRow.uom || draft.unit,
    masterSource: 'auto_master',
    quantityDerivationType: cf != null && cf > 0 ? 'conversion_factor' : draft.quantityDerivationType,
    conversionMethodUsed: cf != null && cf > 0 ? CONVERSION_METHOD.AUTO_MASTER : draft.conversionMethodUsed,
    conversionFactor: cf != null && cf > 0 ? String(cf) : draft.conversionFactor,
    conversionFactorApplied: cf != null && cf > 0 ? String(cf) : draft.conversionFactorApplied,
    cfBaseSource: cfBase,
  };
  const mt = deriveProcessedQuantityMT({
    quantity: patch.quantity,
    unitInInvoice: patch.unit,
    quantityDerivationType: patch.quantityDerivationType,
    conversionFactor: patch.conversionFactor,
    cfBaseSource: patch.cfBaseSource,
    lineAmount: patch.amount,
    lineGstAmount: patch.gstPaid,
    weightMt: patch.weight_mt,
  });
  if (mt != null) {
    patch.processedQuantity = String(Number(mt.toFixed(6)));
    patch.valueInMt = patch.processedQuantity;
  }
  return patch;
}

export function resolveLineMt(draft) {
  const mt = deriveProcessedQuantityMT({
    quantity: draft.quantity,
    unitInInvoice: draft.unit,
    quantityDerivationType: draft.quantityDerivationType || 'default',
    conversionFactor: draft.conversionFactorApplied || draft.conversionFactor,
    cfBaseSource: draft.cfBaseSource || 'quantity',
    lineAmount: draft.amount,
    lineGstAmount: draft.gstPaid,
    lineRate: draft.rate,
    manualProcessedQuantity: draft.processedQuantity,
    weightMt: draft.weight_mt,
    kgPerMeter: draft.kgPerMeter,
    kgPerLiter: draft.kgPerLiter,
    constantWeight: draft.constantWeight,
    cfFormula: draft.cfFormula ?? draft.cf_formula,
  });
  return mt != null ? Number(mt.toFixed(6)) : null;
}

/** Unit rate from OCR/invoice line fields, or derived from amount ÷ quantity. */
export function resolveLineRate(item = {}, quantity = null, amount = null) {
  const direct = parseNum(
    item.rate ??
      item.unit_rate ??
      item.unitRate ??
      item.price ??
      item.unit_price ??
      item.unitPrice ??
      item.mrp ??
      item.basic_rate ??
      item.basicRate ??
      item.rate_per_unit ??
      item.ratePerUnit ??
      item.r,
  );
  if (direct != null && direct >= 0) return direct;

  const amt = parseNum(
    amount ?? item.amount ?? item.a ?? item.taxable_amount ?? item.taxableAmount ?? item.taxable_value,
  );
  const qty = parseNum(quantity ?? item.quantity ?? item.qty ?? item.q);
  if (amt != null && qty != null && qty > 0) {
    return Number((amt / qty).toFixed(4));
  }
  return null;
}

export function formatLineRate(rate) {
  if (rate == null || rate === '') return '';
  const n = parseNum(rate);
  if (n == null) return String(rate).trim();
  return n.toLocaleString('en-IN', { maximumFractionDigits: 4 });
}

export function itemToLineDraft(item, idx = 0) {
  const weightRaw = item.weight ?? item.total_weight ?? item.net_weight ?? null;
  const weightUnit = item.weight_unit ?? item.weightUnit ?? 'kg';
  let weightMt = parseNum(item.weight_mt ?? item.weightMt);
  if ((weightMt == null || weightMt <= 0) && weightRaw != null && String(weightRaw).trim() !== '') {
    weightMt = deriveProcessedQuantityMT({
      quantity: weightRaw,
      unitInInvoice: weightUnit,
      quantityDerivationType: 'default',
    });
  }

  const qtyRaw = item.quantity ?? item.qty ?? '';
  const uomFields = normalizeLineUom(item);
  const qty = uomFields.quantity || (qtyRaw !== null && qtyRaw !== undefined ? String(qtyRaw) : '');
  const unit = uomFields.unit;
  const qtyNum = parseNum(qty);
  const amount =
    parseNum(item.amount ?? item.a) ??
    null;
  const rateVal = resolveLineRate(item, qty, amount);
  const resolvedAmount =
    amount ??
    (qtyNum != null && rateVal != null ? Number((qtyNum * rateVal).toFixed(2)) : null);

  const cfMode = String(
    item.quantityDerivationType ?? item.quantity_derivation_type ?? 'default',
  ).trim().toLowerCase();
  const hasCf =
    parseNum(item.conversionFactorApplied ?? item.conversion_factor_applied) > 0 ||
    parseNum(item.conversionFactor ?? item.conversion_factor) > 0;
  const trustStoredMt =
    !isLikelyCountStoredAsMt(item, unit, qty) &&
    (cfMode === 'manual' ||
      cfMode === 'conversion_factor' ||
      cfMode === 'auto_function' ||
      hasCf ||
      !isCountUom(unit));

  let processedQuantity = '';
  if (trustStoredMt) {
    processedQuantity =
      item.processedQuantity ??
      item.processed_quantity ??
      item.valueInMt ??
      (weightMt != null ? String(weightMt) : '');
  } else if (weightMt != null) {
    processedQuantity = String(weightMt);
  }

  const draft = {
    lineNo: item.lineNo ?? item.line_no ?? idx + 1,
    productDescription: item.productDescription ?? item.product ?? item.item_name ?? '',
    hsn: item.hsn ?? item.hsn_code ?? '',
    unit,
    uom: unit,
    unitInInvoice: unit,
    quantity: qty !== null && qty !== undefined ? String(qty) : '',
    rate: rateVal != null ? formatLineRate(rateVal) : '',
    gstPaid: item.gstPaid ?? item.gst_amount ?? item.gst ?? '',
    amount: resolvedAmount != null ? String(resolvedAmount) : item.amount != null ? String(item.amount) : '',
    weight: weightRaw != null ? String(weightRaw) : '',
    weight_unit: weightUnit,
    weight_mt: weightMt,
    quantityDerivationType: cfMode || 'default',
    conversionMethodUsed:
      item.conversionMethodUsed ?? item.conversion_method_used ?? CONVERSION_METHOD.DEFAULT,
    conversionFactor: item.conversionFactor ?? item.conversion_factor ?? '',
    conversionFactorApplied:
      item.conversionFactorApplied ?? item.conversion_factor_applied ?? '',
    cfBaseSource: normalizeCfBaseSource(item.cfBaseSource ?? item.cf_base_source ?? 'quantity'),
    cfFormula: item.cfFormula ?? item.cf_formula ?? '',
    processedQuantity,
    lineStatus: item.lineStatus ?? item.line_status ?? 'incomplete',
    plasticCategory: item.plasticCategory ?? item.category_of_plastic ?? '',
    plasticMaterial: item.plasticMaterial ?? item.plastic_material ?? item.plastic_type ?? '',
    otherPlasticMaterial: item.otherPlasticMaterial ?? item.other_plastic_material ?? '',
    recycledPercent: item.recycledPercent ?? item.recycled_plastic_percent ?? '',
    masterSource: item.masterSource ?? item.master_source ?? 'none',
  };

  const mt = resolveLineMt(draft);
  const mode = String(draft.quantityDerivationType || 'default').trim().toLowerCase();
  if (mode === 'manual') {
    const manual = parseNum(draft.processedQuantity);
    if (manual != null && manual > 0) {
      draft.processedQuantity = String(manual);
    }
  } else if (mt != null) {
    draft.processedQuantity = String(mt);
  } else if (isCountUom(unit) && cfMode === 'default' && !hasCf) {
    draft.processedQuantity = '';
  }
  return draft;
}

export function lineDraftToPersist(draft) {
  const mode = String(draft.quantityDerivationType || 'default').trim().toLowerCase();
  const mt =
    mode === 'manual'
      ? parseNum(draft.processedQuantity)
      : resolveLineMt(draft);
  const persistMt = mt != null && mt > 0 ? mt : null;
  return {
    lineNo: draft.lineNo,
    product: draft.productDescription,
    productDescription: draft.productDescription,
    hsn: draft.hsn,
    hsn_code: draft.hsn,
    unit: draft.unit,
    uom: draft.unit,
    unitInInvoice: draft.unit,
    unit_in_invoice: draft.unit,
    quantity: draft.quantity,
    rate: draft.rate,
    gstPaid: draft.gstPaid,
    gst_amount: draft.gstPaid,
    amount: draft.amount,
    weight: draft.weight || null,
    weight_unit: draft.weight_unit,
    weight_mt: mode === 'manual' ? persistMt : (draft.weight_mt ?? persistMt),
    valueInMt: persistMt ?? parseNum(draft.processedQuantity),
    quantityDerivationType: mode === 'manual' ? 'manual' : draft.quantityDerivationType,
    quantity_derivation_type: mode === 'manual' ? 'manual' : draft.quantityDerivationType,
    conversionMethodUsed:
      mode === 'manual' ? CONVERSION_METHOD.MANUAL : draft.conversionMethodUsed,
    conversion_method_used:
      mode === 'manual' ? CONVERSION_METHOD.MANUAL : draft.conversionMethodUsed,
    conversionFactor: draft.conversionFactor,
    conversion_factor: draft.conversionFactor,
    conversionFactorApplied: draft.conversionFactorApplied,
    conversion_factor_applied: draft.conversionFactorApplied,
    cfBaseSource: draft.cfBaseSource,
    cf_base_source: draft.cfBaseSource,
    processedQuantity: persistMt != null ? String(persistMt) : draft.processedQuantity,
    processed_quantity: persistMt != null ? String(persistMt) : draft.processedQuantity,
    lineStatus: draft.lineStatus,
    line_status: draft.lineStatus,
    plasticCategory: draft.plasticCategory,
    category_of_plastic: draft.plasticCategory,
    plasticMaterial: draft.plasticMaterial,
    plastic_material: draft.plasticMaterial,
    plastic_type: draft.plasticMaterial,
    otherPlasticMaterial: draft.otherPlasticMaterial,
    other_plastic_material: draft.otherPlasticMaterial,
    recycledPercent: draft.recycledPercent,
    recycled_plastic_percent: draft.recycledPercent,
    masterSource: mode === 'manual' ? (draft.masterSource || 'manual') : draft.masterSource,
    master_source: mode === 'manual' ? (draft.masterSource || 'manual') : draft.masterSource,
    cfFormula: draft.cfFormula ?? draft.cf_formula ?? '',
    cf_formula: draft.cfFormula ?? draft.cf_formula ?? '',
  };
}

/** Normalize line MT + header total before save (single source of truth). */
export function syncRecordMtFromLines(data = {}, docType = 'purchase') {
  const rawItems = data.lineItems ?? data.line_items ?? [];
  if (!Array.isArray(rawItems) || !rawItems.length) return data;

  const drafts = rawItems.map((li, i) => itemToLineDraft(li, i));
  const normalizedLines = drafts.map((d) => lineDraftToPersist(d));
  const totalMt = sumLineProcessedMt(drafts);

  const next = { ...data, lineItems: normalizedLines, line_items: normalizedLines };
  if (totalMt != null && totalMt > 0) {
    if (docType === 'purchase') {
      next.quantity_mt = totalMt;
      next.quantity = totalMt;
    } else {
      next.quantity_sold_mt = totalMt;
      next.quantity = totalMt;
    }
  }
  return next;
}

export function sumLineProcessedMt(lineDrafts = []) {
  let sum = 0;
  let has = false;
  for (const d of lineDrafts) {
    const mt = resolveLineMt(d);
    if (mt != null && mt > 0) {
      sum += mt;
      has = true;
    }
  }
  return has ? Number(sum.toFixed(6)) : null;
}

export function parseRecordLineItems(row = {}) {
  let items = row.line_items ?? row.lineItems ?? [];
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  return Array.isArray(items) ? items : [];
}

/** Single MT total for a record: line QTY MT sum when lines exist, else stored header. */
export function resolveRecordTotalMt(row, docType = 'sale') {
  const lines = parseRecordLineItems(row);
  if (lines.length) {
    const sum = sumLineProcessedMt(lines.map((li, i) => itemToLineDraft(li, i)));
    if (sum != null && sum > 0) return sum;
  }
  const raw =
    docType === 'purchase'
      ? row.quantity_mt ?? row.quantity
      : row.quantity_sold_mt ?? row.quantity;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** When header MT was corrected manually, sync persisted line items so reports and reload stay consistent. */
export function reconcilePersistedLinesToHeaderMt(persistedLines = [], lineDrafts = [], headerMt) {
  const computed = sumLineProcessedMt(lineDrafts);
  if (
    !Number.isFinite(headerMt) ||
    headerMt <= 0 ||
    computed == null ||
    Math.abs(headerMt - computed) <= 0.0001 ||
    !persistedLines.length
  ) {
    return persistedLines;
  }

  if (persistedLines.length === 1) {
    const mt = Number(Number(headerMt).toFixed(6));
    return persistedLines.map((li) => ({
      ...li,
      processedQuantity: String(mt),
      processed_quantity: String(mt),
      weight_mt: mt,
      valueInMt: mt,
      quantityDerivationType: 'manual',
      quantity_derivation_type: 'manual',
      conversionMethodUsed: CONVERSION_METHOD.MANUAL,
      conversion_method_used: CONVERSION_METHOD.MANUAL,
    }));
  }

  const ratio = headerMt / computed;
  return persistedLines.map((li, i) => {
    const draftMt = resolveLineMt(lineDrafts[i]);
    if (draftMt == null || draftMt <= 0) return li;
    const mt = Number((draftMt * ratio).toFixed(6));
    return {
      ...li,
      processedQuantity: String(mt),
      processed_quantity: String(mt),
      weight_mt: mt,
      valueInMt: mt,
      quantityDerivationType: li.quantityDerivationType || li.quantity_derivation_type || 'manual',
      quantity_derivation_type: li.quantity_derivation_type || li.quantityDerivationType || 'manual',
    };
  });
}

export function sumLineGst(lineDrafts = []) {
  let sum = 0;
  let has = false;
  for (const d of lineDrafts) {
    const g = parseNum(d.gstPaid);
    if (g != null && g > 0) {
      sum += g;
      has = true;
    }
  }
  return has ? Number(sum.toFixed(2)) : null;
}

export function financialYearFromDate(isoDate) {
  if (!isoDate) return '';
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month >= 4) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

export function isValidFinancialYear(value) {
  const v = String(value ?? '').trim();
  if (!v || v.toLowerCase() === 'all') return false;
  return /^\d{4}-\d{2}$/.test(v);
}

/** Prefer FY derived from document date; ignore upload filters like "all". */
export function resolveFinancialYear(date, stored) {
  const fromDate = financialYearFromDate(date);
  if (fromDate) return fromDate;
  return isValidFinancialYear(stored) ? String(stored).trim() : '';
}

/** Calendar year when an Indian FY starts (Apr–Mar). */
export function financialYearStartYearFromDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return new Date().getFullYear();
  const year = d.getFullYear();
  return d.getMonth() >= 3 ? year : year - 1;
}

export function formatFinancialYear(startYear) {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/** FY labels newest-first, e.g. 2020 → 2020-21 … through current FY. */
export function buildFinancialYearOptions(fromStartYear = 2020, toStartYear = null) {
  const end = toStartYear ?? financialYearStartYearFromDate();
  const options = [];
  for (let y = end; y >= fromStartYear; y--) {
    options.push(formatFinancialYear(y));
  }
  return options;
}

export const FINANCIAL_YEAR_OPTIONS = buildFinancialYearOptions(2020);

export function recalcLineOnCfModeChange(draft, mode) {
  const next = { ...draft, quantityDerivationType: mode };
  if (mode === 'manual') {
    next.conversionMethodUsed = CONVERSION_METHOD.MANUAL;
    next.masterSource = next.masterSource || 'manual';
    next.conversionFactorApplied = '';
    next.conversionFactor = '';
    return next;
  }
  if (mode === 'default') {
    next.conversionMethodUsed = CONVERSION_METHOD.DEFAULT;
    next.conversionFactorApplied = '';
  }
  const mt = resolveLineMt(next);
  if (mt != null) {
    next.processedQuantity = String(mt);
    next.valueInMt = String(mt);
  }
  return next;
}
