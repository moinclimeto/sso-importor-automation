import fs from 'fs';
import path from 'path';

const dbPath = 'electron/database.js';
let dbContent = fs.readFileSync(dbPath, 'utf8');

const newTables = `    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gstin TEXT,
      state TEXT,
      address TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      invoice_no TEXT,
      invoice_date TEXT,
      data TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      invoice_no TEXT,
      invoice_date TEXT,
      data TEXT,
      created_at TEXT
    );`;
dbContent = dbContent.replace(/CREATE TABLE IF NOT EXISTS companies[\s\S]*?sales[\s\S]*?\);/m, newTables);
fs.writeFileSync(dbPath, dbContent);

const ipcPath = 'electron/ipcHandlers.js';
let ipcContent = fs.readFileSync(ipcPath, 'utf8');

// Replace purchases:getAll
const pGetAll = `ipcMain.handle('purchases:getAll', (_, filters) => {
    const db = getDb();
    let query = 'SELECT p.*, c.name as company_name FROM purchases p LEFT JOIN companies c ON p.company_id = c.id WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND p.company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND p.invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND p.invoice_date <= ?'; params.push(filters.to_date); }
    query += ' ORDER BY p.invoice_date DESC';
    const rows = db.prepare(query).all(...params);
    return rows.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.data); } catch(e) {}
      return { ...parsed, id: r.id, company_name: r.company_name, company_id: r.company_id, created_at: r.created_at };
    });
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('purchases:getAll'[\s\S]*?\}\);/m, pGetAll);

// Replace purchases:add
const pAdd = `ipcMain.handle('purchases:add', (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    const invoice_no = data.invoice_no || data.invoice_number || '';
    const invoice_date = data.invoice_date || data.procurement_date || '';
    const stmt = db.prepare('INSERT INTO purchases (company_id, invoice_no, invoice_date, data, created_at) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(data.company_id, invoice_no, invoice_date, JSON.stringify(data), created_at);
    return { id: info.lastInsertRowid, ...data, created_at };
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('purchases:add'[\s\S]*?\}\);/m, pAdd);

// Replace purchases:update
const pUpdate = `ipcMain.handle('purchases:update', (_, data) => {
    const db = getDb();
    const invoice_no = data.invoice_no || data.invoice_number || '';
    const invoice_date = data.invoice_date || data.procurement_date || '';
    const stmt = db.prepare('UPDATE purchases SET company_id=?, invoice_no=?, invoice_date=?, data=? WHERE id=?');
    stmt.run(data.company_id, invoice_no, invoice_date, JSON.stringify(data), data.id);
    return { success: true };
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('purchases:update'[\s\S]*?\}\);/m, pUpdate);

// Replace purchases:getSummary
const pSummary = `ipcMain.handle('purchases:getSummary', (_, filters) => {
    const db = getDb();
    let query = 'SELECT data FROM purchases WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND invoice_date <= ?'; params.push(filters.to_date); }
    const rows = db.prepare(query).all(...params);
    let total_taxable = 0, total_cgst = 0, total_sgst = 0, total_igst = 0, total_amount = 0;
    rows.forEach(r => {
      try {
        const d = JSON.parse(r.data);
        total_taxable += (parseFloat(d.taxable_amount) || 0);
        total_cgst += (parseFloat(d.cgst_amount) || 0);
        total_sgst += (parseFloat(d.sgst_amount) || 0);
        total_igst += (parseFloat(d.igst_amount) || 0);
        total_amount += (parseFloat(d.total_amount) || 0);
      } catch(e) {}
    });
    return {
      total_records: rows.length,
      total_taxable, total_cgst, total_sgst, total_igst, total_amount
    };
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('purchases:getSummary'[\s\S]*?\}\);/m, pSummary);


// Replace sales:getAll
const sGetAll = `ipcMain.handle('sales:getAll', (_, filters) => {
    const db = getDb();
    let query = 'SELECT s.*, c.name as company_name FROM sales s LEFT JOIN companies c ON s.company_id = c.id WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND s.company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND s.invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND s.invoice_date <= ?'; params.push(filters.to_date); }
    query += ' ORDER BY s.invoice_date DESC';
    const rows = db.prepare(query).all(...params);
    return rows.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.data); } catch(e) {}
      return { ...parsed, id: r.id, company_name: r.company_name, company_id: r.company_id, created_at: r.created_at };
    });
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('sales:getAll'[\s\S]*?\}\);/m, sGetAll);

// Replace sales:add
const sAdd = `ipcMain.handle('sales:add', (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    const invoice_no = data.invoice_no || data.invoice_number || data.application_number || '';
    const invoice_date = data.invoice_date || '';
    const stmt = db.prepare('INSERT INTO sales (company_id, invoice_no, invoice_date, data, created_at) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(data.company_id, invoice_no, invoice_date, JSON.stringify(data), created_at);
    return { id: info.lastInsertRowid, ...data, created_at };
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('sales:add'[\s\S]*?\}\);/m, sAdd);

// Replace sales:update
const sUpdate = `ipcMain.handle('sales:update', (_, data) => {
    const db = getDb();
    const invoice_no = data.invoice_no || data.invoice_number || data.application_number || '';
    const invoice_date = data.invoice_date || '';
    const stmt = db.prepare('UPDATE sales SET company_id=?, invoice_no=?, invoice_date=?, data=? WHERE id=?');
    stmt.run(data.company_id, invoice_no, invoice_date, JSON.stringify(data), data.id);
    return { success: true };
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('sales:update'[\s\S]*?\}\);/m, sUpdate);

// Replace sales:getSummary
const sSummary = `ipcMain.handle('sales:getSummary', (_, filters) => {
    const db = getDb();
    let query = 'SELECT data FROM sales WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND invoice_date <= ?'; params.push(filters.to_date); }
    const rows = db.prepare(query).all(...params);
    let total_taxable = 0, total_cgst = 0, total_sgst = 0, total_igst = 0, total_amount = 0;
    rows.forEach(r => {
      try {
        const d = JSON.parse(r.data);
        total_taxable += (parseFloat(d.taxable_amount) || 0);
        total_cgst += (parseFloat(d.cgst_amount) || 0);
        total_sgst += (parseFloat(d.sgst_amount) || 0);
        total_igst += (parseFloat(d.igst_amount) || 0);
        total_amount += (parseFloat(d.total_amount) || 0);
      } catch(e) {}
    });
    return {
      total_records: rows.length,
      total_taxable, total_cgst, total_sgst, total_igst, total_amount
    };
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('sales:getSummary'[\s\S]*?\}\);/m, sSummary);

// Replace dashboard:getStats
const dashboard = `ipcMain.handle('dashboard:getStats', () => {
    const db = getDb();
    
    // Purchases
    const pRows = db.prepare('SELECT data, invoice_date FROM purchases').all();
    let purchaseTotal = 0;
    const monthlyPurchaseObj = {};
    pRows.forEach(r => {
      try {
        const d = JSON.parse(r.data);
        const amt = parseFloat(d.total_amount) || 0;
        purchaseTotal += amt;
        const month = r.invoice_date ? r.invoice_date.substring(0, 7) : '';
        if (month) monthlyPurchaseObj[month] = (monthlyPurchaseObj[month] || 0) + amt;
      } catch(e) {}
    });
    
    // Sales
    const sRows = db.prepare('SELECT data, invoice_date FROM sales').all();
    let saleTotal = 0;
    const monthlySaleObj = {};
    sRows.forEach(r => {
      try {
        const d = JSON.parse(r.data);
        const amt = parseFloat(d.total_amount) || 0;
        saleTotal += amt;
        const month = r.invoice_date ? r.invoice_date.substring(0, 7) : '';
        if (month) monthlySaleObj[month] = (monthlySaleObj[month] || 0) + amt;
      } catch(e) {}
    });
    
    const companyCount = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
    
    const monthlyPurchase = Object.keys(monthlyPurchaseObj)
      .map(month => ({ month, total: monthlyPurchaseObj[month] }))
      .sort((a,b)=>b.month.localeCompare(a.month))
      .slice(0,6);
    
    const monthlySale = Object.keys(monthlySaleObj)
      .map(month => ({ month, total: monthlySaleObj[month] }))
      .sort((a,b)=>b.month.localeCompare(a.month))
      .slice(0,6);
      
    return {
      purchaseTotal,
      saleTotal,
      purchaseCount: pRows.length,
      saleCount: sRows.length,
      companyCount,
      profit: saleTotal - purchaseTotal,
      monthlyPurchase,
      monthlySale
    };
  });`;
ipcContent = ipcContent.replace(/ipcMain\.handle\('dashboard:getStats'[\s\S]*?\}\);/m, dashboard);

fs.writeFileSync(ipcPath, ipcContent);
console.log('ipcHandlers and database schema refactored');
