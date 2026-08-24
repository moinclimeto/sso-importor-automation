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
