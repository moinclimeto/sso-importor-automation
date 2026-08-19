/** Procurement line-item quantity helpers — delegates to shared CF logic. */
export {
  deriveProcessedQuantityMT,
  isWeightUom as isWeightQuantityUnit,
  resolveLineMt,
  sumLineProcessedMt,
  itemToLineDraft,
  lineDraftToPersist,
} from '../../shared/procurementConversionFactor.js';

import {
  deriveProcessedQuantityMT,
  isWeightUom,
  resolveLineMt,
  sumLineProcessedMt,
  itemToLineDraft,
} from '../../shared/procurementConversionFactor.js';

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function weightToMt(value, unit) {
  const mt = deriveProcessedQuantityMT({
    quantity: value,
    unitInInvoice: unit || 'kg',
    quantityDerivationType: 'default',
  });
  return mt != null && mt > 0 ? mt : null;
}

export function lineWeightMt(item = {}) {
  const draft = itemToLineDraft(item, 0);
  const resolved = resolveLineMt(draft);
  if (resolved != null && resolved > 0) return resolved;
  const raw = item.weight ?? item.total_weight ?? item.net_weight ?? null;
  if (raw == null || String(raw).trim() === '') return null;
  return weightToMt(raw, item.weight_unit ?? item.weightUnit ?? 'kg');
}

export function sumLineWeightMt(lineItems = []) {
  const drafts = (lineItems || []).map((li, i) => itemToLineDraft(li, i));
  return sumLineProcessedMt(drafts);
}

export function quantityToMt(qty, unit) {
  if (!isWeightUom(unit)) return null;
  return weightToMt(qty, unit);
}

export function calcTotalPlasticQuantityMt(lineItems = []) {
  const drafts = (lineItems || []).map((li, i) => itemToLineDraft(li, i));
  return sumLineProcessedMt(drafts);
}

export function totalPlasticQuantityHint(lineItems = []) {
  const total = calcTotalPlasticQuantityMt(lineItems);
  if (total != null) return `Sum of line Qty (MT) = ${total} MT`;
  return 'Enter line weights or set CF Mode per line';
}

export function enrichLineItemsWithWeightMt(lineItems = []) {
  return (lineItems || []).map((item, i) => {
    const draft = itemToLineDraft(item, i);
    const mt = resolveLineMt(draft);
    if (mt == null || mt <= 0) return { ...item, valueInMt: null, processedQuantity: '' };
    return { ...item, weight_mt: mt, valueInMt: mt, processedQuantity: String(mt) };
  });
}
