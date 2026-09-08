import { requiresHistoricalEprData } from './commencementYearScope.js';
import { getCpcbPortalPartA3cYears } from './financialYearScope.js';
import { PLASTIC_CONSUMED_3C_COLUMNS, alignPlasticConsumedToYears } from './plasticConsumed3c.js';

export function plasticConsumedYearTotal(yearRow = {}) {
  return PLASTIC_CONSUMED_3C_COLUMNS.reduce((sum, col) => {
    const n = Number(yearRow?.[col.key]);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

export function plasticConsumedYearHasData(yearRow = {}) {
  return plasticConsumedYearTotal(yearRow) > 0;
}

/**
 * CPCB rejects all-zero Section 3c rows when commencement predates the current FY.
 * Returns one issue per reporting year that is empty or all zero.
 */
export function validatePlasticConsumed3cForPortal({
  plasticConsumed = {},
  yearOfCommencement = '',
  reportingYears = null,
} = {}) {
  if (!requiresHistoricalEprData(yearOfCommencement)) {
    return [];
  }

  const years = reportingYears?.length ? reportingYears : getCpcbPortalPartA3cYears();
  const aligned = alignPlasticConsumedToYears(plasticConsumed, years);
  const commencement = String(yearOfCommencement || '').trim();
  const issues = [];

  for (const fy of years) {
    const row = aligned?.[fy] || {};
    if (!plasticConsumedYearHasData(row)) {
      issues.push({
        id: `3c-zero-${fy}`,
        year: fy,
        yearOfCommencement: commencement,
        message:
          `Section 3c (${fy}): plastic consumed cannot be zero — commencement year (${commencement || 'unknown'}) `
          + 'is older than the current financial year. Enter TPA values in Part A → 3c before Register.',
      });
    }
  }

  return issues;
}

export function formatPlasticConsumed3cIssue(issue = {}) {
  return issue.message
    || `Section 3c (${issue.year || ''}) has invalid plastic consumed values.`;
}
