import { aggregateByFinancialYear } from './plasticMtAggregation.js';
import { getImporterReportingFinancialYears } from './financialYearScope.js';
import {
  buildPlasticConsumed3cFromPurchases,
  aggregateRowsToPlasticConsumed3c,
  resolvePlasticConsumed3cYears,
  plasticConsumed3cHasData,
} from './plasticConsumed3c.js';
import {
  buildImporter3aDraft,
  buildPlasticConsumed3cFromImporter3a,
} from './importerSection3a.js';

function filterByCompany(records = [], companyId = null) {
  if (companyId == null || companyId === '') return records;
  const cid = Number(companyId);
  return records.filter((row) => Number(row.company_id) === cid);
}

function filterSalesPackagingRows(packagingRows = [], companyId = null) {
  const salesRows = packagingRows.filter(
    (row) => (row.list_type === 'sales' || !row.list_type) && row.is_active !== 0,
  );
  return filterByCompany(salesRows, companyId);
}

/** Sales invoice line MT → section 3c grid (Packaging Master / Sales Review basis). */
export function buildPlasticConsumed3cFromSales(
  sales = [],
  { docStatus = 'published', financialYear = 'all', companyId = null } = {},
) {
  const rows = filterByCompany(sales, companyId);
  const fyRows = aggregateByFinancialYear(rows, 'sale', { docStatus, financialYear });
  const years = resolvePlasticConsumed3cYears(fyRows);
  const plasticConsumed = aggregateRowsToPlasticConsumed3c(fyRows, years);
  return { plasticConsumed, fyRows, years };
}

const SOURCE_LABELS = {
  importer_3a_saved: 'Finalized Importer 3a',
  importer_3a: 'Importer 3a (import ↔ sale packaging MT)',
  sales_packaging: 'Sales invoices (Packaging Master / Sales Review MT)',
  procurement: 'Procurement invoices (line packaging MT)',
};

/**
 * MT Reports — section 3c tab: Importer 3a first, then sales packaging, then procurement.
 */
export function buildPlasticConsumed3cForReports({
  purchases = [],
  sales = [],
  packagingRows = [],
  docStatus = 'published',
  financialYear = 'all',
  companyId = null,
  savedImporter3a = null,
} = {}) {
  const filters = { docStatus, financialYear, companyId };

  if (savedImporter3a?.summaryByFy) {
    const saved = buildPlasticConsumed3cFromImporter3a(savedImporter3a);
    if (plasticConsumed3cHasData(saved.plasticConsumed)) {
      return {
        ...saved,
        source: 'importer_3a_saved',
        sourceLabel: SOURCE_LABELS.importer_3a_saved,
      };
    }
  }

  const scopedPurchases = filterByCompany(purchases, companyId);
  const scopedSales = filterByCompany(sales, companyId);
  const salesPackaging = filterSalesPackagingRows(packagingRows, companyId);

  const scopeYears = financialYear && financialYear !== 'all'
    ? [financialYear]
    : getImporterReportingFinancialYears();

  const draft = buildImporter3aDraft({
    purchases: scopedPurchases,
    sales: scopedSales,
    packagingRows: salesPackaging,
    reportingYears: scopeYears,
  });

  const fromImporter = buildPlasticConsumed3cFromImporter3a(draft, scopeYears);
  if (plasticConsumed3cHasData(fromImporter.plasticConsumed)) {
    return {
      ...fromImporter,
      source: 'importer_3a',
      sourceLabel: SOURCE_LABELS.importer_3a,
      draftStats: draft.stats,
    };
  }

  const fromSales = buildPlasticConsumed3cFromSales(sales, filters);
  if (plasticConsumed3cHasData(fromSales.plasticConsumed)) {
    return {
      ...fromSales,
      source: 'sales_packaging',
      sourceLabel: SOURCE_LABELS.sales_packaging,
    };
  }

  const fromProc = buildPlasticConsumed3cFromPurchases(purchases, filters);
  return {
    ...fromProc,
    source: 'procurement',
    sourceLabel: SOURCE_LABELS.procurement,
  };
}
