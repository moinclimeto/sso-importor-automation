import {
  buildSec5bFromPurchases,
  buildSec5dFromSales,
  mergeSec5bRows,
  mergeSec5dRows,
  sec5bRowHasData,
  sec5dRowHasData,
} from '../../shared/partBSection5.js';
import { resolveCompanyIdFromGstin } from './registrationPlasticConsumed.js';

export async function fetchComputedPartBSection5({
  gstin = '',
  docStatus = 'published',
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
