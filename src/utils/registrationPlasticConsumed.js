import { buildPlasticConsumed3cForReports } from '../../shared/plasticConsumed3cReports.js';
import {
  emptyPlasticConsumedYear,
  plasticConsumed3cHasData,
  prunePlasticConsumedForPortal,
} from '../../shared/plasticConsumed3c.js';
import { getCpcbPortalPartA3cYears } from '../../shared/financialYearScope.js';

export function resolveCompanyIdFromGstin(companies = [], gstin = '') {
  const normalized = String(gstin || '').trim().toUpperCase();
  if (!normalized) return null;
  const match = companies.find(
    (company) => String(company.gstin || '').trim().toUpperCase() === normalized,
  );
  return match?.id ?? null;
}

export function mergePlasticConsumedForReportingYears(computed = {}, reportingYears = []) {
  const merged = {};
  for (const fy of reportingYears) {
    merged[fy] = computed[fy]
      ? { ...emptyPlasticConsumedYear(), ...computed[fy] }
      : emptyPlasticConsumedYear();
  }
  return merged;
}

/** Same basis as MT Reports → section 3c tab, scoped to registration reporting FYs. */
export async function fetchComputedPlasticConsumed3c({
  gstin = '',
  savedImporter3a = null,
  docStatus = 'published',
} = {}) {
  if (!window.pwp?.purchases?.getAll) return null;

  const [purchases, sales, packagingRows, companies] = await Promise.all([
    window.pwp.purchases.getAll(),
    window.pwp.sales.getAll(),
    window.pwp.packagingMaster?.getAll?.() ?? [],
    window.pwp.companies?.getAll?.() ?? [],
  ]);

  const companyId = resolveCompanyIdFromGstin(companies, gstin);
  const computed = buildPlasticConsumed3cForReports({
    purchases: purchases || [],
    sales: sales || [],
    packagingRows: packagingRows || [],
    docStatus,
    financialYear: 'all',
    companyId,
    savedImporter3a,
  });

  const reportingYears = getCpcbPortalPartA3cYears();
  const plasticConsumed = mergePlasticConsumedForReportingYears(
    computed.plasticConsumed,
    reportingYears,
  );

  return {
    plasticConsumed: prunePlasticConsumedForPortal(plasticConsumed),
    reportingYears,
    source: computed.source,
    sourceLabel: computed.sourceLabel,
    hasData: plasticConsumed3cHasData(plasticConsumed),
  };
}

export function shouldHydratePlasticConsumed(saved = {}) {
  return !plasticConsumed3cHasData(saved);
}
