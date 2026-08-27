import {
  buildSec5bFromPurchases,
  buildSec5dFromSales,
  buildSec5bRowFromPurchase,
  buildSec5dRowFromSale,
  mergeSec5bRows,
  mergeSec5dRows,
  normalizeSec5bRowForPortal,
  normalizeSec5dRowForPortal,
  sec5bRowHasData,
  sec5dRowHasData,
} from '../../shared/partBSection5.js';
import { resolveCompanyIdFromGstin } from './registrationPlasticConsumed.js';

export async function fetchComputedPartBSection5({
  gstin = '',
  docStatus = 'all',
} = {}) {
  if (!window.pwp?.purchases?.getAll || !window.pwp?.sales?.getAll) return null;

  const [purchases, sales, companies] = await Promise.all([
    window.pwp.purchases.getAll(),
    window.pwp.sales.getAll(),
    window.pwp.companies?.getAll?.() ?? [],
  ]);

  const companyId = resolveCompanyIdFromGstin(companies, gstin);
  const filters = { companyId, docStatus };
  const sec5b = buildSec5bFromPurchases(purchases || [], filters);
  const sec5d = buildSec5dFromSales(sales || [], filters);

  return {
    sec5b,
    sec5d,
    hasData: sec5b.some(sec5bRowHasData) || sec5d.some(sec5dRowHasData),
  };
}

/** @deprecated use fetchComputedPartBSection5 */
export async function fetchComputedPartBSection5b(args = {}) {
  const result = await fetchComputedPartBSection5(args);
  if (!result) return null;
  return {
    sec5b: result.sec5b,
    hasData: result.sec5b.some(sec5bRowHasData),
  };
}

export function mergePartBSection5b(existing = [], computed = []) {
  if (!existing.length) return computed;
  if (!computed.length) return existing;
  return mergeSec5bRows(existing, computed);
}

export function mergePartBSection5d(existing = [], computed = []) {
  if (!existing.length) return computed;
  if (!computed.length) return existing;
  return mergeSec5dRows(existing, computed);
}

export async function refreshSec5RowFromSource({
  secKey = 'sec5b',
  sourceRecordId = null,
  gstin = '',
} = {}) {
  if (!sourceRecordId || !window.pwp) return null;

  const [purchases, sales, companies] = await Promise.all([
    window.pwp.purchases?.getAll?.() ?? [],
    window.pwp.sales?.getAll?.() ?? [],
    window.pwp.companies?.getAll?.() ?? [],
  ]);
  const companyId = resolveCompanyIdFromGstin(companies, gstin);

  if (secKey === 'sec5b') {
    const purchase = (purchases || []).find((row) => String(row.id) === String(sourceRecordId));
    if (!purchase) return null;
    return normalizeSec5bRowForPortal(buildSec5bRowFromPurchase(purchase));
  }

  const sale = (sales || []).find((row) => String(row.id) === String(sourceRecordId));
  if (!sale) return null;
  return normalizeSec5dRowForPortal(buildSec5dRowFromSale(sale));
}
