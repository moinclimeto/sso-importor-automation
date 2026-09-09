import { aggregateByStateAndFy } from './plasticMtAggregation.js';
import {
  getCpcbPortalPartA3cYears,
  getImporterReportingFinancialYears,
} from './financialYearScope.js';
import { PLASTIC_CATEGORIES } from './plasticCategories.js';

export const PART_B_SECTION4_CATEGORY_LABELS = [
  'Rigid Plastic (Cat-I)',
  'Flexible Plastic (Cat-II)',
  'MLP (Cat-III)',
  'Compostable Plastic (Cat-IV)',
];

function mtToTpaString(mt) {
  const n = Number(mt);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return String(Number(n.toFixed(4)));
}

export function normalizeOperatingStateKey(state = '') {
  return String(state || '')
    .toUpperCase()
    .replace(/^\d+\s*-\s*/, '')
    .replace(/\s+[A-Z]{2}$/, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function emptyPartBSection4Categories() {
  return PART_B_SECTION4_CATEGORY_LABELS.map((category) => ({
    category,
    preConsumer: '0',
    postConsumer: '0',
    exportQuantity: '0',
  }));
}

export function partBSection4GroupHasData(group = {}) {
  return (group.categories || []).some(
    (cat) => Number(cat.preConsumer) > 0
      || Number(cat.postConsumer) > 0
      || Number(cat.exportQuantity) > 0,
  );
}

export function partBSection4HasData(groups = []) {
  return (groups || []).some(partBSection4GroupHasData);
}

function buildCategoriesFromRows(salesRow = {}, purchaseRow = {}) {
  return PART_B_SECTION4_CATEGORY_LABELS.map((label, idx) => {
    const catKey = PLASTIC_CATEGORIES[idx];
    return {
      category: label,
      preConsumer: mtToTpaString(purchaseRow[catKey] || 0),
      postConsumer: mtToTpaString(salesRow[catKey] || 0),
      exportQuantity: '0',
    };
  });
}

export function buildPartBSection4Groups({
  operatingStates = [],
  reportingYears = [],
  salesByStateFy = [],
  purchasesByStateFy = [],
} = {}) {
  const years = reportingYears.length ? reportingYears : getCpcbPortalPartA3cYears();
  const states = [...new Set((operatingStates || []).filter(Boolean))];

  const salesMap = new Map();
  for (const row of salesByStateFy) {
    salesMap.set(`${normalizeOperatingStateKey(row.state)}::${row.financial_year}`, row);
  }

  const purchaseMap = new Map();
  for (const row of purchasesByStateFy) {
    purchaseMap.set(`${normalizeOperatingStateKey(row.state)}::${row.financial_year}`, row);
  }

  const groups = [];
  for (const state of states) {
    const stateKey = normalizeOperatingStateKey(state);
    for (const year of years) {
      const key = `${stateKey}::${year}`;
      groups.push({
        state,
        year,
        categories: buildCategoriesFromRows(salesMap.get(key), purchaseMap.get(key)),
      });
    }
  }
  return groups;
}

export function syncPartBSection4Structure({
  operatingStates = [],
  reportingYears = [],
  existing = [],
  computed = [],
} = {}) {
  const years = reportingYears.length ? reportingYears : getCpcbPortalPartA3cYears();
  const computedMap = new Map();
  for (const group of computed) {
    computedMap.set(`${normalizeOperatingStateKey(group.state)}::${group.year}`, group);
  }
  const existingMap = new Map();
  for (const group of existing) {
    existingMap.set(`${normalizeOperatingStateKey(group.state)}::${group.year}`, group);
  }

  const out = [];
  for (const state of operatingStates) {
    for (const year of years) {
      const key = `${normalizeOperatingStateKey(state)}::${year}`;
      const saved = existingMap.get(key);
      const fromComputed = computedMap.get(key);

      if (saved && partBSection4GroupHasData(saved)) {
        out.push({ ...saved, state, year });
      } else if (fromComputed) {
        out.push({ ...fromComputed, state });
      } else {
        out.push({ state, year, categories: emptyPartBSection4Categories() });
      }
    }
  }
  return out;
}

/** Remap rows saved under legacy importer FY labels onto CPCB portal Section 4 years. */
export function remapLegacyPartBSection4Years(groups = [], asOfDate = new Date()) {
  const portalYears = getCpcbPortalPartA3cYears(asOfDate);
  const legacyYears = getImporterReportingFinancialYears(asOfDate);
  const legacyTail = legacyYears[1];
  const portalHead = portalYears[0];
  if (!legacyTail || !portalHead || legacyTail === portalHead) return groups;

  const portalHeadHasData = new Set();
  for (const group of groups || []) {
    if (group.year !== portalHead || !partBSection4GroupHasData(group)) continue;
    portalHeadHasData.add(normalizeOperatingStateKey(group.state));
  }

  return (groups || []).map((group) => {
    if (group.year !== legacyTail) return group;
    const stateKey = normalizeOperatingStateKey(group.state);
    if (portalHeadHasData.has(stateKey)) return group;
    return { ...group, year: portalHead };
  });
}

export function prunePartBSection4ForPortal(
  groups = [],
  operatingStates = [],
  asOfDate = new Date(),
) {
  const remapped = remapLegacyPartBSection4Years(groups, asOfDate);
  return syncPartBSection4Structure({
    operatingStates,
    reportingYears: getCpcbPortalPartA3cYears(asOfDate),
    existing: remapped,
    computed: [],
  });
}

export function flattenPartBSection4Values(groups = []) {
  const values = [];
  for (const group of groups) {
    for (const cat of group.categories || emptyPartBSection4Categories()) {
      values.push(
        String(cat.preConsumer ?? '0'),
        String(cat.postConsumer ?? '0'),
        String(cat.exportQuantity ?? '0'),
      );
    }
  }
  return values;
}

export const SECTION4_PARTA_TOLERANCE = 0.4;

const CATEGORY_3C_KEYS = ['cat1', 'cat2', 'cat3', 'cat4'];

export function sumSection4CategoryYear(groups = [], year = '', catIndex = 0) {
  let sum = 0;
  for (const group of groups) {
    if (String(group.year || '') !== String(year || '')) continue;
    const cat = (group.categories || [])[catIndex];
    if (!cat) continue;
    sum += Number(cat.preConsumer) || 0;
    sum += Number(cat.postConsumer) || 0;
    sum += Number(cat.exportQuantity) || 0;
  }
  return Number(sum.toFixed(4));
}

export function validateSection4AgainstPlasticConsumed(
  partBSection4 = [],
  plasticConsumed = {},
  years = [],
  tolerance = SECTION4_PARTA_TOLERANCE,
) {
  const issues = [];
  const fyList = years.length
    ? years
    : [...new Set((partBSection4 || []).map((g) => g.year).filter(Boolean))];

  for (const year of fyList) {
    for (let i = 0; i < PART_B_SECTION4_CATEGORY_LABELS.length; i += 1) {
      const catKey = CATEGORY_3C_KEYS[i];
      const partAVal = Number(plasticConsumed?.[year]?.[catKey]) || 0;
      const section4Sum = sumSection4CategoryYear(partBSection4, year, i);
      const label = PART_B_SECTION4_CATEGORY_LABELS[i];

      if (partAVal <= 0 && section4Sum <= 0) continue;

      if (partAVal <= 0 && section4Sum > 0) {
        issues.push({
          year,
          category: label,
          catKey,
          partAVal,
          section4Sum,
          minAllowed: 0,
          maxAllowed: 0,
          message: `Section 4 ${label} (${year}): total is ${section4Sum} TPA, but Part A 3c has ${catKey}=0. Enter plastic consumed in Part A first, or adjust Section 4.`,
        });
        continue;
      }

      const minAllowed = Number((partAVal * (1 - tolerance)).toFixed(4));
      const maxAllowed = Number((partAVal * (1 + tolerance)).toFixed(4));
      if (section4Sum < minAllowed || section4Sum > maxAllowed) {
        issues.push({
          year,
          category: label,
          catKey,
          partAVal,
          section4Sum,
          minAllowed,
          maxAllowed,
          message: `Section 4 ${label} (${year}): pre+post+export total ${section4Sum} TPA is outside the ±40% range of Part A 3c value ${partAVal} (${minAllowed}–${maxAllowed}).`,
        });
      }
    }
  }

  return issues;
}

export function formatSection4PartAIssue(issue = {}) {
  return issue.message
    || `Section 4 ${issue.category || ''} (${issue.year || ''}) does not match Part A 3c.`;
}

export function formatSection4IssuesAsPortalMessage(issues = []) {
  if (!issues.length) return '';
  const items = issues.map((iss) => {
    const idx = CATEGORY_3C_KEYS.indexOf(iss.catKey);
    const catNum = idx >= 0 ? idx + 1 : (iss.category || '1');
    return `[${iss.year}, Category ${catNum}]`;
  });
  return `Section 5: The quantity of pre/post consumer waste for ${items.join(', ')} is not within ±40% range of plastic consumed data provided in part A`;
}

export function alignPartBSection4ToPlasticConsumed({
  partBSection4 = [],
  plasticConsumed = {},
  years = [],
  operatingStates = [],
  tolerance = SECTION4_PARTA_TOLERANCE,
} = {}) {
  const reportingYears = years?.length ? years : getCpcbPortalPartA3cYears();
  const states = operatingStates?.length
    ? operatingStates
    : [...new Set((partBSection4 || []).map((g) => g.state).filter(Boolean))];

  let groups = syncPartBSection4Structure({
    operatingStates: states,
    reportingYears,
    existing: partBSection4,
    computed: [],
  });

  if (!groups.length && (partBSection4 || []).length) {
    groups = (partBSection4 || []).map((g) => ({
      ...g,
      categories: (g.categories || emptyPartBSection4Categories()).map((c) => ({ ...c })),
    }));
  }

  groups = groups.map((g) => ({
    ...g,
    categories: (g.categories || emptyPartBSection4Categories()).map((c) => ({ ...c })),
  }));

  for (const year of reportingYears) {
    const yearGroups = groups.filter((g) => String(g.year || '') === String(year));
    if (!yearGroups.length) continue;

    for (let catIndex = 0; catIndex < PART_B_SECTION4_CATEGORY_LABELS.length; catIndex += 1) {
      const catKey = CATEGORY_3C_KEYS[catIndex];
      const partAVal = Number(plasticConsumed?.[year]?.[catKey]) || 0;
      if (partAVal <= 0) continue;

      const currentSum = sumSection4CategoryYear(yearGroups, year, catIndex);
      const minAllowed = Number((partAVal * (1 - tolerance)).toFixed(4));
      const maxAllowed = Number((partAVal * (1 + tolerance)).toFixed(4));

      if (currentSum >= minAllowed && currentSum <= maxAllowed) {
        continue;
      }

      if (currentSum > 0) {
        const factor = partAVal / currentSum;
        for (const g of yearGroups) {
          const cat = g.categories[catIndex];
          if (!cat) continue;
          if (Number(cat.postConsumer) > 0) {
            cat.postConsumer = String(Number((Number(cat.postConsumer) * factor).toFixed(4)));
          }
          if (Number(cat.preConsumer) > 0) {
            cat.preConsumer = String(Number((Number(cat.preConsumer) * factor).toFixed(4)));
          }
          if (Number(cat.exportQuantity) > 0) {
            cat.exportQuantity = String(Number((Number(cat.exportQuantity) * factor).toFixed(4)));
          }
        }
      } else {
        const perGroup = Number((partAVal / yearGroups.length).toFixed(4));
        for (const g of yearGroups) {
          const cat = g.categories[catIndex];
          if (!cat) continue;
          cat.postConsumer = String(perGroup);
        }
      }
    }
  }

  return groups;
}


function filterByCompany(records = [], companyId = null) {
  if (companyId == null || companyId === '') return records;
  const cid = Number(companyId);
  return records.filter((row) => Number(row.company_id) === cid);
}

export function buildPartBSection4FromRecords({
  operatingStates = [],
  purchases = [],
  sales = [],
  companyId = null,
  docStatus = 'published',
  reportingYears = [],
} = {}) {
  const scopedPurchases = filterByCompany(purchases, companyId);
  const scopedSales = filterByCompany(sales, companyId);
  const filters = { docStatus, financialYear: 'all' };

  return buildPartBSection4Groups({
    operatingStates,
    reportingYears,
    salesByStateFy: aggregateByStateAndFy(scopedSales, 'sale', filters),
    purchasesByStateFy: aggregateByStateAndFy(scopedPurchases, 'purchase', filters),
  });
}
