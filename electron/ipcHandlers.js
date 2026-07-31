import { ipcMain } from 'electron';
import { registerOcrHandlers } from './ocrHandlers.js';
import { getDb, saveDb, getSqliteDb } from './database.js';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { extractEprDashboard } = require("../src/extractors/epr/dashboard.extractor.cjs");
const { extractEprProfile } = require("../src/extractors/epr/profile.extractor.cjs");
const { extractEprApplication } = require("../src/extractors/epr/application.extractor.cjs");
const { extractEprMaterial } = require("../src/extractors/epr/material.extractor.cjs");
const { extractEprProduction } = require("../src/extractors/epr/production.extractor.cjs");
const { extractEprSales } = require("../src/extractors/epr/sales.extractor.cjs");
const { extractEprWallet } = require("../src/extractors/epr/wallet.extractor.cjs");
const { extractEprAnnualFiling } = require("../src/extractors/epr/annual_filing.extractor.cjs");

export function registerIpcHandlers() {
  registerOcrHandlers();

  // ─── EPR SCRAPED DATA (SQLITE) ────────────────────────────────
  ipcMain.handle('eprData:getProcurement', async () => {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) {
      console.warn("⚠️ SQLite DB not connected yet.");
      return [];
    }
    
    try {
      const tableCheck = await sqliteDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='procurement_details'`);
      if (tableCheck) {
        const rows = await sqliteDb.all(`SELECT * FROM procurement_details ORDER BY year DESC`);
        // rename year to source_year for backward compatibility with frontend
        rows.forEach(r => { r.source_year = r.year; });
        return rows;
      }
    } catch (err) {
      console.error("Error fetching procurement_details:", err);
    }
    return [];
  });

  ipcMain.handle('eprData:getSales', async () => {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) {
      console.warn("⚠️ SQLite DB not connected yet.");
      return [];
    }
    
    try {
      const tableCheck = await sqliteDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='sales_details'`);
      if (tableCheck) {
        const rows = await sqliteDb.all(`SELECT * FROM sales_details ORDER BY year DESC`);
        return rows;
      }
    } catch (err) {
      console.error("Error fetching sales_details:", err);
    }
    return [];
  });

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

  // ─── SCRAPER ──────────────────────────────────────────────────
  ipcMain.handle('scraper:runEpr', async () => {
    try {
      console.log("Starting EPR scraper...");
      const userDataDir = path.join(__dirname, '..', 'playwright_session');
      const context = await chromium.launchPersistentContext(userDataDir, { 
          headless: false,
          acceptDownloads: true,
          channel: 'chrome' // Use system Chrome to bypass AppLocker policies
      });
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      await page.bringToFront();

      await page.goto('https://epr.cpcb.gov.in');
      
      console.log("⏳ Waiting for you to login... (Please login manually. Script will continue when URL changes to dashboard)");
      try {
          await page.waitForURL('**/*dashboard*', { timeout: 300000 }); // 5 minutes to login
          console.log("🔓 Login detected! Proceeding with extraction...");
  
          console.log("🖱️ Clicking the first 'Open' button on Waste Category card...");
          const firstOpenBtn = page.locator('app-waste-category button').filter({ hasText: /Open/i }).first();
          await firstOpenBtn.waitFor({ state: 'visible', timeout: 15000 });
          await firstOpenBtn.click();
          await page.waitForTimeout(1000);
  
          console.log("🔘 Selecting the first application radio button...");
          const radioBtn = page.locator('app-modal-frame input[type="radio"]').first();
          await radioBtn.waitFor({ state: 'visible', timeout: 5000 });
          await radioBtn.click();
          await page.waitForTimeout(1000);
  
          console.log("🖱️ Clicking the 'Proceed/Open' button in the modal...");
          // In the modal, find the button that is inside an app-button component
          const modalOpenBtn = page.locator('app-modal-frame app-button button').first();
          await modalOpenBtn.click();
          await page.waitForTimeout(3000); // Give it a moment to load the next page
  
          console.log("🖱️ Checking if 'Select Unit' dropdown exists...");
          // We use try/catch because if a PWP user only has 1 unit, this dropdown won't exist!
          try {
              const selectUnitBtn = page.locator('button[title="Select Unit"]').first();
              // Short timeout because it might not exist
              await selectUnitBtn.waitFor({ state: 'visible', timeout: 8000 });
              await selectUnitBtn.click();
              await page.waitForTimeout(1500);
      
              console.log("🖱️ Clicking the specific unit card...");
              const unitCard = page.locator('button.unit-card').first();
              await unitCard.waitFor({ state: 'visible', timeout: 5000 });
              await unitCard.click();
              await page.waitForTimeout(3000); // Wait for the dashboard to refresh
          } catch (e) {
              console.log("⏭️ No 'Select Unit' dropdown found (likely single-unit user). Skipping unit selection...");
          }
  
      } catch (e) {
          console.error("❌ Error during login or post-login clicks:", e.message);
          console.log("Let's try running extractors anyway...");
      }
      const allData = {};
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
      }

      const saveJson = (filename, data) => {
          fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
      };

      allData.dashboard = await extractEprDashboard(page);
      saveJson('epr_dashboard.json', allData.dashboard);

      allData.profile = await extractEprProfile(page);
      saveJson('epr_profile.json', allData.profile);

      allData.application = await extractEprApplication(page);
      saveJson('epr_application.json', allData.application);

      allData.material = await extractEprMaterial(page);
      saveJson('epr_material.json', allData.material);

      // allData.production = await extractEprProduction(page);
      // await saveJson('epr_production.json', allData.production);

      allData.sales = await extractEprSales(page);
      saveJson('epr_sales.json', allData.sales);

      allData.wallet = await extractEprWallet(page);
      saveJson('epr_wallet.json', allData.wallet);

      allData.annualFiling = await extractEprAnnualFiling(page);
      saveJson('epr_annual_filing.json', allData.annualFiling);

      saveJson('scraped_data_latest.json', allData);

      // Commenting out close so you can inspect the browser
      // await browser.close();
      console.log("EPR Scraping completed successfully.");
      
      // Auto-sync JSONs to SQLite
      await new Promise((resolve, reject) => {
         const { exec } = require('child_process');
         exec('node sync_to_sqlite.js', { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
            if (error) {
               console.error("Failed to sync to SQLite:", error);
               reject(error);
            } else {
               console.log("Synced to SQLite:", stdout);
               resolve();
            }
         });
      });

      return { success: true, data: allData };
    } catch (error) {
      console.error("Scraper failed:", error);
      return { success: false, error: error.message };
    }
  });

  // ─── SQLITE SCRAPER DATA ──────────────────────────────────────────────
  ipcMain.handle('scraper:getProfile', async () => {
    const sdb = getSqliteDb();
    if (!sdb) return null;
    try {
      return await sdb.get('SELECT * FROM epr_profile LIMIT 1');
    } catch (e) {
      // Fallback: If epr_profile doesn't exist, try getting company name from epr_dashboard raw_text
      try {
        const dashboard = await sdb.get('SELECT * FROM epr_dashboard LIMIT 1');
        if (dashboard && dashboard.raw_text) {
           const lines = dashboard.raw_text.split('\n').map(l => l.trim()).filter(l => l);
           // Find "Central Pollution Control Board" and take the next line
           const cpcbIdx = lines.findIndex(l => l.includes('Central Pollution Control Board'));
           if (cpcbIdx !== -1 && lines.length > cpcbIdx + 1) {
              return { company_name: lines[cpcbIdx + 1] };
           }
        }
      } catch (err2) {}
      return null;
    }
  });

  ipcMain.handle('scraper:getDashboardCards', async () => {
    const sdb = getSqliteDb();
    if (!sdb) return null;
    try {
      const row = await sdb.get('SELECT * FROM epr_dashboard LIMIT 1');
      if (row && row.tables_dump) {
         try {
           row.tables_dump = JSON.parse(row.tables_dump);
         } catch(e) {}
      }
      return row;
    } catch (e) {
      console.error(e);
      return null;
    }
  });

  ipcMain.handle('scraper:getPayments', async () => {
    const sdb = getSqliteDb();
    if (!sdb) return [];
    try {
      return await sdb.all('SELECT * FROM epr_payment');
    } catch (e) {
      // Table doesn't exist yet if user has no payments
      return [];
    }
  });

  ipcMain.handle('scraper:getWallet', async () => {
    const sdb = getSqliteDb();
    if (!sdb) return [];
    try {
      return await sdb.all('SELECT * FROM wallet_wallet_potentials');
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('scraper:getWalletHistory', async () => {
    const sdb = getSqliteDb();
    if (!sdb) return [];
    try {
      const rows = await sdb.all('SELECT * FROM wallet_certificate_transaction');
      if (rows.length > 0 && rows[0].items) {
          try {
              return JSON.parse(rows[0].items);
          } catch(e) {}
      }
      return rows;
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('scraper:getProcurement', async (e, year) => {
    const sdb = getSqliteDb();
    if (!sdb) return [];
    try {
      return await sdb.all(`SELECT * FROM procurement_details WHERE year = ?`, [year || 2025]);
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('scraper:getSales', async (e, year) => {
    const sdb = getSqliteDb();
    if (!sdb) return [];
    try {
      return await sdb.all(`SELECT * FROM sales_details WHERE year = ?`, [year || 2025]);
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('scraper:getProduction', async (e, year) => {
    const sdb = getSqliteDb();
    if (!sdb) return [];
    try {
      return await sdb.all(`SELECT * FROM production_details WHERE year = ?`, [year || 2025]);
    } catch (err) {
      return [];
    }
  });
}
