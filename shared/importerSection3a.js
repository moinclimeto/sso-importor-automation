import {
  itemToLineDraft,
  resolveLineMt,
  lookupPackagingMasterRowAny,
  applyPackagingMasterToDraft,
  shouldAutoApplyPackagingMaster,
} from './procurementConversionFactor.js';
import { normalizePlasticCategory, PLASTIC_CATEGORIES } from './plasticCategories.js';
import { CATEGORY_3C_KEYS, mtTo3cString, emptyPlasticConsumedYear } from './plasticConsumed3c.js';
import { getImporterReportingFinancialYears } from './financialYearScope.js';
import {
  buildProductAliasMap,
  filterImportPurchaseLines,
  filterSaleLines,
  matchImportPurchasesToSales,
  collectUnclassifiedProcurementIssues,
  resolveCanonicalKey,
} from './importerPurchaseSaleMatch.js';

function parseNum(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function saleLineHasExplicitCategory(draft = {}) {
  const cat = normalizePlasticCategory(draft.plasticCategory);
  return Boolean(cat && PLASTIC_CATEGORIES.includes(cat));
}

/** Resolve sale line category/CF: saved line values first, then Packaging Master fallback. */
export function resolveSaleLineDraftFor3a(rawLine, lineIndex = 0, packagingRows = []) {
  let draft = itemToLineDraft(rawLine, lineIndex);
  const needsCategory = !saleLineHasExplicitCategory(draft);
  const needsMt = (() => {
    const mt = resolveLineMt(draft);
    return mt == null || mt <= 0;
  })();

  if (!needsCategory && !needsMt) return draft;

  const master = lookupPackagingMasterRowAny(packagingRows, draft);
  if (!master) return draft;

  if (needsCategory && master.plastic_category) {
    draft = {
      ...draft,
      plasticCategory: normalizePlasticCategory(master.plastic_category) || draft.plasticCategory,
    };
  }

  if (needsMt && shouldAutoApplyPackagingMaster(draft)) {
    draft = applyPackagingMasterToDraft(draft, master);
  }

  return draft;
}

function resolvePackagingDataSource(beforeDraft, afterDraft) {
  const hadCategory = saleLineHasExplicitCategory(beforeDraft);
  const hadMt = (() => {
    const mt = resolveLineMt(beforeDraft);
    return mt != null && mt > 0;
  })();
  const usedMaster = afterDraft.masterSource === 'auto_master';
  if (hadCategory && hadMt) return 'Sales Review';
  if (usedMaster && !hadCategory && !hadMt) return 'Packaging Master';
  if (usedMaster) return 'Sales Review + Packaging Master';
  if (hadCategory || hadMt) return 'Sales Review';
  return '—';
}

function buildConversionFactorLabel(draft, unit = '') {
  const cf = draft.conversionFactorApplied || draft.conversionFactor;
  if (!cf) return '—';
  const u = unit || draft.unit || draft.uom || 'unit';
  return `${cf} kg/${u}`;
}

/** Scale packaging MT by sold/import allocation ratio */
export function packagingMtForAllocatedSale(saleLine, allocatedQty, packagingRows = []) {
  const rawLine = saleLine.rawLine || saleLine;
  const draft = resolveSaleLineDraftFor3a(rawLine, saleLine.lineIndex ?? 0, packagingRows);
  const fullMt = resolveLineMt(draft);
  if (fullMt == null || fullMt <= 0) return { mt: null, error: 'missing_mt', draft };

  const saleQty = parseNum(saleLine.quantity);
  if (saleQty <= 0) return { mt: null, error: 'zero_qty', draft };

  const ratio = Math.min(1, allocatedQty / saleQty);
  return { mt: Number((fullMt * ratio).toFixed(6)), error: null, draft };
}

export function buildImporter3aDraft({
  purchases = [],
  sales = [],
  packagingRows = [],
  reportingYears = null,
  asOfDate = new Date(),
} = {}) {
  const scopeYears = reportingYears || getImporterReportingFinancialYears(asOfDate);
  const aliasMap = buildProductAliasMap(packagingRows);

  const importLines = filterImportPurchaseLines(purchases, scopeYears);
  const saleLines = filterSaleLines(sales, scopeYears);

  const importQtyByPoolKey = new Map();
  for (const pl of importLines) {
    const key = `${pl.financialYear}::${resolveCanonicalKey(pl.productMatchKey, aliasMap)}`;
    importQtyByPoolKey.set(key, (importQtyByPoolKey.get(key) || 0) + pl.quantity);
  }

  const { matches, unmatchedSales, unsoldImportQty } = matchImportPurchasesToSales({
    importLines,
    saleLines,
    aliasMap,
  });

  const detailRows = [];
  const issues = [...collectUnclassifiedProcurementIssues(purchases, scopeYears)];

  for (const match of matches) {
    const rawLine = match.saleLine.rawLine || match.saleLine;
    const lineIndex = match.saleLine.lineIndex ?? 0;
    const beforeDraft = itemToLineDraft(rawLine, lineIndex);
    const resolvedDraft = resolveSaleLineDraftFor3a(rawLine, lineIndex, packagingRows);
    const cat = normalizePlasticCategory(resolvedDraft.plasticCategory);
    if (!cat || !PLASTIC_CATEGORIES.includes(cat)) {
      issues.push({
        type: 'missing_category',
        product: match.saleLine.productDescription,
        invoice: match.saleLine.invoiceNo,
        recordId: match.saleLine.recordId,
      });
      continue;
    }

    const { mt, error } = packagingMtForAllocatedSale(match.saleLine, match.allocatedQty, packagingRows);
    if (error || mt == null || mt <= 0) {
      issues.push({
        type: error || 'missing_mt',
        product: match.saleLine.productDescription,
        invoice: match.saleLine.invoiceNo,
        recordId: match.saleLine.recordId,
      });
      continue;
    }

    const poolKey = `${match.financialYear}::${match.productMatchKey}`;
    const importPoolQty = importQtyByPoolKey.get(poolKey) ?? 0;
    const unit = match.saleLine.unit || resolvedDraft.unit || '';
    const matchStatus = match.needsConfirmation ? 'Partial Match' : 'Matched';

    detailRows.push({
      financialYear: match.financialYear,
      productDescription: match.saleLine.productDescription,
      hsn: match.saleLine.hsn,
      plasticCategory: cat,
      productQtySold: match.allocatedQty,
      saleLineQty: match.saleQty,
      importPoolQty,
      unit,
      conversionFactorLabel: buildConversionFactorLabel(resolvedDraft, unit),
      packagingDataSource: resolvePackagingDataSource(beforeDraft, resolvedDraft),
      matchStatus,
      packagingMt: mt,
      saleInvoiceRef: match.saleLine.invoiceNo,
      saleRecordId: match.saleLine.recordId,
      purchaseInvoiceRefs: [...new Set(match.purchaseSources.map((p) => p.invoiceNo).filter(Boolean))],
      matchConfidence: match.matchConfidence,
      needsConfirmation: match.needsConfirmation,
      productMatchKey: match.productMatchKey,
    });
  }

  for (const us of unmatchedSales) {
    issues.push({
      type: 'unmatched_sale',
      product: us.productDescription,
      invoice: us.invoiceNo,
      recordId: us.recordId,
      productMatchKey: us.productMatchKey,
      hsn: us.hsn,
    });
  }

  const summaryByFy = {};
  for (const fy of scopeYears) {
    summaryByFy[fy] = emptyPlasticConsumedYear();
  }

  for (const row of detailRows) {
    const fy = row.financialYear;
    if (!summaryByFy[fy]) summaryByFy[fy] = emptyPlasticConsumedYear();
    const key = CATEGORY_3C_KEYS[row.plasticCategory];
    if (key) {
      const prev = parseNum(summaryByFy[fy][key]);
      summaryByFy[fy][key] = mtTo3cString(prev + row.packagingMt);
    }
  }

  const isNil = saleLines.length === 0;
  const status = isNil ? 'nil' : 'draft';

  return {
    status: isNil ? 'nil' : status,
    reportingYears: scopeYears,
    detailRows,
    summaryByFy,
    matches,
    unmatchedSales,
    unsoldImportQty,
    issues,
    stats: {
      importLineCount: importLines.length,
      saleLineCount: saleLines.length,
      matchedCount: matches.length,
      detailRowCount: detailRows.length,
      unclassifiedProcurementCount: issues.filter((i) => i.type === 'unclassified_procurement').length,
      unmatchedSaleCount: unmatchedSales.length,
      totalPackagingMt: Number(
        detailRows.reduce((sum, row) => sum + (row.packagingMt || 0), 0).toFixed(6),
      ),
    },
    generatedAt: new Date().toISOString(),
  };
}

export function buildPlasticConsumed3cFromImporter3a(importer3a = {}, years = null) {
  const scopeYears = years || importer3a.reportingYears || getImporterReportingFinancialYears();
  const summary = importer3a.summaryByFy || {};
  const plasticConsumed = {};
  for (const fy of scopeYears) {
    plasticConsumed[fy] = summary[fy]
      ? { ...summary[fy] }
      : emptyPlasticConsumedYear();
  }
  return { plasticConsumed, years: scopeYears };
}

const BLOCKING_ISSUE_TYPES = new Set([
  'missing_category',
  'missing_mt',
  'zero_qty',
  'unmatched_sale',
  'unclassified_procurement',
]);

export function importer3aCanFinalize(draft = {}) {
  const saleLineCount = draft.stats?.saleLineCount ?? 0;

  if (saleLineCount === 0) {
    return { ok: true, nil: true };
  }

  if (draft.status === 'nil') {
    return {
      ok: false,
      reason: 'Domestic sales exist — cannot finalize as NIL. Match sales to imports or remove sale data.',
    };
  }

  const unclassifiedCount =
    draft.stats?.unclassifiedProcurementCount ??
    (draft.issues || []).filter((i) => i.type === 'unclassified_procurement').length;

  if (unclassifiedCount > 0) {
    return {
      ok: false,
      reason: `${unclassifiedCount} purchase invoice(s) need Procurement Source set to Import or Domestic before Importer 3a can be finalized.`,
    };
  }

  const unmatchedCount =
    draft.stats?.unmatchedSaleCount ??
    draft.unmatchedSales?.length ??
    (draft.issues || []).filter((i) => i.type === 'unmatched_sale').length;

  if (unmatchedCount > 0) {
    return {
      ok: false,
      reason: `${unmatchedCount} domestic sale line(s) could not be linked to imported purchases. Resolve product matching or import pool before finalizing.`,
    };
  }

  const blocking = (draft.issues || []).filter((i) => BLOCKING_ISSUE_TYPES.has(i.type));
  if (!(draft.detailRows || []).length) {
    return { ok: false, reason: 'No 3a detail rows — fix matching and packaging data before finalizing' };
  }
  if (blocking.some((i) => ['missing_category', 'missing_mt', 'zero_qty'].includes(i.type))) {
    const dataIssues = blocking.filter((i) =>
      ['missing_category', 'missing_mt', 'zero_qty'].includes(i.type),
    );
    return {
      ok: false,
      reason: `${dataIssues.length} line(s) need plastic category or packaging MT (check sale lines and Packaging Master)`,
    };
  }
  return { ok: true, nil: false };
}

export function finalizeImporter3a(draft = {}) {
  const check = importer3aCanFinalize(draft);
  if (!check.ok) {
    return { success: false, error: check.reason };
  }
  if (check.nil) {
    return {
      success: true,
      data: {
        ...draft,
        status: 'nil',
        finalizedAt: new Date().toISOString(),
        detailRows: [],
        summaryByFy: Object.fromEntries(
          (draft.reportingYears || []).map((fy) => [fy, emptyPlasticConsumedYear()]),
        ),
      },
    };
  }
  return {
    success: true,
    data: {
      ...draft,
      status: 'finalized',
      finalizedAt: new Date().toISOString(),
    },
  };
}
