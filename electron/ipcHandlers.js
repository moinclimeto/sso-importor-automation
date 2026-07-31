import { app, ipcMain } from 'electron';
import { registerOcrHandlers } from './ocrHandlers.js';
import { warmupQrScanner } from './qrScan.js';
import { initDatabase, getDb, dbJsonPath } from './database.js';
import { chromium } from 'playwright';
import { migrateFromJsonToSqlite } from './dataMigration.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import {
  prepareDummyProcurementBulk,
  runProcurementBulkFill,
  CPCB_ONBOARDING_URL,
} from './cpcbProcurementBulk.js';
import {
  runSalesBulkFill,
} from './cpcbSalesBulk.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { extractEprProfile } = require("../src/extractors/epr/profile.extractor.cjs");
const { extractEprApplication } = require("../src/extractors/epr/application.extractor.cjs");
const { extractEprMaterial } = require("../src/extractors/epr/material.extractor.cjs");
const { extractEprProduction } = require("../src/extractors/epr/production.extractor.cjs");
const { extractEprSales } = require("../src/extractors/epr/sales.extractor.cjs");
const { extractEprWallet } = require("../src/extractors/epr/wallet.extractor.cjs");
const { extractEprAnnualFiling } = require("../src/extractors/epr/annual_filing.extractor.cjs");

export function registerIpcHandlers() {
  initDatabase(async (dbInstance) => {
    await migrateFromJsonToSqlite(dbInstance, dbJsonPath);
  }).catch(err => console.error("Failed to initialize database:", err));
  registerOcrHandlers();
  warmupQrScanner().catch(() => {});

  // ─── COMPANIES ───────────────────────────────────────────────
  ipcMain.handle('companies:getAll', async () => {
    const db = getDb();
    return db.all('SELECT * FROM companies ORDER BY name COLLATE NOCASE ASC');
  });

  ipcMain.handle('companies:add', async (_, data) => {
    const db = getDb();
    const result = await db.run(
      'INSERT INTO companies (name, gstin, pan, entity_type, created_at) VALUES (?, ?, ?, ?, ?)',
      data.name, data.gstin, data.pan, data.entity_type, new Date().toISOString()
    );
    return { id: result.lastID, ...data };
  });

  ipcMain.handle('companies:update', async (_, data) => {
    const db = getDb();
    await db.run(
      'UPDATE companies SET name = ?, gstin = ?, pan = ?, entity_type = ? WHERE id = ?',
      data.name, data.gstin, data.pan, data.entity_type, data.id
    );
    return { success: true };
  });

  ipcMain.handle('companies:delete', async (_, id) => {
    const db = getDb();
    await db.run('DELETE FROM companies WHERE id = ?', id);
    return { success: true };
  });

  // ─── PURCHASES ───────────────────────────────────────────────
  ipcMain.handle('purchases:getAll', async (_, filters) => {
    const db = getDb();
    let query = `
      SELECT
        p.*,
        c.name AS company_name
      FROM purchases p
      LEFT JOIN companies c ON p.company_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (filters?.company_id) {
      conditions.push('p.company_id = ?');
      params.push(filters.company_id);
    }
    if (filters?.from_date) {
      conditions.push('p.invoice_date >= ?');
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      conditions.push('p.invoice_date <= ?');
      params.push(filters.to_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY p.invoice_date DESC`;

    const res = await db.all(query, ...params);

    // Parse JSON fields back to objects
    return res.map(row => ({
      ...row,
      line_items: row.line_items ? JSON.parse(row.line_items) : null,
      extraction: row.extraction ? JSON.parse(row.extraction) : null,
      _source_fields: row._source_fields ? JSON.parse(row._source_fields) : null,
      _routing: row._routing ? JSON.parse(row._routing) : null,
    }));
  });

  ipcMain.handle('purchases:add', async (_, data) => {
    const db = getDb();
    const stmt = await db.prepare(`
      INSERT INTO purchases (
        company_id, record_type, category_of_plastic, supplier_name, address_line_1,
        address_line_2, state, city, pin_code, buyer_gst, is_supplier_gst_available,
        supplier_gst_number, supplier_mobile_number, procurement_date, quantity_mt,
        invoice_number, hsn_code, invoice_filename, vendor_name, vendor_gstin, invoice_no,
        invoice_date, item_name, quantity, unit, total_amount, line_items, extraction,
        _source_fields, _routing, file_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.run(
      data.company_id,
      data.record_type,
      data.category_of_plastic,
      data.supplier_name,
      data.address_line_1,
      data.address_line_2,
      data.state,
      data.city,
      data.pin_code,
      data.buyer_gst,
      data.is_supplier_gst_available,
      data.supplier_gst_number,
      data.supplier_mobile_number,
      data.procurement_date,
      data.quantity_mt,
      data.invoice_number,
      data.hsn_code,
      data.invoice_filename,
      data.vendor_name,
      data.vendor_gstin,
      data.invoice_no,
      data.invoice_date,
      data.item_name,
      data.quantity,
      data.unit,
      data.total_amount,
      data.lineItems ? JSON.stringify(data.lineItems) : null,
      data.extraction ? JSON.stringify(data.extraction) : null,
      data._source_fields ? JSON.stringify(data._source_fields) : null,
      data._routing ? JSON.stringify(data._routing) : null,
      data.fileHash || null,
      new Date().toISOString()
    );
    await stmt.finalize();

    // Add fileHash to the fileHashes table
    if (data.fileHash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', data.fileHash);
    }

    return { id: result.lastID, ...data };
  });

  ipcMain.handle('purchases:update', async (_, data) => {
    const db = getDb();
    const oldData = await db.get('SELECT file_hash FROM purchases WHERE id = ?', data.id);

    const stmt = await db.prepare(`
      UPDATE purchases SET
        company_id = ?, record_type = ?, category_of_plastic = ?, supplier_name = ?, address_line_1 = ?,
        address_line_2 = ?, state = ?, city = ?, pin_code = ?, buyer_gst = ?, is_supplier_gst_available = ?,
        supplier_gst_number = ?, supplier_mobile_number = ?, procurement_date = ?, quantity_mt = ?,
        invoice_number = ?, hsn_code = ?, invoice_filename = ?, vendor_name = ?, vendor_gstin = ?, invoice_no = ?,
        invoice_date = ?, item_name = ?, quantity = ?, unit = ?, total_amount = ?, line_items = ?, extraction = ?,
        _source_fields = ?, _routing = ?, file_hash = ?
      WHERE id = ?
    `);

    await stmt.run(
      data.company_id,
      data.record_type,
      data.category_of_plastic,
      data.supplier_name,
      data.address_line_1,
      data.address_line_2,
      data.state,
      data.city,
      data.pin_code,
      data.buyer_gst,
      data.is_supplier_gst_available,
      data.supplier_gst_number,
      data.supplier_mobile_number,
      data.procurement_date,
      data.quantity_mt,
      data.invoice_number,
      data.hsn_code,
      data.invoice_filename,
      data.vendor_name,
      data.vendor_gstin,
      data.invoice_no,
      data.invoice_date,
      data.item_name,
      data.quantity,
      data.unit,
      data.total_amount,
      data.lineItems ? JSON.stringify(data.lineItems) : null,
      data.extraction ? JSON.stringify(data.extraction) : null,
      data._source_fields ? JSON.stringify(data._source_fields) : null,
      data._routing ? JSON.stringify(data._routing) : null,
      data.fileHash || null,
      data.id
    );
    await stmt.finalize();

    // Update fileHash in the file_hashes table if it changed
    if (data.fileHash && oldData.file_hash !== data.fileHash) {
      await db.run('UPDATE file_hashes SET hash = ? WHERE hash = ?', data.fileHash, oldData.file_hash);
      if (!(await db.get('SELECT 1 FROM file_hashes WHERE hash = ?', data.fileHash))) {
        await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', data.fileHash);
      }
    } else if (data.fileHash && !oldData.file_hash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', data.fileHash);
    }

    return { success: true };
  });

  ipcMain.handle('purchases:delete', async (_, id) => {
    const db = getDb();
    const record = await db.get('SELECT file_hash FROM purchases WHERE id = ?', id);
    await db.run('DELETE FROM purchases WHERE id = ?', id);
    if (record?.file_hash) {
      const otherUses = await db.get('SELECT 1 FROM purchases WHERE file_hash = ? UNION ALL SELECT 1 FROM sales WHERE file_hash = ?', record.file_hash, record.file_hash);
      if (!otherUses) {
        await db.run('DELETE FROM file_hashes WHERE hash = ?', record.file_hash);
      }
    }
    return { success: true };
  });

  ipcMain.handle('purchases:getSummary', async (_, filters) => {
    const db = getDb();
    let query = 'SELECT SUM(total_amount) as total_amount, SUM(taxable_amount) as total_taxable, SUM(cgst_amount) as total_cgst, SUM(sgst_amount) as total_sgst, SUM(igst_amount) as total_igst, COUNT(id) as total_records FROM purchases';
    const params = [];
    const conditions = [];

    if (filters?.company_id) {
      conditions.push('company_id = ?');
      params.push(filters.company_id);
    }
    if (filters?.from_date) {
      conditions.push('invoice_date >= ?');
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      conditions.push('invoice_date <= ?');
      params.push(filters.to_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const summary = await db.get(query, ...params);
    return {
      total_records: summary.total_records || 0,
      total_taxable: summary.total_taxable || 0,
      total_cgst: summary.total_cgst || 0,
      total_sgst: summary.total_sgst || 0,
      total_igst: summary.total_igst || 0,
      total_amount: summary.total_amount || 0,
    };
  });

  // ─── SALES ────────────────────────────────────────────────────
  ipcMain.handle('sales:getAll', async (_, filters) => {
    const db = getDb();
    let query = `
      SELECT
        s.*,
        c.name AS company_name
      FROM sales s
      LEFT JOIN companies c ON s.company_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (filters?.company_id) {
      conditions.push('s.company_id = ?');
      params.push(filters.company_id);
    }
    if (filters?.from_date) {
      conditions.push('s.invoice_date >= ?');
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      conditions.push('s.invoice_date <= ?');
      params.push(filters.to_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY s.invoice_date DESC`;

    const res = await db.all(query, ...params);

    // Parse JSON fields back to objects
    return res.map(row => ({
      ...row,
      line_items: row.line_items ? JSON.parse(row.line_items) : null,
      extraction: row.extraction ? JSON.parse(row.extraction) : null,
      _source_fields: row._source_fields ? JSON.parse(row._source_fields) : null,
      _routing: row._routing ? JSON.parse(row._routing) : null,
    }));
  });

  ipcMain.handle('sales:add', async (_, data) => {
    const db = getDb();
    const stmt = await db.prepare(`
      INSERT INTO sales (
        company_id, record_type, s_no, category_of_plastic, process_code,
        plastic_type, product_type, recycled_plastic_percent, conversion_factor,
        available_quantity_mt, quantity_sold_mt, registration_type, entity_name,
        address, state, district, account_number, ifsc_code, gst_other_charges,
        invoice_file_name, application_number, customer_name, customer_gstin, invoice_no,
        invoice_date, item_name, quantity, unit, total_amount, line_items, extraction,
        _source_fields, _routing, file_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.run(
      data.company_id,
      data.record_type,
      data.s_no,
      data.category_of_plastic,
      data.process_code,
      data.plastic_type,
      data.product_type,
      data.recycled_plastic_percent,
      data.conversion_factor,
      data.available_quantity_mt,
      data.quantity_sold_mt,
      data.registration_type,
      data.entity_name,
      data.address,
      data.state,
      data.district,
      data.account_number,
      data.ifsc_code,
      data.gst_other_charges,
      data.invoice_file_name,
      data.application_number,
      data.customer_name,
      data.customer_gstin,
      data.invoice_no,
      data.invoice_date,
      data.item_name,
      data.quantity,
      data.unit,
      data.total_amount,
      data.lineItems ? JSON.stringify(data.lineItems) : null,
      data.extraction ? JSON.stringify(data.extraction) : null,
      data._source_fields ? JSON.stringify(data._source_fields) : null,
      data._routing ? JSON.stringify(data._routing) : null,
      data.fileHash || null,
      new Date().toISOString()
    );
    await stmt.finalize();

    // Add fileHash to the file_hashes table
    if (data.fileHash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', data.fileHash);
    }

    return { id: result.lastID, ...data };
  });

  ipcMain.handle('sales:update', async (_, data) => {
    const db = getDb();
    const oldData = await db.get('SELECT file_hash FROM sales WHERE id = ?', data.id);

    const stmt = await db.prepare(`
      UPDATE sales SET
        company_id = ?, record_type = ?, s_no = ?, category_of_plastic = ?, process_code = ?,
        plastic_type = ?, product_type = ?, recycled_plastic_percent = ?, conversion_factor = ?,
        available_quantity_mt = ?, quantity_sold_mt = ?, registration_type = ?, entity_name = ?,
        address = ?, state = ?, district = ?, account_number = ?, ifsc_code = ?, gst_other_charges = ?,
        invoice_file_name = ?, application_number = ?, customer_name = ?, customer_gstin = ?, invoice_no = ?,
        invoice_date = ?, item_name = ?, quantity = ?, unit = ?, total_amount = ?, line_items = ?, extraction = ?,
        _source_fields = ?, _routing = ?, file_hash = ?
      WHERE id = ?
    `);

    await stmt.run(
      data.company_id,
      data.record_type,
      data.s_no,
      data.category_of_plastic,
      data.process_code,
      data.plastic_type,
      data.product_type,
      data.recycled_plastic_percent,
      data.conversion_factor,
      data.available_quantity_mt,
      data.quantity_sold_mt,
      data.registration_type,
      data.entity_name,
      data.address,
      data.state,
      data.district,
      data.account_number,
      data.ifsc_code,
      data.gst_other_charges,
      data.invoice_file_name,
      data.application_number,
      data.customer_name,
      data.customer_gstin,
      data.invoice_no,
      data.invoice_date,
      data.item_name,
      data.quantity,
      data.unit,
      data.total_amount,
      data.lineItems ? JSON.stringify(data.lineItems) : null,
      data.extraction ? JSON.stringify(data.extraction) : null,
      data._source_fields ? JSON.stringify(data._source_fields) : null,
      data._routing ? JSON.stringify(data._routing) : null,
      data.fileHash || null,
      data.id
    );
    await stmt.finalize();

    // Update fileHash in the file_hashes table if it changed
    if (data.fileHash && oldData.file_hash !== data.fileHash) {
      await db.run('UPDATE file_hashes SET hash = ? WHERE hash = ?', data.fileHash, oldData.file_hash);
      if (!(await db.get('SELECT 1 FROM file_hashes WHERE hash = ?', data.fileHash))) {
        await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', data.fileHash);
      }
    } else if (data.fileHash && !oldData.file_hash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', data.fileHash);
    }

    return { success: true };
  });

  ipcMain.handle('sales:delete', async (_, id) => {
    const db = getDb();
    const record = await db.get('SELECT file_hash FROM sales WHERE id = ?', id);
    await db.run('DELETE FROM sales WHERE id = ?', id);
    if (record?.file_hash) {
      const otherUses = await db.get('SELECT 1 FROM purchases WHERE file_hash = ? UNION ALL SELECT 1 FROM sales WHERE file_hash = ?', record.file_hash, record.file_hash);
      if (!otherUses) {
        await db.run('DELETE FROM file_hashes WHERE hash = ?', record.file_hash);
      }
    }
    return { success: true };
  });

  ipcMain.handle('sales:getSummary', async (_, filters) => {
    const db = getDb();
    let query = 'SELECT SUM(total_amount) as total_amount, SUM(taxable_amount) as total_taxable, SUM(cgst_amount) as total_cgst, SUM(sgst_amount) as total_sgst, SUM(igst_amount) as total_igst, COUNT(id) as total_records FROM sales';
    const params = [];
    const conditions = [];

    if (filters?.company_id) {
      conditions.push('company_id = ?');
      params.push(filters.company_id);
    }
    if (filters?.from_date) {
      conditions.push('invoice_date >= ?');
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      conditions.push('invoice_date <= ?');
      params.push(filters.to_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const summary = await db.get(query, ...params);
    return {
      total_records: summary.total_records || 0,
      total_taxable: summary.total_taxable || 0,
      total_cgst: summary.total_cgst || 0,
      total_sgst: summary.total_sgst || 0,
      total_igst: summary.total_igst || 0,
      total_amount: summary.total_amount || 0,
    };
  });

  // ─── DASHBOARD STATS ─────────────────────────────────────────
  ipcMain.handle('dashboard:getStats', async () => {
    const db = getDb();

    const purchaseTotal = (await db.get('SELECT SUM(total_amount) as total FROM purchases')).total || 0;
    const saleTotal = (await db.get('SELECT SUM(total_amount) as total FROM sales')).total || 0;

    const monthlyPurchaseData = await db.all(
      'SELECT SUBSTR(invoice_date, 1, 7) as month, SUM(total_amount) as total FROM purchases WHERE invoice_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6'
    );
    const monthlySaleData = await db.all(
      'SELECT SUBSTR(invoice_date, 1, 7) as month, SUM(total_amount) as total FROM sales WHERE invoice_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6'
    );

    return {
      purchaseTotal: purchaseTotal,
      saleTotal: saleTotal,
      purchaseCount: (await db.get('SELECT COUNT(id) as count FROM purchases')).count,
      saleCount: (await db.get('SELECT COUNT(id) as count FROM sales')).count,
      companyCount: (await db.get('SELECT COUNT(id) as count FROM companies')).count,
      profit: saleTotal - purchaseTotal,
      monthlyPurchase: monthlyPurchaseData.map(row => ({ month: row.month, total: row.total || 0 })),
      monthlySale: monthlySaleData.map(row => ({ month: row.month, total: row.total || 0 })),
    };
  });

  // ─── SCRAPER / CPCB PORTAL ────────────────────────────────────
  let cpcbBrowser = null;
  let cpcbContext = null;
  let cpcbPage = null;
  let cpcbUploadType = 'purchase';
  let cpcbLaunchPromise = null;
  let cpcbKeepAliveTimer = null;
  let cpcbKeepAliveBusy = false;
  const CPCB_KEEP_ALIVE_MS = 4 * 60 * 1000; // every 4 minutes

  const getCpcbSessionDir = () => {
    const dir = path.join(app.getPath('userData'), 'cpcb-browser-session');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  const isOnLoginPage = (url = '') =>
    /\/login/i.test(url) || url === 'about:blank' || url === '';

  /** Public / unauthenticated portal pages (not a logged-in session). */
  const isPublicPortalPage = (url = '') => {
    if (!url || isOnLoginPage(url)) return true;
    try {
      const u = new URL(url);
      const p = (u.pathname || '/').replace(/\/+$/, '') || '/';
      if (p === '/' || p === '/home') return true;
      if (/^\/(about|register|faqs|contact)/i.test(p)) return true;
      return false;
    } catch {
      return true;
    }
  };

  /** True only on authenticated app routes (onboarding / dashboard / etc.). */
  const isAuthenticatedUrl = (url = '') => {
    if (!url || isPublicPortalPage(url)) return false;
    return /\/(onboarding|dashboard)\b/i.test(url);
  };

  const stopCpcbKeepAlive = () => {
    if (cpcbKeepAliveTimer) {
      clearInterval(cpcbKeepAliveTimer);
      cpcbKeepAliveTimer = null;
    }
  };

  /**
   * Lightweight ping — does NOT navigate (keeps unit + form state).
   * Hits onboarding with credentials so server session stays warm.
   */
  const pingCpcbSession = async () => {
    if (cpcbKeepAliveBusy) return { ok: false, skipped: true };
    if (!cpcbPage || cpcbPage.isClosed()) {
      stopCpcbKeepAlive();
      return { ok: false, reason: 'no-page' };
    }
    try {
      const url = cpcbPage.url() || '';
      if (isOnLoginPage(url) || isPublicPortalPage(url)) {
        stopCpcbKeepAlive();
        return { ok: false, reason: 'not-logged-in' };
      }

      await cpcbPage.evaluate(async () => {
        const endpoints = [
          'https://epr.cpcb.gov.in/onboarding/',
          'https://epr.cpcb.gov.in/onboarding/dashboard',
        ];
        for (const ep of endpoints) {
          try {
            await fetch(ep, {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
          } catch {
            /* try next */
          }
        }
      });

      return { ok: true, t: Date.now() };
    } catch (err) {
      return { ok: false, error: err?.message || 'ping failed' };
    }
  };

  const startCpcbKeepAlive = () => {
    stopCpcbKeepAlive();
    cpcbKeepAliveTimer = setInterval(() => {
      pingCpcbSession().catch(() => {});
    }, CPCB_KEEP_ALIVE_MS);
    // Warm once shortly after login
    setTimeout(() => {
      pingCpcbSession().catch(() => {});
    }, 20_000);
  };

  /** Keep a single working tab; close leftover about:blank tabs. */
  const pruneExtraTabs = async (keepPage) => {
    if (!cpcbContext) return;
    const pages = cpcbContext.pages();
    for (const p of pages) {
      if (p === keepPage) continue;
      let url = '';
      try {
        url = p.url() || '';
      } catch {
        continue;
      }
      if (!url || url === 'about:blank' || url === 'chrome://newtab/') {
        await p.close().catch(() => {});
      }
    }
  };

  const fillLoginForm = async (page, ceprId, ceprPassword) => {
    await page.waitForSelector('input[placeholder="Enter CEPR User ID"]', {
      timeout: 30000,
    });

    const userInput = page.locator('input[placeholder="Enter CEPR User ID"]').first();
    let passInput = page.locator('input[placeholder="Password"]').first();
    if ((await passInput.count()) === 0) {
      passInput = page.locator('input[type="password"]').first();
    }
    await passInput.waitFor({ timeout: 15000 });

    await userInput.click();
    await userInput.fill(ceprId);
    await passInput.click();
    await passInput.fill(ceprPassword);

    await userInput.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    await passInput.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    });
  };

  /**
   * Probe session via /onboarding/ (same tab — no new tabs).
   * Logged in only on authenticated onboarding routes, not /home.
   */
  const detectExistingSession = async (page) => {
    try {
      await page.goto(CPCB_ONBOARDING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await new Promise((r) => setTimeout(r, 2000));
      const url = page.url() || '';

      if (isPublicPortalPage(url) || isOnLoginPage(url)) {
        return false;
      }

      if (isAuthenticatedUrl(url)) {
        return true;
      }

      // Onboarding shell with Select Unit = logged in
      const hasSelectUnit =
        (await page.locator('button[title="Select Unit"], button:has-text("Select Unit")').count()) >
        0;
      return hasSelectUnit;
    } catch {
      return false;
    }
  };

  const ensureCpcbBrowser = async () => {
    // Reuse live page
    if (cpcbContext && cpcbPage) {
      try {
        if (!cpcbPage.isClosed()) {
          await cpcbPage.bringToFront();
          await pruneExtraTabs(cpcbPage);
          return { reused: true };
        }
      } catch {
        /* fall through to relaunch */
      }
      cpcbContext = null;
      cpcbBrowser = null;
      cpcbPage = null;
    }

    // Serialize launches — prevents 2–3 blank tabs from parallel calls
    if (cpcbLaunchPromise) {
      await cpcbLaunchPromise;
      if (cpcbContext && cpcbPage && !cpcbPage.isClosed()) {
        await pruneExtraTabs(cpcbPage);
        return { reused: true };
      }
    }

    cpcbLaunchPromise = (async () => {
      const userDataDir = getCpcbSessionDir();
      const launchOpts = {
        headless: false,
        acceptDownloads: true,
        viewport: null,
        args: ['--start-maximized'],
      };

      let context;
      try {
        context = await chromium.launchPersistentContext(userDataDir, {
          ...launchOpts,
          channel: 'chrome',
        });
      } catch {
        context = await chromium.launchPersistentContext(userDataDir, launchOpts);
      }

      cpcbContext = context;
      cpcbBrowser = context;

      // Prefer an existing page; never open extras
      const existing = context.pages();
      cpcbPage = existing.length > 0 ? existing[0] : await context.newPage();
      await pruneExtraTabs(cpcbPage);

      context.on('close', () => {
        stopCpcbKeepAlive();
        cpcbBrowser = null;
        cpcbContext = null;
        cpcbPage = null;
      });

      // If Chrome opens extra blank tabs after launch, prune again shortly
      setTimeout(() => {
        pruneExtraTabs(cpcbPage).catch(() => {});
      }, 800);
    })();

    try {
      await cpcbLaunchPromise;
    } finally {
      cpcbLaunchPromise = null;
    }

    return { reused: false };
  };

  ipcMain.handle('scraper:checkCpcbSession', async (_, { type } = {}) => {
    try {
      cpcbUploadType = type === 'sale' ? 'sale' : 'purchase';
      await ensureCpcbBrowser();
      const loggedIn = await detectExistingSession(cpcbPage);
      if (loggedIn) startCpcbKeepAlive();
      else stopCpcbKeepAlive();
      return {
        success: true,
        loggedIn: Boolean(loggedIn),
        keepAlive: Boolean(loggedIn && cpcbKeepAliveTimer),
        url: cpcbPage?.url?.() || '',
        type: cpcbUploadType,
      };
    } catch (error) {
      return {
        success: false,
        loggedIn: false,
        error: error?.message || 'Session check failed',
      };
    }
  });

  ipcMain.handle('scraper:pingCpcbSession', async () => {
    const res = await pingCpcbSession();
    return { success: Boolean(res?.ok), ...res };
  });

  ipcMain.handle('scraper:startCpcbKeepAlive', async () => {
    startCpcbKeepAlive();
    return { success: true, intervalMs: CPCB_KEEP_ALIVE_MS };
  });

  ipcMain.handle('scraper:stopCpcbKeepAlive', async () => {
    stopCpcbKeepAlive();
    return { success: true };
  });

  ipcMain.handle('scraper:openCpcbPortal', async (_, { type, userId, password } = {}) => {
    try {
      const portalUrl = 'https://epr.cpcb.gov.in/login';
      cpcbUploadType = type === 'sale' ? 'sale' : 'purchase';
      const label = cpcbUploadType === 'sale' ? 'Post Consumer (Sales)' : 'Procurement';
      const ceprId = String(userId || '').trim();
      const ceprPassword = String(password || '');

      const { reused } = await ensureCpcbBrowser();

      // Reuse cookies from persistent profile — skip login if session alive
      const alreadyLoggedIn = await detectExistingSession(cpcbPage);
      if (alreadyLoggedIn) {
        startCpcbKeepAlive();
        return {
          success: true,
          reused,
          alreadyLoggedIn: true,
          keepAlive: true,
          type: cpcbUploadType,
          message: `Existing CPCB session found for ${label}. Login skip.`,
          url: cpcbPage.url(),
          filled: false,
        };
      }

      stopCpcbKeepAlive();

      if (!ceprId || !ceprPassword) {
        return {
          success: false,
          needsLogin: true,
          error:
            'CEPR User ID and Password are required.',
        };
      }

      await cpcbPage.goto(portalUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await fillLoginForm(cpcbPage, ceprId, ceprPassword);

      return {
        success: true,
        reused,
        alreadyLoggedIn: false,
        needsLogin: true,
        type: cpcbUploadType,
        message: `Credentials filled for ${label}. Enter captcha and click Get OTP.`,
        url: portalUrl,
        filled: true,
      };
    } catch (error) {
      console.error('openCpcbPortal failed:', error);
      stopCpcbKeepAlive();
      cpcbBrowser = null;
      cpcbContext = null;
      cpcbPage = null;
      return {
        success: false,
        error: error?.message || 'Failed to open CPCB browser',
      };
    }
  });

  // Wait until user leaves the login page (login success)
  ipcMain.handle('scraper:waitCpcbLogin', async () => {
    try {
      if (!cpcbPage) {
        return { success: false, error: 'Browser not open. Click Open first.' };
      }

      // Already past login (session reuse) — must be authenticated route, not /home
      try {
        const current = cpcbPage.url() || '';
        if (isAuthenticatedUrl(current)) {
          startCpcbKeepAlive();
          return {
            success: true,
            loggedIn: true,
            alreadyLoggedIn: true,
            keepAlive: true,
            url: current,
            type: cpcbUploadType,
            message: 'Already logged in',
          };
        }
      } catch {
        return { success: false, error: 'Browser was closed.' };
      }

      const deadline = Date.now() + 10 * 60 * 1000; // 10 minutes
      while (Date.now() < deadline) {
        if (!cpcbPage) {
          return { success: false, error: 'Browser was closed.' };
        }
        let url = '';
        try {
          url = cpcbPage.url() || '';
        } catch {
          return { success: false, error: 'Browser was closed.' };
        }

        if (isAuthenticatedUrl(url)) {
          startCpcbKeepAlive();
          return {
            success: true,
            loggedIn: true,
            url,
            type: cpcbUploadType,
            keepAlive: true,
            message: 'Logged in successfully',
          };
        }

        await new Promise((r) => setTimeout(r, 1500));
      }

      return {
        success: false,
        error: 'Login timeout. Please login within 10 minutes and try again.',
      };
    } catch (error) {
      return { success: false, error: error?.message || 'Login wait failed' };
    }
  });

  /**
   * After login: open procurement bulk-entry, prepare dummy Excel+ZIP, fill form.
   * Does NOT click Preview / submit.
   */
  ipcMain.handle('scraper:fillProcurementBulk', async (event, payload = {}) => {
    const sendLog = (text, level = 'info') => {
      try {
        event.sender.send('scraper:log', { text, level, t: Date.now() });
      } catch {
        /* ignore */
      }
    };

    cpcbKeepAliveBusy = true;
    try {
      if (!cpcbPage) {
        return { success: false, error: 'Browser not open. Login first.' };
      }

      sendLog('Preparing dummy procurement Excel + invoice ZIP…', 'info');
      const files = prepareDummyProcurementBulk({
        fromDate: payload.fromDate,
        toDate: payload.toDate,
      });

      const result = await runProcurementBulkFill(cpcbPage, {
        files,
        onLog: sendLog,
        unitId: payload.unitId,
        unitName: payload.unitName,
      });

      startCpcbKeepAlive();
      return {
        success: true,
        message: 'Unit selected & Bulk Entry form filled (Preview not clicked).',
        url: result.url,
        excelPath: files.excelPath,
        zipPath: files.zipPath,
        fromDate: files.fromDate,
        toDate: files.toDate,
        previewClicked: false,
        keepAlive: true,
      };
    } catch (error) {
      console.error('fillProcurementBulk failed:', error);
      sendLog(error?.message || 'Bulk fill failed', 'error');
      return {
        success: false,
        error: error?.message || 'Failed to fill Procurement Bulk Entry',
      };
    } finally {
      cpcbKeepAliveBusy = false;
    }
  });

  /**
   * After login: Select Unit → sales-details → Bulk Entry → fill dummy Excel+ZIP.
   * Does NOT click Preview / submit.
   */
  ipcMain.handle('scraper:fillSalesBulk', async (event, payload = {}) => {
    const sendLog = (text, level = 'info') => {
      try {
        event.sender.send('scraper:log', { text, level, t: Date.now() });
      } catch {
        /* ignore */
      }
    };

    cpcbKeepAliveBusy = true;
    try {
      if (!cpcbPage) {
        return { success: false, error: 'Browser not open. Login first.' };
      }

      sendLog('Step 1: Select Unit on /onboarding/, then Sales Bulk Entry…', 'info');

      const result = await runSalesBulkFill(cpcbPage, {
        onLog: sendLog,
        unitId: payload.unitId,
        unitName: payload.unitName,
        salesType: payload.salesType || 'domestic',
        fromDate: payload.fromDate,
        toDate: payload.toDate,
      });

      const prepared = result.prepared;
      startCpcbKeepAlive();

      return {
        success: true,
        message: 'Unit selected & Sales Bulk Entry filled (Preview not clicked).',
        url: result.url,
        excelPath: prepared.excelPath,
        zipPath: prepared.zipPath,
        fromDate: prepared.fromDate,
        toDate: prepared.toDate,
        previewClicked: false,
        keepAlive: true,
      };
    } catch (error) {
      console.error('fillSalesBulk failed:', error);
      sendLog(error?.message || 'Sales bulk fill failed', 'error');
      return {
        success: false,
        error: error?.message || 'Failed to fill Sales Bulk Entry',
      };
    } finally {
      cpcbKeepAliveBusy = false;
    }
  });

  ipcMain.handle('scraper:runEpr', async () => {
    try {
      console.log("Starting EPR scraper...");
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();

      await page.goto('https://epr.cpcb.gov.in/login');
      // In a real scenario, you'd wait for login here
      
      const allData = {};
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
      }

      const saveJson = (filename, data) => {
          fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
      };

      allData.profile = await extractEprProfile(page);
      saveJson('epr_profile.json', allData.profile);

      allData.application = await extractEprApplication(page);
      saveJson('epr_application.json', allData.application);

      allData.material = await extractEprMaterial(page);
      saveJson('epr_material.json', allData.material);

      allData.production = await extractEprProduction(page);
      saveJson('epr_production.json', allData.production);

      allData.sales = await extractEprSales(page);
      saveJson('epr_sales.json', allData.sales);

      allData.wallet = await extractEprWallet(page);
      saveJson('epr_wallet.json', allData.wallet);

      allData.annualFiling = await extractEprAnnualFiling(page);
      saveJson('epr_annual_filing.json', allData.annualFiling);

      saveJson('scraped_data_latest.json', allData);

      await browser.close();
      console.log("EPR Scraping completed successfully.");
      return { success: true, data: allData };
    } catch (error) {
      console.error("Scraper failed:", error);
      return { success: false, error: error.message };
    }
  });
}
