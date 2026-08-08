/**
 * CPCB Sales (Post Consumer) Bulk Entry automation:
 * Select Unit → Operations Sales Details View → Bulk Entry → fill (no Preview)
 * Never hard-navigate with page.goto after unit select (drops unit context).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx';
import {
  ensureUnitSelected,
  openModuleViaOperationsView,
  createZipStore,
  clampBulkDateRange,
  setBulkDate,
  setHiddenFile,
  sleep,
  isoToDisplay,
  MINIMAL_PDF,
} from './cpcbProcurementBulk.js';

/**
 * Dummy Domestic Sales Excel + matching invoice ZIP.
 * Invoice File Name in Excel = PDF name inside ZIP.
 */
export function prepareDummySalesBulk(options = {}) {
  const outDir =
    options.outDir ||
    path.join(os.tmpdir(), `pwp-cpcb-sales-bulk-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const { fromDate, toDate } = clampBulkDateRange(options.fromDate, options.toDate);
  const invoiceFileName =
    options.invoiceFileName || options.invoiceFilename || 'dummy_sales_invoice_001.pdf';

  const row = {
    'S-No.': 1,
    'Production ID': 'PROD-DUMMY-001',
    'Available Quantity (MT)': 10,
    'Qty of Material Sold (MT)': 1,
    'Product Type': 'Others',
    '% of Clinker': 0,
    'Entity Name': 'Dummy Buyer Pvt Ltd',
    'Address': 'Plot 1, Industrial Area',
    'State': 'Madhya Pradesh',
    'District': 'Dhar',
    'Account Number': '1234567890',
    'IFSC Code': 'SBIN0001234',
    'GST & Other Charges (₹)': 1000,
    'Invoice File Name\n(Shall exactly match the name of pdf uploaded in ZIP folder)': invoiceFileName,
  };

  const headers = Object.keys(row);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([row], { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(36, Math.max(12, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'DomesticSales');

  const excelPath = path.join(outDir, 'sales_bulk_dummy.xlsx');
  XLSX.writeFile(wb, excelPath);

  const zipPath = path.join(outDir, 'sales_invoices_dummy.zip');
  fs.writeFileSync(zipPath, createZipStore([{ name: invoiceFileName, data: MINIMAL_PDF }]));
  fs.writeFileSync(path.join(outDir, invoiceFileName), MINIMAL_PDF);

  return {
    outDir,
    excelPath,
    zipPath,
    fromDate,
    toDate,
    invoiceFileName,
    salesType: options.salesType || 'domestic',
    row,
  };
}

async function selectDomesticSales(page, log) {
  const domestic = page
    .locator('label.radio-option')
    .filter({ hasText: /Domestic Sales/i })
    .first();

  if ((await domestic.count()) > 0) {
    await domestic.click();
    log('Selected Domestic Sales', 'success');
    await sleep(500);
  } else {
    log('Domestic Sales radio not found — continuing', 'info');
  }
}

/**
 * After login: Select Unit → Operations Sales Details View → Bulk Entry → fill.
 * Does NOT click Preview / submit.
 */
export async function runSalesBulkFill(page, { onLog, files, unitId, unitName, salesType, fromDate, toDate } = {}) {
  const log = (text, level = 'info') => {
    if (typeof onLog === 'function') onLog(text, level);
  };

  // 1) Always Select Unit first on /onboarding/
  await ensureUnitSelected(page, { onLog, unitId, unitName, force: true });

  // 2) Prepare dummy files
  const prepared =
    files ||
    prepareDummySalesBulk({
      salesType: salesType || 'domestic',
      fromDate,
      toDate,
    });

  log(`Dummy Excel ready: ${path.basename(prepared.excelPath)}`, 'success');
  log(`Dummy Invoice ZIP ready: ${path.basename(prepared.zipPath)}`, 'success');
  log(`From ${prepared.fromDate} → To ${prepared.toDate}`, 'info');

  // 3) Same page → Operations → Sales Details → View → Bulk Entry (no URL goto)
  log('Opening Sales via Operations View…', 'info');
  await openModuleViaOperationsView(page, ['Sales Details', 'Cement Co-Processing', 'Cement Co-processing'], { onLog });

  log('Filling From Date…', 'info');
  await setBulkDate(page, 'From Date', prepared.fromDate);
  log(`From Date set: ${isoToDisplay(prepared.fromDate)}`, 'success');

  log('Filling To Date…', 'info');
  await setBulkDate(page, 'To Date', prepared.toDate);
  log(`To Date set: ${isoToDisplay(prepared.toDate)}`, 'success');

  await selectDomesticSales(page, log);

  log('Uploading Excel sheet…', 'info');
  await setHiddenFile(page, '.xlsx', prepared.excelPath);
  log('Excel sheet attached', 'success');

  log('Uploading Invoice ZIP…', 'info');
  await setHiddenFile(page, '.zip', prepared.zipPath);
  log('Invoice ZIP attached', 'success');

  log('Sales form filled (Preview / Submit NOT clicked — dry run).', 'success');

  return {
    success: true,
    url: page.url(),
    prepared,
    previewClicked: false,
  };
}
