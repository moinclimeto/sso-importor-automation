import { getDb } from '../db/database.js';
import {
  buildPartBSection4FromRecords,
  partBSection4HasData,
} from '../../shared/partBSection4.js';
import {
  buildSec5bFromPurchases,
  buildSec5dFromSales,
  PART_B_SECTION5_DOC_STATUS,
  normalizeSec5bRowForPortal,
  reconcileSec5bForAutomation,
  reconcileSec5dForAutomation,
} from '../../shared/partBSection5.js';
import { requiresHistoricalEprData } from '../../shared/commencementYearScope.js';
import { getCpcbPortalPartA3cYears } from '../../shared/financialYearScope.js';

async function resolveCompanyIdForAutomation({ companyId = null, gstin = '' } = {}) {
  if (companyId != null && companyId !== '') return companyId;
  const normalized = String(gstin || '').trim().toUpperCase();
  if (!normalized) return null;
  try {
    const db = getDb();
    const row = await db.get(
      'SELECT id FROM companies WHERE UPPER(TRIM(gstin)) = ? LIMIT 1',
      [normalized],
    );
    return row?.id ?? null;
  } catch {
    return null;
  }
}

function parseLineItems(row = {}) {
  if (!row.line_items) return [];
  if (Array.isArray(row.line_items)) return row.line_items;
  try {
    return JSON.parse(row.line_items);
  } catch {
    return [];
  }
}

function enrichRecordRow(row = {}) {
  let sourceFields = row._source_fields;
  if (typeof sourceFields === 'string') {
    try {
      sourceFields = JSON.parse(sourceFields);
    } catch {
      sourceFields = {};
    }
  }
  return {
    ...row,
    line_items: parseLineItems(row),
    _source_fields: sourceFields && typeof sourceFields === 'object' ? sourceFields : {},
  };
}

async function loadCompanyRecords(companyId = null) {
  const db = getDb();
  const purchases = await db.all(
    companyId
      ? 'SELECT * FROM purchases WHERE company_id = ? ORDER BY invoice_date DESC'
      : 'SELECT * FROM purchases ORDER BY invoice_date DESC',
    companyId ? [companyId] : [],
  );
  const sales = await db.all(
    companyId
      ? 'SELECT * FROM sales WHERE company_id = ? ORDER BY invoice_date DESC'
      : 'SELECT * FROM sales ORDER BY invoice_date DESC',
    companyId ? [companyId] : [],
  );
  return {
    purchases: (purchases || []).map(enrichRecordRow),
    sales: (sales || []).map(enrichRecordRow),
  };
}

export async function resolvePartBSection4ForAutomation({
  partBSection4 = [],
  operatingStates = [],
  companyId = null,
  yearOfCommencement = '',
  onLog,
} = {}) {
  if (!requiresHistoricalEprData(yearOfCommencement)) {
    if (onLog) onLog('Part B Section 4 skipped — operations commenced in current financial year.');
    return [];
  }
  if (partBSection4HasData(partBSection4)) return partBSection4;
  if (!operatingStates?.length) {
    if (onLog) onLog('Part B Section 4 empty and no operating states — cannot compute.');
    return partBSection4;
  }

  try {
    const { purchases, sales } = await loadCompanyRecords(companyId);
    const computed = buildPartBSection4FromRecords({
      operatingStates,
      purchases,
      sales,
      companyId,
      docStatus: 'published',
      reportingYears: getCpcbPortalPartA3cYears(),
    });
    if (partBSection4HasData(computed)) {
      if (onLog) onLog(`Computed Part B Section 4 from ${purchases.length} purchases / ${sales.length} sales.`);
      return computed;
    }
    if (onLog) onLog('Part B Section 4 still empty after computing from purchases/sales.');
  } catch (err) {
    if (onLog) onLog(`Failed to compute Part B Section 4: ${err.message}`);
  }
  return partBSection4;
}

export async function resolvePartBTransactionsForAutomation({
  partBTransactions = {},
  companyId = null,
  gstin = '',
  yearOfCommencement = '',
  onLog,
} = {}) {
  const base = {
    sec5a: [],
    sec5b: [],
    sec5c: [],
    sec5d: [],
    ...(partBTransactions || {}),
  };
  if (!requiresHistoricalEprData(yearOfCommencement)) {
    if (onLog) onLog('Part B Section 5 skipped — operations commenced in current financial year.');
    return { ...base, sec5a: [], sec5b: [], sec5c: [], sec5d: [] };
  }
  const existing5b = Array.isArray(base.sec5b) ? base.sec5b : [];
  const existing5d = Array.isArray(base.sec5d) ? base.sec5d : [];
  const resolvedCompanyId = await resolveCompanyIdForAutomation({ companyId, gstin });

  try {
    const { purchases, sales } = await loadCompanyRecords(resolvedCompanyId);
    const computed5b = buildSec5bFromPurchases(purchases, {
      companyId: resolvedCompanyId,
      docStatus: PART_B_SECTION5_DOC_STATUS,
    });
    const computed5d = buildSec5dFromSales(sales, {
      companyId: resolvedCompanyId,
      docStatus: PART_B_SECTION5_DOC_STATUS,
    });

    const sec5b = reconcileSec5bForAutomation(existing5b, computed5b);
    const sec5d = reconcileSec5dForAutomation(existing5d, computed5d);

    if (onLog) {
      const unregisteredPurchases = purchases.filter((row) =>
        String(row.registration_type || '').toLowerCase().replace(/\s+/g, '') === 'unregistered',
      ).length;
      if (sec5b.length) {
        onLog(`Section 5b rows ready: ${sec5b.length} (computed ${computed5b.length} published, companyId=${resolvedCompanyId ?? 'all'}).`);
        for (const row of sec5b) {
          onLog(`  5b → ${row.entityName}: entity=${row.entityType}, material=${row.materialType}`);
        }
      }
      if (!sec5b.length) {
        onLog(`No Section 5b rows — ${unregisteredPurchases} unregistered purchase(s) in DB (${purchases.length} total).`);
      }
      if (computed5d.length) onLog(`Computed ${computed5d.length} Section 5d row(s) from published unregistered sales.`);
      else if (!sec5d.length) {
        const unregisteredSales = sales.filter((row) =>
          String(row.registration_type || '').toLowerCase().replace(/\s+/g, '') === 'unregistered',
        ).length;
        onLog(`No Section 5d rows — ${unregisteredSales} unregistered sale(s) in DB (${sales.length} total).`);
      }
    }

    return { ...base, sec5b, sec5d };
  } catch (err) {
    if (onLog) onLog(`Failed to compute Part B Section 5 transactions: ${err.message}`);
    return {
      ...base,
      sec5b: existing5b.map(normalizeSec5bRowForPortal),
    };
  }
}
