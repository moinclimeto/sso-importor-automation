/**
 * CPCB Procurement Bulk Entry helpers:
 * - prepare dummy Excel + invoice ZIP
 * - navigate to bulk-entry and fill form (no Preview / submit)
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx';

export const CPCB_PROCUREMENT_BULK_URL =
  'https://epr.cpcb.gov.in/onboarding/procurement-details/bulk-entry';

/** Select Unit button lives on the onboarding shell (not dashboard-only). */
export const CPCB_ONBOARDING_URL = 'https://epr.cpcb.gov.in/onboarding/';

export const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF
`,
  'utf8'
);

/** CRC-32 for ZIP local headers */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

/** Create a store-method ZIP (no external deps). */
export function createZipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const localFull = Buffer.concat([local, nameBuf, data]);
    locals.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localFull.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, end]);
}

export function isoToDisplay(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** CPCB bulk entry: date range cannot exceed 1 month. */
export function clampBulkDateRange(fromDate, toDate) {
  const to = toDate && /^\d{4}-\d{2}-\d{2}/.test(toDate) ? toDate.slice(0, 10) : todayIso();
  let from =
    fromDate && /^\d{4}-\d{2}-\d{2}/.test(fromDate) ? fromDate.slice(0, 10) : '';

  const toMs = new Date(`${to}T12:00:00`).getTime();
  if (!from) {
    const d = new Date(toMs);
    d.setDate(d.getDate() - 27);
    from = d.toISOString().slice(0, 10);
  }

  const fromMs = new Date(`${from}T12:00:00`).getTime();
  const maxSpanMs = 30 * 24 * 60 * 60 * 1000; // ≤ 30 days inclusive-safe

  if (fromMs > toMs) {
    const d = new Date(toMs);
    d.setDate(d.getDate() - 27);
    from = d.toISOString().slice(0, 10);
  } else if (toMs - fromMs > maxSpanMs) {
    const d = new Date(toMs);
    d.setDate(d.getDate() - 27);
    from = d.toISOString().slice(0, 10);
  }

  return { fromDate: from, toDate: to };
}

/**
 * Build dummy Excel + ZIP under a temp folder for bulk-entry automation.
 * Invoice PDF name inside ZIP matches Excel "Invoice Filename" column.
 */
export function prepareDummyProcurementBulk(options = {}) {
  const outDir =
    options.outDir ||
    path.join(os.tmpdir(), `pwp-cpcb-bulk-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const { fromDate, toDate } = clampBulkDateRange(options.fromDate, options.toDate);
  const invoiceFilename = options.invoiceFilename || 'dummy_invoice_PO_2025_001.pdf';

  const row = {
    'Category of Plastic': 'Cat-I',
    'Name of Supplier': 'Dummy Supplier Pvt Ltd',
    'Address Line 1': 'Plot 1, Industrial Area',
    'Address Line 2': 'Phase 2',
    State: 'Haryana',
    City: 'Gurugram',
    'PIN Code': '122001',
    'Buyer GST': '06AABCC1234D1Z5',
    'Is Supplier GST Available (Yes/No)': 'Yes',
    'Supplier GST Number': '06AABCG1111H1Z8',
    'HSN Code': '3915',
    'Invoice No./GST E-Invoice Number': 'PO-DUMMY-001',
    'IRN No.': '',
    'Qty. of Waste Plastic (MT)': 1,
    'Qty. of Waste Plastic (Kg)': 1000,
    'Date of Entry (YYYY-MM-DD)': toDate,
    'Procurement date (YYYY-MM-DD)': fromDate,
    'Invoice Filename': invoiceFilename,
  };

  const headers = Object.keys(row);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([row], { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(36, Math.max(14, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Procurement');

  const excelPath = path.join(outDir, 'procurement_bulk_dummy.xlsx');
  XLSX.writeFile(wb, excelPath);

  const zipPath = path.join(outDir, 'procurement_invoices_dummy.zip');
  const zipBuf = createZipStore([{ name: invoiceFilename, data: MINIMAL_PDF }]);
  fs.writeFileSync(zipPath, zipBuf);

  // Also keep loose PDF for debugging
  fs.writeFileSync(path.join(outDir, invoiceFilename), MINIMAL_PDF);

  return {
    outDir,
    excelPath,
    zipPath,
    fromDate,
    toDate,
    invoiceFilename,
    row,
  };
}

export async function setBulkDate(page, labelText, isoDate) {
  const field = page
    .locator('app-input-date')
    .filter({ has: page.locator(`label.input-label:has-text("${labelText}")`) })
    .first();

  await field.waitFor({ state: 'visible', timeout: 30000 });

  const display = isoToDisplay(isoDate);
  const native = field.locator('input.native-date-picker-proxy');
  const masked = field.locator('input.masked-date-input');

  // Prefer native date proxy (Angular often listens here)
  if ((await native.count()) > 0) {
    await native.evaluate((el, v) => {
      el.disabled = false;
      el.removeAttribute('disabled');
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, isoDate);
  }

  await masked.click({ force: true }).catch(() => {});
  await masked.fill('');
  await masked.pressSequentially(display, { delay: 40 });
  await masked.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  });
}

export async function setHiddenFile(page, acceptSubstring, filePath) {
  const input = page.locator(`input.file-input-hidden[accept*="${acceptSubstring}"]`).first();
  await input.waitFor({ state: 'attached', timeout: 30000 });
  await input.setInputFiles(filePath);
  await input.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/** True only when top header shows "Unit ID : NNN" (not random page text). */
async function hasUnitIdInHeader(page) {
  try {
    const header = page
      .locator('.layout-topbar, .layout-top, app-topbar, .app-header, header')
      .first();
    if ((await header.count()) > 0) {
      const t = (await header.innerText({ timeout: 3000 })) || '';
      if (/Unit\s*ID\s*:\s*\d+/i.test(t)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Always open https://epr.cpcb.gov.in/onboarding/ → Select Unit → click unit card.
 * Required before procurement / sales bulk upload.
 */
export async function ensureUnitSelected(page, { onLog, unitId, unitName, force = true } = {}) {
  const log = (text, level = 'info') => {
    if (typeof onLog === 'function') onLog(text, level);
  };

  log('Going to onboarding to Select Unit…', 'info');
  await page.goto(CPCB_ONBOARDING_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await sleep(2500);

  // User asked: always select unit after login (do not skip unless force=false)
  if (!force && (await hasUnitIdInHeader(page))) {
    log('Unit already selected in header — skipping', 'success');
    return { selected: true, skipped: true };
  }

  const selectBtn = page
    .locator(
      [
        '.breadcrumb-right button[title="Select Unit"]',
        'button[title="Select Unit"]',
        'button.action-btn.btn-design:has-text("Select Unit")',
        'button:has-text("Select Unit")',
      ].join(', ')
    )
    .first();

  await selectBtn.waitFor({ state: 'visible', timeout: 45000 });
  await selectBtn.scrollIntoViewIfNeeded().catch(() => {});
  await selectBtn.click({ force: true });
  log('Clicked Select Unit button', 'success');

  const modal = page.locator('.common-modal-panel, .unit-modal__body').first();
  await modal.waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('button.unit-card').first().waitFor({ state: 'visible', timeout: 20000 });
  log('Select Unit modal opened', 'success');

  let card = page.locator('button.unit-card').first();
  if (unitId) {
    const byId = page.locator('button.unit-card').filter({ hasText: String(unitId) });
    if ((await byId.count()) > 0) card = byId.first();
  } else if (unitName) {
    const byName = page.locator('button.unit-card').filter({ hasText: unitName });
    if ((await byName.count()) > 0) card = byName.first();
  }

  const aria = (await card.getAttribute('aria-label')) || 'unit card';
  await card.click({ force: true });
  log(`Unit card clicked: ${aria}`, 'success');

  // Wait until modal closes
  await page
    .locator('.common-modal-panel')
    .first()
    .waitFor({ state: 'hidden', timeout: 25000 })
    .catch(() => {});

  await sleep(2000);

  // Confirm Unit ID in header — retry Select Unit once if missing
  if (!(await hasUnitIdInHeader(page))) {
    log('Unit ID not in header yet — retrying Select Unit…', 'info');
    if ((await selectBtn.count()) > 0 && (await selectBtn.isVisible().catch(() => false))) {
      await selectBtn.click({ force: true }).catch(() => {});
      await page.locator('button.unit-card').first().waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('button.unit-card').first().click({ force: true });
      await sleep(2000);
    }
  }

  if (!(await hasUnitIdInHeader(page))) {
    // Last check: any visible Unit ID near top of page
    const bodyTop = ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 1500);
    if (!/Unit\s*ID\s*:\s*\d+/i.test(bodyTop)) {
      throw new Error(
        'Unit was not selected. Select Unit modal / unit card click failed on /onboarding/.'
      );
    }
  }

  log('Unit selected successfully', 'success');
  return { selected: true, skipped: false, label: aria };
}

/**
 * After unit select: stay on same SPA page and open module via Operations card View.
 * Hard URL navigation drops unit context — so we only click UI.
 * moduleLabel: "Procurement Details" | "Sales Details" | "Production Details"
 */
export async function openModuleViaOperationsView(page, moduleLabel, { onLog } = {}) {
  const log = (text, level = 'info') => {
    if (typeof onLog === 'function') onLog(text, level);
  };

  // If Operations card not on current view, go to Dashboard via sidebar click (no full reload)
  let opsRow = page
    .locator('.operations-row, .operations-row-content')
    .filter({ hasText: moduleLabel })
    .first();

  if ((await opsRow.count()) === 0 || !(await opsRow.isVisible().catch(() => false))) {
    log('Operations card not visible — opening Dashboard…', 'info');
    const dash = page
      .locator(
        [
          'a[href*="dashboard"]',
          '.sidebar a:has-text("Dashboard")',
          'nav a:has-text("Dashboard")',
          'button:has-text("Dashboard")',
          '.menu-item:has-text("Dashboard")',
        ].join(', ')
      )
      .first();
    if ((await dash.count()) > 0) {
      await dash.click({ force: true });
      await sleep(2500);
    }
    opsRow = page
      .locator('.operations-row')
      .filter({ has: page.locator(`.operations-row-label:has-text("${moduleLabel}")`) })
      .first();
  }

  // Fallback selector
  if ((await opsRow.count()) === 0) {
    opsRow = page.locator('.operations-row').filter({ hasText: moduleLabel }).first();
  }

  await opsRow.waitFor({ state: 'visible', timeout: 45000 });
  const viewBtn = opsRow
    .locator('button.custom-btn.btn-link, button.btn-underline, button:has-text("View")')
    .first();
  await viewBtn.waitFor({ state: 'visible', timeout: 15000 });
  await viewBtn.click({ force: true });
  log(`Clicked View — ${moduleLabel}`, 'success');
  await sleep(2500);

  // Open Bulk Entry from within the module (sidebar / tabs / links) — no page.goto
  const bulkNav = page
    .locator(
      [
        'a[href*="bulk-entry"]',
        '.sidebar a:has-text("Bulk Entry")',
        'nav a:has-text("Bulk Entry")',
        '[role="tab"]:has-text("Bulk Entry")',
        'button:has-text("Bulk Entry")',
        'a:has-text("Bulk Entry")',
        '.breadcrumb a:has-text("Bulk Entry")',
      ].join(', ')
    )
    .first();

  await bulkNav.waitFor({ state: 'visible', timeout: 30000 });
  await bulkNav.click({ force: true });
  log('Clicked Bulk Entry', 'success');
  await sleep(2500);

  await page.waitForSelector(
    'form.bulk-entry-form, .bulk-entry-page, h1.section-title:has-text("Bulk Entry")',
    { timeout: 45000 }
  );
  log('Bulk Entry page loaded (unit context kept)', 'success');
}

/**
 * After login: select unit → Operations View → Bulk Entry → fill fields.
 * Does NOT click Preview / submit. Does NOT use hard URL goto after unit select.
 */
export async function runProcurementBulkFill(page, { onLog, files, unitId, unitName } = {}) {
  const log = (text, level = 'info') => {
    if (typeof onLog === 'function') onLog(text, level);
  };

  // 1) Select Unit on /onboarding/
  await ensureUnitSelected(page, { onLog, unitId, unitName, force: true });

  // 2) Prepare dummy files
  const prepared = files || prepareDummyProcurementBulk();
  log(`Dummy Excel ready: ${path.basename(prepared.excelPath)}`, 'success');
  log(`Dummy Invoice ZIP ready: ${path.basename(prepared.zipPath)}`, 'success');
  log(`From ${prepared.fromDate} → To ${prepared.toDate}`, 'info');

  // 3) Same page → Operations → Procurement Details → View → Bulk Entry
  log('Opening Procurement via Operations View…', 'info');
  await openModuleViaOperationsView(page, 'Procurement Details', { onLog });

  log('Filling From Date…', 'info');
  await setBulkDate(page, 'From Date', prepared.fromDate);
  log(`From Date set: ${isoToDisplay(prepared.fromDate)}`, 'success');

  log('Filling To Date…', 'info');
  await setBulkDate(page, 'To Date', prepared.toDate);
  log(`To Date set: ${isoToDisplay(prepared.toDate)}`, 'success');

  log('Uploading Excel sheet…', 'info');
  await setHiddenFile(page, '.xlsx', prepared.excelPath);
  log('Excel sheet attached', 'success');

  log('Uploading Invoice ZIP…', 'info');
  await setHiddenFile(page, '.zip', prepared.zipPath);
  log('Invoice ZIP attached', 'success');

  log('Form filled (Preview / Submit NOT clicked — dry run).', 'success');

  return {
    success: true,
    url: page.url(),
    prepared,
    previewClicked: false,
  };
}
