import { getCpcbPortalPartA3cYears } from '../../shared/financialYearScope.js';
import {
  buildPartBSection4FromRecords,
  partBSection4HasData,
  remapLegacyPartBSection4Years,
  syncPartBSection4Structure,
} from '../../shared/partBSection4.js';
import { resolveCompanyIdFromGstin } from './registrationPlasticConsumed.js';

export async function fetchComputedPartBSection4({
  gstin = '',
  operatingStates = [],
  docStatus = 'published',
} = {}) {
  if (!window.pwp?.purchases?.getAll) return null;
  if (!operatingStates?.length) {
    return {
      groups: [],
      reportingYears: getCpcbPortalPartA3cYears(),
      hasData: false,
    };
  }

  const [purchases, sales, companies] = await Promise.all([
    window.pwp.purchases.getAll(),
    window.pwp.sales.getAll(),
    window.pwp.companies?.getAll?.() ?? [],
  ]);

  const companyId = resolveCompanyIdFromGstin(companies, gstin);
  const reportingYears = getCpcbPortalPartA3cYears();
  const groups = buildPartBSection4FromRecords({
    operatingStates,
    purchases: purchases || [],
    sales: sales || [],
    companyId,
    docStatus,
    reportingYears,
  });

  return {
    groups,
    reportingYears,
    hasData: partBSection4HasData(groups),
  };
}

export function shouldHydratePartBSection4(existing = [], operatingStates = []) {
  if (!operatingStates.length) return false;
  const years = getCpcbPortalPartA3cYears();
  const expectedCount = operatingStates.length * years.length;
  if ((existing || []).length !== expectedCount) return true;
  const hasOutOfScopeYear = (existing || []).some((group) => !years.includes(group.year));
  if (hasOutOfScopeYear) return true;
  return !partBSection4HasData(existing);
}

export {
  validateSection4AgainstPlasticConsumed,
  formatSection4PartAIssue,
} from '../../shared/partBSection4.js';

export function mergePartBSection4ForOperatingStates(existing = [], computed = [], operatingStates = []) {
  const reportingYears = getCpcbPortalPartA3cYears();
  return syncPartBSection4Structure({
    operatingStates,
    reportingYears,
    existing: remapLegacyPartBSection4Years(existing),
    computed,
  });
}

export { prunePartBSection4ForPortal } from '../../shared/partBSection4.js';
