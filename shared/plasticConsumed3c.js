import { aggregateByFinancialYear } from './plasticMtAggregation.js';
import { PLASTIC_CATEGORIES } from './plasticCategories.js';
import { getCpcbPortalPartA3cYears } from './financialYearScope.js';

/** Keys used in registration forms / CPCB automation (cat1 … cat4). */
export const CATEGORY_3C_KEYS = {
  'Cat-I': 'cat1',
  'Cat-II': 'cat2',
  'Cat-III': 'cat3',
  'Cat-IV': 'cat4',
};

export const PLASTIC_CONSUMED_3C_COLUMNS = [
  { key: 'cat1', label: 'Rigid Plastic (Cat-I)', category: 'Cat-I' },
  { key: 'cat2', label: 'Flexible Plastic (Cat-II)', category: 'Cat-II' },
  { key: 'cat3', label: 'MLP (Cat-III)', category: 'Cat-III' },
  { key: 'cat4', label: 'Compostable Plastic (Cat-IV)', category: 'Cat-IV' },
];

/** Default CPCB new-application years (extended when data has other FYs). */
export const DEFAULT_3C_YEARS = ['2024-25', '2025-26'];

export function mtTo3cString(mt) {
  const n = Number(mt);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return String(Number(n.toFixed(4)));
}

export function emptyPlasticConsumedYear() {
  return { cat1: '0', cat2: '0', cat3: '0', cat4: '0' };
}

export function aggregateRowsToPlasticConsumed3c(fyRows = [], years = DEFAULT_3C_YEARS) {
  const result = {};
  for (const year of years) {
    result[year] = emptyPlasticConsumedYear();
  }

  for (const row of fyRows) {
    const fy = row.financial_year;
    if (!fy || fy === 'Unknown') continue;
    if (!result[fy]) result[fy] = emptyPlasticConsumedYear();
    for (const cat of PLASTIC_CATEGORIES) {
      const key = CATEGORY_3C_KEYS[cat];
      if (key) result[fy][key] = mtTo3cString(row[cat] || 0);
    }
  }

  return result;
}

export function resolvePlasticConsumed3cYears(fyRows = [], extraYears = DEFAULT_3C_YEARS) {
  const fromData = fyRows
    .map((row) => row.financial_year)
    .filter((fy) => fy && fy !== 'Unknown');
  const merged = new Set([...extraYears, ...fromData]);
  return Array.from(merged).sort((a, b) => b.localeCompare(a));
}

/**
 * Prepare section 3c values from procurement (purchase) records with packaging line MT.
 * Uses published purchases by default — same basis as MT Reports procurement view.
 */
export function buildPlasticConsumed3cFromPurchases(
  purchases = [],
  { docStatus = 'published', financialYear = 'all', companyId = null } = {},
) {
  let rows = purchases;
  if (companyId != null && companyId !== '') {
    const cid = Number(companyId);
    rows = rows.filter((row) => Number(row.company_id) === cid);
  }

  const fyRows = aggregateByFinancialYear(rows, 'purchase', { docStatus, financialYear });
  const years = resolvePlasticConsumed3cYears(fyRows);
  const plasticConsumed = aggregateRowsToPlasticConsumed3c(fyRows, years);

  return {
    plasticConsumed,
    fyRows,
    years,
    recordCount: rows.filter((row) => {
      if (docStatus && docStatus !== 'all' && (row.doc_status || 'inbox') !== docStatus) return false;
      return true;
    }).length,
  };
}

export function plasticConsumed3cHasData(plasticConsumed = {}) {
  return Object.values(plasticConsumed).some((yearRow) =>
    Object.values(yearRow || {}).some((val) => Number(val) > 0),
  );
}

/** Map saved 3c rows onto the FY rows visible on the CPCB portal grid. */
export function alignPlasticConsumedToYears(plasticConsumed = {}, targetYears = []) {
  const aligned = {};
  for (const fy of targetYears) {
    aligned[fy] = plasticConsumed?.[fy]
      ? { ...emptyPlasticConsumedYear(), ...plasticConsumed[fy] }
      : emptyPlasticConsumedYear();
  }
  return aligned;
}

export function prunePlasticConsumedForPortal(plasticConsumed = {}, asOfDate = new Date()) {
  return alignPlasticConsumedToYears(plasticConsumed, getCpcbPortalPartA3cYears(asOfDate));
}

export function mergePlasticConsumedYearSets(...yearLists) {
  const merged = new Set();
  for (const list of yearLists) {
    for (const fy of list || []) {
      if (fy) merged.add(String(fy).trim());
    }
  }
  return Array.from(merged).sort((a, b) => b.localeCompare(a));
}
