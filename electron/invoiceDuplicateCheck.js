import {
  formatDuplicateInvoiceMessage,
  normalizeGst,
  normalizeInvoiceNo,
  resolveFileHash,
  resolvePurchaseInvoiceNo,
  resolvePurchasePartyGst,
  resolveSaleInvoiceNo,
  resolveSalePartyGst,
} from '../shared/invoiceDuplicate.js';

function duplicateError(match) {
  const err = new Error(formatDuplicateInvoiceMessage(match));
  err.code = 'DUPLICATE_INVOICE';
  err.duplicate = match;
  return err;
}

async function findByFileHash(db, fileHash, { excludePurchaseId, excludeSaleId } = {}) {
  if (!fileHash) return null;

  const purchase = await db.get(
    `SELECT id, invoice_no, invoice_number, supplier_gst_number, vendor_gstin, file_hash
     FROM purchases
     WHERE file_hash = ?${excludePurchaseId ? ' AND id != ?' : ''}
     LIMIT 1`,
    excludePurchaseId ? [fileHash, excludePurchaseId] : [fileHash],
  );
  if (purchase) {
    return {
      reason: 'file_hash',
      table: 'purchase',
      id: purchase.id,
      invoiceNo: normalizeInvoiceNo(purchase.invoice_no || purchase.invoice_number),
      gst: normalizeGst(purchase.supplier_gst_number || purchase.vendor_gstin),
    };
  }

  const sale = await db.get(
    `SELECT id, invoice_no, application_number, customer_gstin, file_hash
     FROM sales
     WHERE file_hash = ?${excludeSaleId ? ' AND id != ?' : ''}
     LIMIT 1`,
    excludeSaleId ? [fileHash, excludeSaleId] : [fileHash],
  );
  if (sale) {
    return {
      reason: 'file_hash',
      table: 'sale',
      id: sale.id,
      invoiceNo: normalizeInvoiceNo(sale.invoice_no || sale.application_number),
      gst: normalizeGst(sale.customer_gstin),
    };
  }

  return null;
}

function matchesBusinessKey(row, invoiceNo, partyGst, { invoiceNoKey, gstKey }) {
  const rowInvoiceNo = normalizeInvoiceNo(row[invoiceNoKey] || row.invoice_number || row.invoice_no);
  if (!rowInvoiceNo || rowInvoiceNo !== invoiceNo) return false;

  const rowGst = normalizeGst(row[gstKey] || row.vendor_gstin || row.customer_gstin);
  if (partyGst && rowGst && partyGst !== rowGst) return false;
  return true;
}

export async function findDuplicatePurchase(db, data, { excludeId } = {}) {
  const fileHash = resolveFileHash(data);
  const byHash = await findByFileHash(db, fileHash, { excludePurchaseId: excludeId });
  if (byHash) return byHash;

  const companyId = data.company_id;
  const invoiceNo = resolvePurchaseInvoiceNo(data);
  const partyGst = resolvePurchasePartyGst(data);
  if (!companyId || !invoiceNo) return null;

  const rows = await db.all(
    `SELECT id, invoice_no, invoice_number, supplier_gst_number, vendor_gstin
     FROM purchases
     WHERE company_id = ?`,
    [companyId],
  );

  for (const row of rows) {
    if (excludeId && Number(row.id) === Number(excludeId)) continue;
    if (
      matchesBusinessKey(row, invoiceNo, partyGst, {
        invoiceNoKey: 'invoice_no',
        gstKey: 'supplier_gst_number',
      })
    ) {
      return {
        reason: 'invoice_key',
        table: 'purchase',
        id: row.id,
        invoiceNo,
        gst: partyGst || normalizeGst(row.supplier_gst_number || row.vendor_gstin),
      };
    }
  }

  return null;
}

export async function findDuplicateSale(db, data, { excludeId } = {}) {
  const fileHash = resolveFileHash(data);
  const byHash = await findByFileHash(db, fileHash, { excludeSaleId: excludeId });
  if (byHash) return byHash;

  const companyId = data.company_id;
  const invoiceNo = resolveSaleInvoiceNo(data);
  const partyGst = resolveSalePartyGst(data);
  if (!companyId || !invoiceNo) return null;

  const rows = await db.all(
    `SELECT id, invoice_no, application_number, customer_gstin
     FROM sales
     WHERE company_id = ?`,
    [companyId],
  );

  for (const row of rows) {
    if (excludeId && Number(row.id) === Number(excludeId)) continue;
    if (
      matchesBusinessKey(row, invoiceNo, partyGst, {
        invoiceNoKey: 'invoice_no',
        gstKey: 'customer_gstin',
      }) ||
      matchesBusinessKey(row, invoiceNo, partyGst, {
        invoiceNoKey: 'application_number',
        gstKey: 'customer_gstin',
      })
    ) {
      return {
        reason: 'invoice_key',
        table: 'sale',
        id: row.id,
        invoiceNo,
        gst: partyGst || normalizeGst(row.customer_gstin),
      };
    }
  }

  return null;
}

export async function assertNoDuplicatePurchase(db, data, options = {}) {
  const match = await findDuplicatePurchase(db, data, options);
  if (match) throw duplicateError(match);
}

export async function assertNoDuplicateSale(db, data, options = {}) {
  const match = await findDuplicateSale(db, data, options);
  if (match) throw duplicateError(match);
}

/** Remove file_hashes rows that no longer belong to a purchase/sale record. */
export async function pruneOrphanFileHashes(db) {
  const result = await db.run(`
    DELETE FROM file_hashes
    WHERE hash NOT IN (
      SELECT file_hash FROM purchases WHERE file_hash IS NOT NULL AND file_hash != ''
      UNION
      SELECT file_hash FROM sales WHERE file_hash IS NOT NULL AND file_hash != ''
    )
  `);
  return { removed: result.changes || 0 };
}

export async function getAllProcessedFileHashes(db) {
  await pruneOrphanFileHashes(db);
  const hashes = new Set();
  const tables = [
    db.all(`SELECT file_hash AS hash FROM purchases WHERE file_hash IS NOT NULL AND file_hash != ''`),
    db.all(`SELECT file_hash AS hash FROM sales WHERE file_hash IS NOT NULL AND file_hash != ''`),
  ];
  for (const rows of await Promise.all(tables)) {
    for (const row of rows || []) {
      if (row.hash) hashes.add(row.hash);
    }
  }
  return hashes;
}
