import { ipcMain } from 'electron';
import { registerOcrHandlers } from './ocrHandlers.js';
import { getDb, saveDb } from './database.js';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

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
