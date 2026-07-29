import { ipcMain } from 'electron';
import { getDb } from './database.js';

export function registerIpcHandlers() {

  // ─── COMPANIES ───────────────────────────────────────────────
  ipcMain.handle('companies:getAll', () => {
    const db = getDb();
    return db.prepare('SELECT * FROM companies ORDER BY name ASC').all();
  });

  ipcMain.handle('companies:add', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO companies (name, gstin, address, city, state, pincode, phone, email)
      VALUES (@name, @gstin, @address, @city, @state, @pincode, @phone, @email)
    `);
    const result = stmt.run(data);
    return { id: result.lastInsertRowid, ...data };
  });

  ipcMain.handle('companies:update', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE companies SET name=@name, gstin=@gstin, address=@address,
      city=@city, state=@state, pincode=@pincode, phone=@phone, email=@email
      WHERE id=@id
    `);
    stmt.run(data);
    return { success: true };
  });

  ipcMain.handle('companies:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM companies WHERE id = ?').run(id);
    return { success: true };
  });

  // ─── PURCHASES ───────────────────────────────────────────────
  ipcMain.handle('purchases:getAll', (_, filters) => {
    const db = getDb();
    let query = `
      SELECT p.*, c.name as company_name 
      FROM purchases p
      LEFT JOIN companies c ON p.company_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (filters?.company_id) {
      query += ' AND p.company_id = ?';
      params.push(filters.company_id);
    }
    if (filters?.from_date) {
      query += ' AND p.invoice_date >= ?';
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      query += ' AND p.invoice_date <= ?';
      params.push(filters.to_date);
    }
    query += ' ORDER BY p.invoice_date DESC';
    return db.prepare(query).all(...params);
  });

  ipcMain.handle('purchases:add', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO purchases (company_id, invoice_no, invoice_date, vendor_name, vendor_gstin,
        item_name, hsn_code, quantity, unit, rate, taxable_amount,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
        total_amount, notes)
      VALUES (@company_id, @invoice_no, @invoice_date, @vendor_name, @vendor_gstin,
        @item_name, @hsn_code, @quantity, @unit, @rate, @taxable_amount,
        @cgst_rate, @sgst_rate, @igst_rate, @cgst_amount, @sgst_amount, @igst_amount,
        @total_amount, @notes)
    `);
    const result = stmt.run(data);
    return { id: result.lastInsertRowid, ...data };
  });

  ipcMain.handle('purchases:update', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE purchases SET company_id=@company_id, invoice_no=@invoice_no,
      invoice_date=@invoice_date, vendor_name=@vendor_name, vendor_gstin=@vendor_gstin,
      item_name=@item_name, hsn_code=@hsn_code, quantity=@quantity, unit=@unit,
      rate=@rate, taxable_amount=@taxable_amount, cgst_rate=@cgst_rate,
      sgst_rate=@sgst_rate, igst_rate=@igst_rate, cgst_amount=@cgst_amount,
      sgst_amount=@sgst_amount, igst_amount=@igst_amount, total_amount=@total_amount,
      notes=@notes WHERE id=@id
    `);
    stmt.run(data);
    return { success: true };
  });

  ipcMain.handle('purchases:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('purchases:getSummary', (_, filters) => {
    const db = getDb();
    let query = `
      SELECT 
        COUNT(*) as total_records,
        SUM(taxable_amount) as total_taxable,
        SUM(cgst_amount) as total_cgst,
        SUM(sgst_amount) as total_sgst,
        SUM(igst_amount) as total_igst,
        SUM(total_amount) as total_amount
      FROM purchases WHERE 1=1
    `;
    const params = [];
    if (filters?.company_id) { query += ' AND company_id = ?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND invoice_date <= ?'; params.push(filters.to_date); }
    return db.prepare(query).get(...params);
  });

  // ─── SALES ────────────────────────────────────────────────────
  ipcMain.handle('sales:getAll', (_, filters) => {
    const db = getDb();
    let query = `
      SELECT s.*, c.name as company_name 
      FROM sales s
      LEFT JOIN companies c ON s.company_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (filters?.company_id) {
      query += ' AND s.company_id = ?';
      params.push(filters.company_id);
    }
    if (filters?.from_date) {
      query += ' AND s.invoice_date >= ?';
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      query += ' AND s.invoice_date <= ?';
      params.push(filters.to_date);
    }
    query += ' ORDER BY s.invoice_date DESC';
    return db.prepare(query).all(...params);
  });

  ipcMain.handle('sales:add', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO sales (company_id, invoice_no, invoice_date, customer_name, customer_gstin,
        item_name, hsn_code, quantity, unit, rate, taxable_amount,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
        total_amount, notes)
      VALUES (@company_id, @invoice_no, @invoice_date, @customer_name, @customer_gstin,
        @item_name, @hsn_code, @quantity, @unit, @rate, @taxable_amount,
        @cgst_rate, @sgst_rate, @igst_rate, @cgst_amount, @sgst_amount, @igst_amount,
        @total_amount, @notes)
    `);
    const result = stmt.run(data);
    return { id: result.lastInsertRowid, ...data };
  });

  ipcMain.handle('sales:update', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE sales SET company_id=@company_id, invoice_no=@invoice_no,
      invoice_date=@invoice_date, customer_name=@customer_name, customer_gstin=@customer_gstin,
      item_name=@item_name, hsn_code=@hsn_code, quantity=@quantity, unit=@unit,
      rate=@rate, taxable_amount=@taxable_amount, cgst_rate=@cgst_rate,
      sgst_rate=@sgst_rate, igst_rate=@igst_rate, cgst_amount=@cgst_amount,
      sgst_amount=@sgst_amount, igst_amount=@igst_amount, total_amount=@total_amount,
      notes=@notes WHERE id=@id
    `);
    stmt.run(data);
    return { success: true };
  });

  ipcMain.handle('sales:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM sales WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('sales:getSummary', (_, filters) => {
    const db = getDb();
    let query = `
      SELECT 
        COUNT(*) as total_records,
        SUM(taxable_amount) as total_taxable,
        SUM(cgst_amount) as total_cgst,
        SUM(sgst_amount) as total_sgst,
        SUM(igst_amount) as total_igst,
        SUM(total_amount) as total_amount
      FROM sales WHERE 1=1
    `;
    const params = [];
    if (filters?.company_id) { query += ' AND company_id = ?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND invoice_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND invoice_date <= ?'; params.push(filters.to_date); }
    return db.prepare(query).get(...params);
  });

  // ─── DASHBOARD STATS ─────────────────────────────────────────
  ipcMain.handle('dashboard:getStats', () => {
    const db = getDb();
    const purchaseTotal = db.prepare('SELECT COALESCE(SUM(total_amount),0) as total FROM purchases').get();
    const saleTotal = db.prepare('SELECT COALESCE(SUM(total_amount),0) as total FROM sales').get();
    const purchaseCount = db.prepare('SELECT COUNT(*) as count FROM purchases').get();
    const saleCount = db.prepare('SELECT COUNT(*) as count FROM sales').get();
    const companyCount = db.prepare('SELECT COUNT(*) as count FROM companies').get();

    const monthlyPurchase = db.prepare(`
      SELECT strftime('%Y-%m', invoice_date) as month, SUM(total_amount) as total
      FROM purchases GROUP BY month ORDER BY month DESC LIMIT 6
    `).all();

    const monthlySale = db.prepare(`
      SELECT strftime('%Y-%m', invoice_date) as month, SUM(total_amount) as total
      FROM sales GROUP BY month ORDER BY month DESC LIMIT 6
    `).all();

    return {
      purchaseTotal: purchaseTotal.total,
      saleTotal: saleTotal.total,
      purchaseCount: purchaseCount.count,
      saleCount: saleCount.count,
      companyCount: companyCount.count,
      profit: saleTotal.total - purchaseTotal.total,
      monthlyPurchase,
      monthlySale,
    };
  });
}
