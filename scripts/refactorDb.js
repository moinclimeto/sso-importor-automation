import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const ipcPath = path.join(rootDir, 'electron', 'ipcHandlers.js');
let ipcContent = fs.readFileSync(ipcPath, 'utf8');

const ipcReplacement = `  // ─── COMPANIES ───────────────────────────────────────────────
  ipcMain.handle('companies:getAll', () => {
    const db = getDb();
    return db.prepare('SELECT * FROM companies ORDER BY name ASC').all();
  });

  ipcMain.handle('companies:add', (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO companies (name, gstin, state, address, created_at) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(data.name || '', data.gstin || '', data.state || '', data.address || '', created_at);
    return { id: info.lastInsertRowid, ...data, created_at };
  });

  ipcMain.handle('companies:update', (_, data) => {
    const db = getDb();
    const stmt = db.prepare('UPDATE companies SET name=?, gstin=?, state=?, address=? WHERE id=?');
    stmt.run(data.name || '', data.gstin || '', data.state || '', data.address || '', data.id);
    return { success: true };
  });

  ipcMain.handle('companies:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM companies WHERE id=?').run(id);
    return { success: true };
  });

  // ─── PURCHASES ───────────────────────────────────────────────
  ipcMain.handle('purchases:getAll', (_, filters) => {
    const db = getDb();
    let query = 'SELECT p.*, c.name as company_name FROM purchases p LEFT JOIN companies c ON p.company_id = c.id WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND p.company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND p.invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND p.invoice_date <= ?'; params.push(filters.to_date); }
    query += ' ORDER BY p.invoice_date DESC';
    return db.prepare(query).all(...params);
  });

  ipcMain.handle('purchases:add', (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO purchases (company_id, invoice_no, invoice_date, supplier_name, supplier_gstin, item_name, quantity, uom, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, invoice_file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(data.company_id, data.invoice_no, data.invoice_date, data.supplier_name, data.supplier_gstin, data.item_name, data.quantity, data.uom, data.taxable_amount, data.cgst_amount, data.sgst_amount, data.igst_amount, data.total_amount, data.invoice_file_name || data.invoice_filename || '', created_at);
    return { id: info.lastInsertRowid, ...data, created_at };
  });

  ipcMain.handle('purchases:update', (_, data) => {
    const db = getDb();
    const stmt = db.prepare('UPDATE purchases SET company_id=?, invoice_no=?, invoice_date=?, supplier_name=?, supplier_gstin=?, item_name=?, quantity=?, uom=?, taxable_amount=?, cgst_amount=?, sgst_amount=?, igst_amount=?, total_amount=?, invoice_file_name=? WHERE id=?');
    stmt.run(data.company_id, data.invoice_no, data.invoice_date, data.supplier_name, data.supplier_gstin, data.item_name, data.quantity, data.uom, data.taxable_amount, data.cgst_amount, data.sgst_amount, data.igst_amount, data.total_amount, data.invoice_file_name || data.invoice_filename || '', data.id);
    return { success: true };
  });

  ipcMain.handle('purchases:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM purchases WHERE id=?').run(id);
    return { success: true };
  });

  ipcMain.handle('purchases:getSummary', (_, filters) => {
    const db = getDb();
    let query = 'SELECT COUNT(id) as total_records, SUM(taxable_amount) as total_taxable, SUM(cgst_amount) as total_cgst, SUM(sgst_amount) as total_sgst, SUM(igst_amount) as total_igst, SUM(total_amount) as total_amount FROM purchases WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND invoice_date <= ?'; params.push(filters.to_date); }
    const row = db.prepare(query).get(...params);
    return {
      total_records: row.total_records || 0,
      total_taxable: row.total_taxable || 0,
      total_cgst: row.total_cgst || 0,
      total_sgst: row.total_sgst || 0,
      total_igst: row.total_igst || 0,
      total_amount: row.total_amount || 0,
    };
  });

  // ─── SALES ────────────────────────────────────────────────────
  ipcMain.handle('sales:getAll', (_, filters) => {
    const db = getDb();
    let query = 'SELECT s.*, c.name as company_name FROM sales s LEFT JOIN companies c ON s.company_id = c.id WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND s.company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND s.invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND s.invoice_date <= ?'; params.push(filters.to_date); }
    query += ' ORDER BY s.invoice_date DESC';
    return db.prepare(query).all(...params);
  });

  ipcMain.handle('sales:add', (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO sales (company_id, invoice_no, invoice_date, buyer_name, buyer_gstin, item_name, quantity, uom, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, invoice_file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(data.company_id, data.invoice_no, data.invoice_date, data.buyer_name, data.buyer_gstin, data.item_name, data.quantity, data.uom, data.taxable_amount, data.cgst_amount, data.sgst_amount, data.igst_amount, data.total_amount, data.invoice_file_name || data.invoice_filename || '', created_at);
    return { id: info.lastInsertRowid, ...data, created_at };
  });

  ipcMain.handle('sales:update', (_, data) => {
    const db = getDb();
    const stmt = db.prepare('UPDATE sales SET company_id=?, invoice_no=?, invoice_date=?, buyer_name=?, buyer_gstin=?, item_name=?, quantity=?, uom=?, taxable_amount=?, cgst_amount=?, sgst_amount=?, igst_amount=?, total_amount=?, invoice_file_name=? WHERE id=?');
    stmt.run(data.company_id, data.invoice_no, data.invoice_date, data.buyer_name, data.buyer_gstin, data.item_name, data.quantity, data.uom, data.taxable_amount, data.cgst_amount, data.sgst_amount, data.igst_amount, data.total_amount, data.invoice_file_name || data.invoice_filename || '', data.id);
    return { success: true };
  });

  ipcMain.handle('sales:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM sales WHERE id=?').run(id);
    return { success: true };
  });

  ipcMain.handle('sales:getSummary', (_, filters) => {
    const db = getDb();
    let query = 'SELECT COUNT(id) as total_records, SUM(taxable_amount) as total_taxable, SUM(cgst_amount) as total_cgst, SUM(sgst_amount) as total_sgst, SUM(igst_amount) as total_igst, SUM(total_amount) as total_amount FROM sales WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND invoice_date <= ?'; params.push(filters.to_date); }
    const row = db.prepare(query).get(...params);
    return {
      total_records: row.total_records || 0,
      total_taxable: row.total_taxable || 0,
      total_cgst: row.total_cgst || 0,
      total_sgst: row.total_sgst || 0,
      total_igst: row.total_igst || 0,
      total_amount: row.total_amount || 0,
    };
  });

  // ─── DASHBOARD STATS ─────────────────────────────────────────
  ipcMain.handle('dashboard:getStats', () => {
    const db = getDb();
    const purchaseTotal = db.prepare('SELECT SUM(total_amount) as s FROM purchases').get().s || 0;
    const saleTotal = db.prepare('SELECT SUM(total_amount) as s FROM sales').get().s || 0;
    const purchaseCount = db.prepare('SELECT COUNT(*) as c FROM purchases').get().c || 0;
    const saleCount = db.prepare('SELECT COUNT(*) as c FROM sales').get().c || 0;
    const companyCount = db.prepare('SELECT COUNT(*) as c FROM companies').get().c || 0;
    
    const monthlyPurchase = db.prepare('SELECT substr(invoice_date, 1, 7) as month, SUM(total_amount) as total FROM purchases WHERE invoice_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6').all();
    const monthlySale = db.prepare('SELECT substr(invoice_date, 1, 7) as month, SUM(total_amount) as total FROM sales WHERE invoice_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6').all();

    return {
      purchaseTotal,
      saleTotal,
      purchaseCount,
      saleCount,
      companyCount,
      profit: saleTotal - purchaseTotal,
      monthlyPurchase,
      monthlySale,
    };
  });`;

ipcContent = ipcContent.replace(/\/\/ ─── COMPANIES ───────────────────────────────────────────────[\s\S]*?ipcMain\.handle\('dashboard:getStats'[\s\S]*?\}\);/m, ipcReplacement);
fs.writeFileSync(ipcPath, ipcContent);
console.log('ipcHandlers.js refactored');

const extractQPath = path.join(rootDir, 'electron', 'extractQueue.js');
let extractQContent = fs.readFileSync(extractQPath, 'utf8');
const eqReplacement = `export function getExistingInvoiceFileNames(type) {
  const db = getDb();
  const names = new Set();
  const table = type === 'sale' ? 'sales' : 'purchases';
  const rows = db.prepare(\`SELECT invoice_file_name, invoice_no FROM \${table}\`).all();
  for (const row of rows) {
    const n = normName(row.invoice_file_name || row.invoice_no || '');
    if (n) names.add(n);
  }
  return names;
}`;
extractQContent = extractQContent.replace(/export function getExistingInvoiceFileNames\(type\) \{[\s\S]*?return names;\n\}/m, eqReplacement);
fs.writeFileSync(extractQPath, extractQContent);
console.log('extractQueue.js refactored');
