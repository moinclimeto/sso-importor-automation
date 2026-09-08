import {
  financialYearStartYearFromDate,
  formatFinancialYear,
  resolveFinancialYear,
  isValidFinancialYear,
} from './procurementConversionFactor.js';

/** Last two Indian FYs for Importer EPR reporting: previous + current. */
export function getImporterReportingFinancialYears(asOfDate = new Date()) {
  const currentStart = financialYearStartYearFromDate(asOfDate);
  const previousStart = currentStart - 1;
  return [formatFinancialYear(previousStart), formatFinancialYear(currentStart)];
}

/** CPCB Part A 3c grid shows the two FY rows ending before the current FY. */
export function getCpcbPortalPartA3cYears(asOfDate = new Date()) {
  const currentStart = financialYearStartYearFromDate(asOfDate);
  return [
    formatFinancialYear(currentStart - 2),
    formatFinancialYear(currentStart - 1),
  ];
}

export function isFinancialYearInScope(fy, scopeYears = []) {
  if (!fy || !isValidFinancialYear(fy)) return false;
  return scopeYears.includes(String(fy).trim());
}

export function resolveRecordFinancialYear(row, docType = 'purchase') {
  const date =
    docType === 'purchase'
      ? row.procurement_date || row.invoice_date || ''
      : row.invoice_date || '';
  return resolveFinancialYear(date, row.financial_year) || '';
}

export { resolveFinancialYear, formatFinancialYear, financialYearStartYearFromDate };
