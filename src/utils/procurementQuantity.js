/** Procurement line-item quantity & weight helpers (renderer + shared logic). */

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/\s/g, '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** True when qty unit is already a mass unit (kg / ton / MT). */
export function isWeightQuantityUnit(unit) {
  const u = String(unit || '').toLowerCase();
  return /\b(kg|kgs|kilogram|mt|ton|tonne|tonnes|t)\b/.test(u);
}

/** Convert weight value + unit → metric tons. Defaults to kg when unit missing. */
export function weightToMt(value, unit) {
  const n = parseNum(value);
  if (!n) return null;
  const u = String(unit || 'kg').toLowerCase();
  if (/\b(kg|kgs|kilogram)/.test(u)) return Number((n / 1000).toFixed(6));
  if (/\b(g|gram|grams)\b/.test(u)) return Number((n / 1_000_000).toFixed(6));
  if (/\b(mt|ton|tonne|tonnes|t)\b/.test(u)) return Number(n.toFixed(6));
  return Number((n / 1000).toFixed(6));
}

/** Line total weight in MT (from weight_mt or raw weight fields). */
export function lineWeightMt(item = {}) {
  const fromMt = parseNum(item.weight_mt);
  if (fromMt > 0) return fromMt;
  const raw = item.weight ?? item.total_weight ?? item.net_weight ?? null;
  if (raw == null || String(raw).trim() === '') return null;
  return weightToMt(raw, item.weight_unit ?? item.weightUnit ?? 'kg');
}

/** Sum of each line's TOTAL weight in MT (not piece count). */
export function sumLineWeightMt(lineItems = []) {
  let sum = 0;
  let has = false;
  for (const li of lineItems || []) {
    const w = lineWeightMt(li);
    if (w != null && w > 0) {
      sum += w;
      has = true;
    }
  }
  return has ? Number(sum.toFixed(6)) : null;
}

/** Convert line quantity + unit → MT when unit is kg/ton/MT. */
export function quantityToMt(qty, unit) {
  if (!isWeightQuantityUnit(unit)) return null;
  return weightToMt(qty, unit);
}

/** Sum numeric line item quantities (all units) — reference only for PC lines. */
export function sumLineQuantities(lineItems = []) {
  let sum = 0;
  let has = false;
  for (const li of lineItems || []) {
    const q = parseNum(li.quantity);
    if (q > 0) {
      sum += q;
      has = true;
    }
  }
  return has ? sum : null;
}

/** Sum quantities only for non-weight units (PC, NOS, etc.). */
export function sumNonWeightLineQuantities(lineItems = []) {
  let sum = 0;
  let has = false;
  for (const li of lineItems || []) {
    if (isWeightQuantityUnit(li.unit)) continue;
    const q = parseNum(li.quantity);
    if (q > 0) {
      sum += q;
      has = true;
    }
  }
  return has ? sum : null;
}

/**
 * Total plastic quantity (MT):
 * 1) Sum of each line's TOTAL weight (MT) — not per-piece, not piece count
 * 2) Else kg/ton qty lines → direct conversion
 * 3) Else PC/other with no weight → sum(pieces) ÷ conversion_factor
 */
export function calcTotalPlasticQuantityMt(lineItems = [], conversionFactor) {
  const weightTotal = sumLineWeightMt(lineItems);
  if (weightTotal != null) return weightTotal;

  let totalMt = 0;
  let hasWeightQty = false;
  for (const li of lineItems || []) {
    const q = parseNum(li.quantity);
    if (q <= 0 || !isWeightQuantityUnit(li.unit)) continue;
    const mt = quantityToMt(q, li.unit);
    if (mt != null && mt > 0) {
      totalMt += mt;
      hasWeightQty = true;
    }
  }
  if (hasWeightQty) return Number(totalMt.toFixed(6));

  const cf = parseNum(conversionFactor);
  const pieceSum = sumNonWeightLineQuantities(lineItems);
  if (pieceSum != null && cf > 0) {
    return Number((pieceSum / cf).toFixed(6));
  }

  return null;
}

/** Human-readable hint for total plastic quantity field. */
export function totalPlasticQuantityHint(lineItems = [], conversionFactor, totalMt) {
  const weightSum = sumLineWeightMt(lineItems);
  const pieceSum = sumNonWeightLineQuantities(lineItems);
  const cf = parseNum(conversionFactor);
  const parts = [];

  if (weightSum != null) {
    parts.push(`Sum of line total weights = ${totalMt ?? weightSum} MT`);
    return parts.join(' · ');
  }

  const hasWeightQty = (lineItems || []).some(
    (li) => isWeightQuantityUnit(li.unit) && parseNum(li.quantity) > 0
  );
  if (hasWeightQty) {
    parts.push('kg/ton lines → direct MT conversion');
  }
  if (pieceSum != null) {
    if (cf > 0) {
      parts.push(`${pieceSum} pieces ÷ ${cf} = ${totalMt ?? '—'} MT (no line weight on invoice)`);
    } else {
      parts.push('Enter line total weight (MT) or set conversion factor');
    }
  }
  return parts.length ? parts.join(' · ') : 'Sum of line total weights in MT';
}

/** Attach weight_mt on each line from raw weight fields (TOTAL line weight). */
export function enrichLineItemsWithWeightMt(lineItems = []) {
  return (lineItems || []).map((item) => {
    const weightRaw = item.weight ?? item.total_weight ?? item.net_weight ?? null;
    const weightUnit = item.weight_unit ?? item.weightUnit ?? 'kg';
    const existing = parseNum(item.weight_mt);
    const weightMt =
      existing > 0
        ? existing
        : weightRaw != null && String(weightRaw).trim() !== ''
          ? weightToMt(weightRaw, weightUnit)
          : null;
    return weightMt != null ? { ...item, weight_mt: weightMt } : { ...item };
  });
}
