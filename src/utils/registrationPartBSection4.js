import { getImporterReportingFinancialYears } from '../../shared/financialYearScope.js';
import {
  buildPartBSection4FromRecords,
  partBSection4HasData,
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
      reportingYears: getImporterReportingFinancialYears(),
      hasData: false,
    };
  }

  const [purchases, sales, companies] = await Promise.all([
    window.pwp.purchases.getAll(),
    window.pwp.sales.getAll(),
    window.pwp.companies?.getAll?.() ?? [],
  ]);

  const companyId = resolveCompanyIdFromGstin(companies, gstin);
  const reportingYears = getImporterReportingFinancialYears();
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
  const years = getImporterReportingFinancialYears();
  const expectedCount = operatingStates.length * years.length;
  if ((existing || []).length !== expectedCount) return true;
  return !partBSection4HasData(existing);
}

export {
  validateSection4AgainstPlasticConsumed,
  formatSection4PartAIssue,
} from '../../shared/partBSection4.js';

export function mergePartBSection4ForOperatingStates(existing = [], computed = [], operatingStates = []) {
  const reportingYears = getImporterReportingFinancialYears();
  return syncPartBSection4Structure({
    operatingStates,
    reportingYears,
    existing,
    computed,
  });
}
