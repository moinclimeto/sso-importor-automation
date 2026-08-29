import { financialYearStartYearFromDate } from './procurementConversionFactor.js';

export function parseCommencementYear(value) {
  const n = parseInt(String(value || '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Calendar year when the current Indian FY started (e.g. Aug 2026 → 2026). */
export function getCurrentFinancialYearStartYear(asOfDate = new Date()) {
  return financialYearStartYearFromDate(asOfDate);
}

/**
 * True when operations commenced in the current financial year — prior-year
 * EPR history (3c, Part B) is not required. Section 3a remains mandatory.
 */
export function isCurrentFinancialYearCommencement(yearOfCommencement, asOfDate = new Date()) {
  const y = parseCommencementYear(yearOfCommencement);
  if (y == null) return false;
  return y >= getCurrentFinancialYearStartYear(asOfDate);
}

export function requiresHistoricalEprData(yearOfCommencement, asOfDate = new Date()) {
  return !isCurrentFinancialYearCommencement(yearOfCommencement, asOfDate);
}

export const CURRENT_FY_COMMENCEMENT_HINT =
  'Operations commenced in the current financial year — Section 3c and all of Part B (Sections 4 and 5) are not required. Section 3a PDF is still mandatory.';
