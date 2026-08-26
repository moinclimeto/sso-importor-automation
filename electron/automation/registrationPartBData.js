import { getDb } from '../db/database.js';
import {
  buildPartBSection4FromRecords,
  partBSection4HasData,
} from '../../shared/partBSection4.js';
import {
  buildSec5bFromPurchases,
  buildSec5dFromSales,
  sec5bRowHasData,
  sec5dRowHasData,
} from '../../shared/partBSection5.js';

function parseLineItems(row = {}) {
  if (!row.line_items) return [];
  if (Array.isArray(row.line_items)) return row.line_items;
  try {
    return JSON.parse(row.line_items);
  } catch {
    return [];
  }
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
    purchases: (purchases || []).map((row) => ({ ...row, line_items: parseLineItems(row) })),
    sales: (sales || []).map((row) => ({ ...row, line_items: parseLineItems(row) })),
  };
}

export async function resolvePartBSection4ForAutomation({
  partBSection4 = [],
  operatingStates = [],
  companyId = null,
  onLog,
} = {}) {
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
  onLog,
} = {}) {
  const base = {
    sec5a: [],
    sec5b: [],
    sec5c: [],
    sec5d: [],
    ...(partBTransactions || {}),
  };
  const existing5b = Array.isArray(base.sec5b) ? base.sec5b : [];
  const existing5d = Array.isArray(base.sec5d) ? base.sec5d : [];
  const has5b = existing5b.some(sec5bRowHasData);
  const has5d = existing5d.some(sec5dRowHasData);
  if (has5b && has5d) return base;

  try {
    const { purchases, sales } = await loadCompanyRecords(companyId);
    const computed5b = buildSec5bFromPurchases(purchases, { companyId, docStatus: 'published' });
    const computed5d = buildSec5dFromSales(sales, { companyId, docStatus: 'published' });

    const sec5b = has5b ? existing5b : (computed5b.length ? computed5b : existing5b);
    const sec5d = has5d ? existing5d : (computed5d.length ? computed5d : existing5d);

    if (onLog) {
      if (!has5b && sec5b.length) onLog(`Computed ${sec5b.length} Section 5b row(s) from unregistered purchases.`);
      if (!has5d && sec5d.length) onLog(`Computed ${sec5d.length} Section 5d row(s) from unregistered sales.`);
      if (!has5d && !sec5d.length) onLog('No unregistered sales found for Section 5d.');
    }

    return { ...base, sec5b, sec5d };
  } catch (err) {
    if (onLog) onLog(`Failed to compute Part B Section 5 transactions: ${err.message}`);
    return base;
  }
}
