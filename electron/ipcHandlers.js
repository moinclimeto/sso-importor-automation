import { app, ipcMain } from 'electron';
import { registerOcrHandlers } from './ocrHandlers.js';
import { warmupQrScanner } from './qrScan.js';
import { getDb, saveDb } from './database.js';
import { chromium } from 'playwright';
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
  registerOcrHandlers();
  warmupQrScanner().catch(() => {});

  // ─── COMPANIES ───────────────────────────────────────────────
  ipcMain.handle('companies:getAll', () => {
    const db = getDb();
    return db.companies.sort((a, b) => a.name.localeCompare(b.name));
  });

  ipcMain.handle('companies:add', (_, data) => {
    const db = getDb();
    const newCompany = { id: db.nextId++, ...data, created_at: new Date().toISOString() };
    db.companies.push(newCompany);
    saveDb();
    return newCompany;
  });

  ipcMain.handle('companies:update', (_, data) => {
    const db = getDb();
    const idx = db.companies.findIndex(c => c.id === data.id);
    if (idx !== -1) {
      db.companies[idx] = { ...db.companies[idx], ...data };
      saveDb();
    }
    return { success: true };
  });

  ipcMain.handle('companies:delete', (_, id) => {
    const db = getDb();
    db.companies = db.companies.filter(c => c.id !== id);
    saveDb();
    return { success: true };
  });

  // ─── PURCHASES ───────────────────────────────────────────────
  ipcMain.handle('purchases:getAll', (_, filters) => {
    const db = getDb();
    let res = db.purchases.map(p => {
      const comp = db.companies.find(c => c.id === p.company_id);
      return { ...p, company_name: comp ? comp.name : '' };
    });
    if (filters?.company_id) res = res.filter(p => p.company_id === filters.company_id);
    if (filters?.from_date) res = res.filter(p => p.invoice_date >= filters.from_date);
    if (filters?.to_date) res = res.filter(p => p.invoice_date <= filters.to_date);
    return res.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
  });

  ipcMain.handle('purchases:add', (_, data) => {
    const db = getDb();
    const newItem = { id: db.nextId++, ...data, created_at: new Date().toISOString() };
    db.purchases.push(newItem);
    saveDb();
    return newItem;
  });

  ipcMain.handle('purchases:update', (_, data) => {
    const db = getDb();
    const idx = db.purchases.findIndex(p => p.id === data.id);
    if (idx !== -1) {
      db.purchases[idx] = { ...db.purchases[idx], ...data };
      saveDb();
    }
    return { success: true };
  });

  ipcMain.handle('purchases:delete', (_, id) => {
    const db = getDb();
    db.purchases = db.purchases.filter(p => p.id !== id);
    saveDb();
    return { success: true };
  });

  ipcMain.handle('purchases:getSummary', (_, filters) => {
    const db = getDb();
    let res = db.purchases;
    if (filters?.company_id) res = res.filter(p => p.company_id === filters.company_id);
    if (filters?.from_date) res = res.filter(p => p.invoice_date >= filters.from_date);
    if (filters?.to_date) res = res.filter(p => p.invoice_date <= filters.to_date);
    
    return {
      total_records: res.length,
      total_taxable: res.reduce((sum, p) => sum + (p.taxable_amount || 0), 0),
      total_cgst: res.reduce((sum, p) => sum + (p.cgst_amount || 0), 0),
      total_sgst: res.reduce((sum, p) => sum + (p.sgst_amount || 0), 0),
      total_igst: res.reduce((sum, p) => sum + (p.igst_amount || 0), 0),
      total_amount: res.reduce((sum, p) => sum + (p.total_amount || 0), 0),
    };
  });

  // ─── SALES ────────────────────────────────────────────────────
  ipcMain.handle('sales:getAll', (_, filters) => {
    const db = getDb();
    let res = db.sales.map(s => {
      const comp = db.companies.find(c => c.id === s.company_id);
      return { ...s, company_name: comp ? comp.name : '' };
    });
    if (filters?.company_id) res = res.filter(s => s.company_id === filters.company_id);
    if (filters?.from_date) res = res.filter(s => s.invoice_date >= filters.from_date);
    if (filters?.to_date) res = res.filter(s => s.invoice_date <= filters.to_date);
    return res.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
  });

  ipcMain.handle('sales:add', (_, data) => {
    const db = getDb();
    const newItem = { id: db.nextId++, ...data, created_at: new Date().toISOString() };
    db.sales.push(newItem);
    saveDb();
    return newItem;
  });

  ipcMain.handle('sales:update', (_, data) => {
    const db = getDb();
    const idx = db.sales.findIndex(s => s.id === data.id);
    if (idx !== -1) {
      db.sales[idx] = { ...db.sales[idx], ...data };
      saveDb();
    }
    return { success: true };
  });

  ipcMain.handle('sales:delete', (_, id) => {
    const db = getDb();
    db.sales = db.sales.filter(s => s.id !== id);
    saveDb();
    return { success: true };
  });

  ipcMain.handle('sales:getSummary', (_, filters) => {
    const db = getDb();
    let res = db.sales;
    if (filters?.company_id) res = res.filter(s => s.company_id === filters.company_id);
    if (filters?.from_date) res = res.filter(s => s.invoice_date >= filters.from_date);
    if (filters?.to_date) res = res.filter(s => s.invoice_date <= filters.to_date);
    
    return {
      total_records: res.length,
      total_taxable: res.reduce((sum, s) => sum + (s.taxable_amount || 0), 0),
      total_cgst: res.reduce((sum, s) => sum + (s.cgst_amount || 0), 0),
      total_sgst: res.reduce((sum, s) => sum + (s.sgst_amount || 0), 0),
      total_igst: res.reduce((sum, s) => sum + (s.igst_amount || 0), 0),
      total_amount: res.reduce((sum, s) => sum + (s.total_amount || 0), 0),
    };
  });

  // ─── DASHBOARD STATS ─────────────────────────────────────────
  ipcMain.handle('dashboard:getStats', () => {
    const db = getDb();
    const purchaseTotal = db.purchases.reduce((s, p) => s + (p.total_amount || 0), 0);
    const saleTotal = db.sales.reduce((s, x) => s + (x.total_amount || 0), 0);
    
    const monthlyPurchaseObj = {};
    db.purchases.forEach(p => {
      if(!p.invoice_date) return;
      const month = p.invoice_date.substring(0, 7);
      monthlyPurchaseObj[month] = (monthlyPurchaseObj[month] || 0) + (p.total_amount || 0);
    });
    const monthlyPurchase = Object.keys(monthlyPurchaseObj)
      .map(month => ({ month, total: monthlyPurchaseObj[month] }))
      .sort((a,b)=>b.month.localeCompare(a.month))
      .slice(0,6);

    const monthlySaleObj = {};
    db.sales.forEach(s => {
      if(!s.invoice_date) return;
      const month = s.invoice_date.substring(0, 7);
      monthlySaleObj[month] = (monthlySaleObj[month] || 0) + (s.total_amount || 0);
    });
    const monthlySale = Object.keys(monthlySaleObj)
      .map(month => ({ month, total: monthlySaleObj[month] }))
      .sort((a,b)=>b.month.localeCompare(a.month))
      .slice(0,6);

    return {
      purchaseTotal: purchaseTotal,
      saleTotal: saleTotal,
      purchaseCount: db.purchases.length,
      saleCount: db.sales.length,
      companyCount: db.companies.length,
      profit: saleTotal - purchaseTotal,
      monthlyPurchase,
      monthlySale,
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
