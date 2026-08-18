import { app, ipcMain, dialog } from 'electron';
import { registerOcrHandlers } from '../ocr_captcha/ocrHandlers.js';
import { initDatabase, getDb, dbJsonPath } from '../db/database.js';
import { warmupQrScanner } from '../ocr_captcha/qrScan.js';
import { chromium } from 'playwright';
import { migrateFromJsonToSqlite } from '../db/dataMigration.js';
import { compressPdf } from '../utils/pdfCompressor.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import sharp from 'sharp';
import {
  prepareDummyProcurementBulk,
  runProcurementBulkFill,
  CPCB_ONBOARDING_URL,
  createZipStore,
  MINIMAL_PDF,
} from '../automation/cpcbProcurementBulk.js';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import {
  runSalesBulkFill,
} from '../automation/cpcbSalesBulk.js';
import {
  startRegistrationFlow,
  submitEmailOtp,
  resendEmailOtp,
  submitMobileOtp,
  resendMobileOtp,
  submitRegistrationCaptcha,
  refreshRegistrationCaptcha,
  closeRegistrationSession
} from '../automation/cpcbRegistration.js';
import {
  startLoginFlow,
  submitLoginCaptcha,
  refreshLoginCaptcha,
  submitLoginOtp,
  resendLoginOtp,
} from '../automation/cpcbLogin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { extractEprDashboard } = require("../../src/extractors/epr/dashboard.extractor.cjs");
const { extractEprProfile } = require("../../src/extractors/epr/profile.extractor.cjs");
const { extractEprApplication } = require("../../src/extractors/epr/application.extractor.cjs");
const { extractEprMaterial } = require("../../src/extractors/epr/material.extractor.cjs");
const { extractEprProduction } = require("../../src/extractors/epr/production.extractor.cjs");
const { extractEprSales } = require("../../src/extractors/epr/sales.extractor.cjs");
const { extractEprWallet } = require("../../src/extractors/epr/wallet.extractor.cjs");
const { extractEprAnnualFiling } = require("../../src/extractors/epr/annual_filing.extractor.cjs");
const { extractEprPaymentHistory } = require("../../src/extractors/epr/payment.extractor.cjs");
const { extractEprNewApplication } = require("../../src/extractors/epr/new_application.extractor.cjs");

export function registerIpcHandlers() {
  initDatabase(async (dbInstance) => {
    await migrateFromJsonToSqlite(dbInstance, dbJsonPath);
  }).catch(err => console.error("Failed to initialize database:", err));
  registerOcrHandlers();
  warmupQrScanner().catch(() => {});

  // ─── EPR SCRAPED DATA (SQLITE) ────────────────────────────────
  ipcMain.handle('eprData:getProcurement', async () => {
    const sqliteDb = getDb();
    if (!sqliteDb) {
      console.warn("⚠️ SQLite DB not connected yet.");
      return [];
    }

    try {
      const tableCheck = await sqliteDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='procurement_details'`);
      if (tableCheck) {
        const rows = await sqliteDb.all(`SELECT * FROM procurement_details ORDER BY year DESC`);
        rows.forEach(r => { r.source_year = r.year; });
        return rows;
      }
    } catch (err) {
      console.error("Error fetching procurement_details:", err);
    }
    return [];
  });

  ipcMain.handle('eprData:getSales', async () => {
    const sqliteDb = getDb();
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

  ipcMain.handle('eprData:getProduction', async () => {
    const sqliteDb = getDb();
    if (!sqliteDb) {
      console.warn("⚠️ SQLite DB not connected yet.");
      return [];
    }

    try {
      const tableCheck = await sqliteDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='production_details'`);
      if (tableCheck) {
        const rows = await sqliteDb.all(`SELECT * FROM production_details`);
        return rows;
      }
    } catch (err) {
      console.error("Error fetching production_details:", err);
    }
    return [];
  });

  // ─── SETTINGS ──────────────────────────────────────────────────
  const ensureSettingsTable = async () => {
    const db = getDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);
    return db;
  };

  ipcMain.handle('settings:get', async (_, key) => {
    try {
      const db = await ensureSettingsTable();
      const row = await db.get(`SELECT value FROM app_settings WHERE key = ?`, key);
      return row ? JSON.parse(row.value) : null;
    } catch (err) {
      console.error('settings:get error', err);
      return null;
    }
  });

  ipcMain.handle('settings:set', async (_, key, value) => {
    try {
      const db = await ensureSettingsTable();
      await db.run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        key, JSON.stringify(value), new Date().toISOString()
      );
      return true;
    } catch (err) {
      console.error('settings:set error', err);
      return false;
    }
  });

  ipcMain.handle('eprData:getInventory', async () => {
    const sqliteDb = getDb();
    if (!sqliteDb) {
      console.warn("⚠️ SQLite DB not connected yet.");
      return [];
    }

    try {
      const tableCheck = await sqliteDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'`);
      if (tableCheck) {
        const rows = await sqliteDb.all(`SELECT * FROM inventory`);
        return rows;
      }
    } catch (err) {
      console.error("Error fetching inventory:", err);
    }
    return [];
  });

  ipcMain.handle('eprData:getConversionFactor', async () => {
    const sqliteDb = getDb();
    if (!sqliteDb) {
      console.warn("⚠️ SQLite DB not connected yet.");
      return [];
    }

    try {
      const tableCheck = await sqliteDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='conversion_factor'`);
      if (tableCheck) {
        const rows = await sqliteDb.all(`SELECT * FROM conversion_factor`);
        return rows;
      }
    } catch (err) {
      console.error("Error fetching conversion_factor:", err);
    }
    return [];
  });

  // ─── FILE SYSTEM ───────────────────────────────────────────────
  ipcMain.handle('fs:readFileBase64', async (_, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const data = fs.readFileSync(filePath);
      return data.toString('base64');
    } catch (e) {
      console.error('Failed to read file as base64', e);
      return null;
    }
  });

  // ─── COMPANIES ───────────────────────────────────────────────
  ipcMain.handle('companies:getAll', async () => {
    const db = getDb();
    return db.all('SELECT * FROM companies ORDER BY name COLLATE NOCASE ASC');
  });

  ipcMain.handle('companies:add', async (_, data) => {
    const db = getDb();
    const result = await db.run(
      'INSERT INTO companies (name, gstin, pan, entity_type, account_number, ifsc_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      data.name, data.gstin, data.pan, data.entity_type, data.account_number, data.ifsc_code, new Date().toISOString()
    );
    return { id: result.lastID, ...data };
  });

  ipcMain.handle('companies:update', async (_, data) => {
    const db = getDb();
    await db.run(
      'UPDATE companies SET name = ?, gstin = ?, pan = ?, entity_type = ?, account_number = ?, ifsc_code = ? WHERE id = ?',
      data.name, data.gstin, data.pan, data.entity_type, data.account_number, data.ifsc_code, data.id
    );
    return { success: true };
  });

  ipcMain.handle('companies:delete', async (_, id) => {
    const db = getDb();
    await db.run('DELETE FROM companies WHERE id = ?', id);
    return { success: true };
  });

  // ─── DOCUMENTS (Company Documents) ───────────────────────────
  ipcMain.handle('documents:getAll', async () => {
    const db = getDb();
    return db.all('SELECT * FROM company_documents ORDER BY created_at DESC');
  });

  ipcMain.handle('documents:add', async (_, data) => {
    let finalPath = data.file_path || '';
    if (finalPath && fs.existsSync(finalPath)) {
      try {
        const destDir = path.join(app.getPath('userData'), 'processed_registration_docs');
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        
        const shortId = Math.random().toString(36).substring(2, 8);
        const docType = data.doc_type || 'document';
        const ext = path.extname(finalPath).toLowerCase();
        const newFileName = `${docType}_${shortId}${ext}`;
        const newPath = path.join(destDir, newFileName);

        if (ext === '.pdf') {
          console.log(`Compressing PDF: ${finalPath} -> ${newPath}`);
          const success = await compressPdf(finalPath, newPath);
          if (success && fs.existsSync(newPath)) {
            finalPath = newPath;
          } else {
            fs.copyFileSync(finalPath, newPath);
            finalPath = newPath;
          }
        } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          console.log(`Compressing Image: ${finalPath} -> ${newPath}`);
          try {
            await sharp(finalPath)
              .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 80 }) // Compress to JPEG with 80% quality
              .toFile(newPath);
            finalPath = newPath;
          } catch (sharpErr) {
            console.error('Sharp image compression failed:', sharpErr);
            fs.copyFileSync(finalPath, newPath);
            finalPath = newPath;
          }
        } else {
          fs.copyFileSync(finalPath, newPath);
          finalPath = newPath;
        }
      } catch (err) {
        console.error('Failed to process registration document:', err);
      }
    }

    const db = getDb();
    if (data.fileHash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', data.fileHash);
    }

    const result = await db.run(
      'INSERT INTO company_documents (doc_type, document_number, entity_name, issue_date, file_path, raw_json, constitution_of_business, address, date_of_liability, enterprise_type, social_category, date_of_incorporation, date_of_commencement, industry_category, allowed_capacity, validity_date, billing_month, amount, units_consumed, due_date, provider, file_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      data.doc_type || '', data.document_number || '', data.entity_name || '', data.issue_date || '', finalPath, data.raw_json || '', data.constitution_of_business || '', data.address || '', data.date_of_liability || '', data.enterprise_type || '', data.social_category || '', data.date_of_incorporation || '', data.date_of_commencement || '', data.industry_category || '', data.allowed_capacity || '', data.validity_date || '', data.billing_month || '', data.amount || 0, data.units_consumed || 0, data.due_date || '', data.provider || '', data.fileHash || ''
    );
    return { id: result.lastID, ...data, file_path: finalPath };
  });

  ipcMain.handle('documents:delete', async (_, id) => {
    const db = getDb();
    const doc = await db.get('SELECT file_hash FROM company_documents WHERE id = ?', id);
    if (doc && doc.file_hash) {
      await db.run('DELETE FROM file_hashes WHERE hash = ?', doc.file_hash);
    }
    await db.run('DELETE FROM company_documents WHERE id = ?', id);
    return { success: true };
  });

  ipcMain.handle('documents:getStats', async () => {
    const db = getDb();
    const count = await db.get('SELECT COUNT(*) as count FROM company_documents');
    return { count: count.count || 0 };
  });

  async function storeInvoicePdfLocally(data) {
    if (!data._page) return data;
    const source = data._page.sourceFilePath || data._page.sourceFileName;
    if (!source || !fs.existsSync(source)) return data;

    const companyName = data.company_name || 'Unknown_Company';
    const invoiceDate = data.invoice_date || data.procurement_date || data.date_of_entry || new Date().toISOString().split('T')[0];

    let dateObj = new Date(invoiceDate);
    if (isNaN(dateObj)) dateObj = new Date();
    const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

    const destDir = path.join(app.getPath('userData'), 'processed_invoices', companyName, yearMonth);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const invoiceFileName = data.invoice_filename || data.invoice_file_name || path.basename(source);
    const safeName = invoiceFileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const destPath = path.join(destDir, safeName);

    try {
      if (source.toLowerCase().endsWith('.pdf') && data._page.pageNumber) {
        try {
          const pdfBytes = fs.readFileSync(source);
          const sourceDoc = await PDFDocument.load(pdfBytes);
          const newDoc = await PDFDocument.create();
          const pageIndex = Math.max(0, data._page.pageNumber - 1);
          
          if (pageIndex < sourceDoc.getPageCount()) {
            const [copiedPage] = await newDoc.copyPages(sourceDoc, [pageIndex]);
            newDoc.addPage(copiedPage);
            const singlePageBytes = await newDoc.save();
            fs.writeFileSync(destPath, singlePageBytes);
          } else {
            fs.copyFileSync(source, destPath);
          }
        } catch (pdfErr) {
          console.warn('PDF-lib extraction failed, falling back to full copy:', pdfErr.message);
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
          fs.copyFileSync(source, destPath);
        }
      } else {
        fs.copyFileSync(source, destPath);
      }
      data.local_pdf_path = destPath;
    } catch (err) {
      console.error('Failed to copy PDF invoice locally:', err);
    }
    return data;
  }

  function withLocalPdfInSourceFields(data) {
    if (!data.local_pdf_path) return data;
    const base =
      data._source_fields && typeof data._source_fields === 'object' ? data._source_fields : {};
    return {
      ...data,
      _source_fields: { ...base, local_pdf_path: data.local_pdf_path },
    };
  }

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
    return res.map(row => {
      return {
        ...row,
        line_items: row.line_items ? JSON.parse(row.line_items) : null,
        extraction: row.extraction ? JSON.parse(row.extraction) : null,
        _source_fields: row._source_fields ? JSON.parse(row._source_fields) : null,
        _routing: row._routing ? JSON.parse(row._routing) : null,
      };
    });
  });

  ipcMain.handle('purchases:add', async (_, data) => {
    const db = getDb();
    let processedData = withLocalPdfInSourceFields(
      await storeInvoicePdfLocally({ ...data })
    );
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
      processedData.company_id,
      processedData.record_type,
      processedData.category_of_plastic,
      processedData.supplier_name,
      processedData.address_line_1,
      processedData.address_line_2,
      processedData.state,
      processedData.city,
      processedData.pin_code,
      processedData.buyer_gst,
      processedData.is_supplier_gst_available,
      processedData.supplier_gst_number,
      processedData.supplier_mobile_number,
      processedData.procurement_date,
      processedData.quantity_mt,
      processedData.invoice_number,
      processedData.hsn_code,
      processedData.invoice_filename,
      processedData.vendor_name,
      processedData.vendor_gstin,
      processedData.invoice_no,
      processedData.invoice_date,
      processedData.item_name,
      processedData.quantity,
      processedData.unit,
      processedData.total_amount,
      processedData.lineItems ? JSON.stringify(processedData.lineItems) : null,
      processedData.extraction ? JSON.stringify(processedData.extraction) : null,
      processedData._source_fields ? JSON.stringify(processedData._source_fields) : null,
      processedData._routing ? JSON.stringify(processedData._routing) : null,
      processedData.fileHash || null,
      new Date().toISOString()
    );
    await stmt.finalize();

    if (processedData.fileHash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', processedData.fileHash);
    }

    return { id: result.lastID, ...processedData };
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
    return res.map(row => {
      return {
        ...row,
        line_items: row.line_items ? JSON.parse(row.line_items) : null,
        extraction: row.extraction ? JSON.parse(row.extraction) : null,
        _source_fields: row._source_fields ? JSON.parse(row._source_fields) : null,
        _routing: row._routing ? JSON.parse(row._routing) : null,
      };
    });
  });

  ipcMain.handle('sales:add', async (_, data) => {
    const db = getDb();
    let processedData = withLocalPdfInSourceFields(
      await storeInvoicePdfLocally({ ...data })
    );
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
      processedData.company_id,
      processedData.record_type,
      processedData.s_no,
      processedData.category_of_plastic,
      processedData.process_code,
      processedData.plastic_type,
      processedData.product_type,
      processedData.recycled_plastic_percent,
      processedData.conversion_factor,
      processedData.available_quantity_mt,
      processedData.quantity_sold_mt,
      processedData.registration_type,
      processedData.entity_name,
      processedData.address,
      processedData.state,
      processedData.district,
      processedData.account_number,
      processedData.ifsc_code,
      processedData.gst_other_charges,
      processedData.invoice_file_name,
      processedData.application_number,
      processedData.customer_name,
      processedData.customer_gstin,
      processedData.invoice_no,
      processedData.invoice_date,
      processedData.item_name,
      processedData.quantity,
      processedData.unit,
      processedData.total_amount,
      processedData.lineItems ? JSON.stringify(processedData.lineItems) : null,
      processedData.extraction ? JSON.stringify(processedData.extraction) : null,
      processedData._source_fields ? JSON.stringify(processedData._source_fields) : null,
      processedData._routing ? JSON.stringify(processedData._routing) : null,
      processedData.fileHash || null,
      new Date().toISOString()
    );
    await stmt.finalize();

    if (processedData.fileHash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', processedData.fileHash);
    }

    return { id: result.lastID, ...processedData };
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

  ipcMain.handle('sales:applyBankDetailsToAll', async (_, { account_number, ifsc_code }) => {
    try {
      const db = getDb();
      const result = await db.run(
        `UPDATE sales SET account_number = ?, ifsc_code = ?
         WHERE (account_number IS NULL OR account_number = '')
           AND (ifsc_code IS NULL OR ifsc_code = '')`,
        account_number, ifsc_code
      );
      console.log(`[Bank] Applied bank details to ${result.changes} sales records.`);
      return { success: true, updated: result.changes };
    } catch (err) {
      console.error('sales:applyBankDetailsToAll error', err);
      return { success: false, error: err.message };
    }
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

    const myCompany = await db.get('SELECT name, gstin FROM companies LIMIT 1');

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
      myCompany: myCompany || null,
      profit: saleTotal - purchaseTotal,
      monthlyPurchase: monthlyPurchaseData.map(row => ({ month: row.month, total: row.total || 0 })),
      monthlySale: monthlySaleData.map(row => ({ month: row.month, total: row.total || 0 })),
    };
  });

  // ─── REGISTRATION ──────────────────────────────────────────────
  ipcMain.handle('registration:get', async () => {
    try {
      const { getRegistrationDetails } = await import('./registrationDb.js');
      return await getRegistrationDetails();
    } catch (err) {
      console.error('registration:get error', err);
      return null;
    }
  });

  ipcMain.handle('registration:save', async (_, data) => {
    try {
      const { saveRegistrationDetails } = await import('./registrationDb.js');
      return await saveRegistrationDetails(data);
    } catch (err) {
      console.error('registration:save error', err);
      return { success: false, error: err.message };
    }
  });

  // Removed duplicate registration:get handler

  // ─── REGISTRATION SCRAPER ────────────────────────────────────
  ipcMain.handle('scraper:startRegistrationFlow', async (event, data) => {
    return await startRegistrationFlow(data, (msg) => {
      event.sender.send('scraper:log', msg);
    });
  });
  
  ipcMain.handle('scraper:submitEmailOtp', async (event, payload) => {
    const otp = typeof payload === 'string' ? payload : payload?.otp;
    const mobile = typeof payload === 'object' ? payload?.mobile : undefined;
    return await submitEmailOtp(otp, mobile, (msg) => event.sender.send('scraper:log', msg));
  });
  
  ipcMain.handle('scraper:resendEmailOtp', async (event) => {
    return await resendEmailOtp((msg) => event.sender.send('scraper:log', msg));
  });
  
  ipcMain.handle('scraper:submitMobileOtp', async (event, payload) => {
    return await submitMobileOtp(payload, (msg) => event.sender.send('scraper:log', msg));
  });
  
  ipcMain.handle('scraper:resendMobileOtp', async (event) => {
    return await resendMobileOtp((msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:submitRegistrationCaptcha', async (event, payload) => {
    const captchaText = typeof payload === 'string' ? payload : payload?.captcha;
    return await submitRegistrationCaptcha(captchaText, (msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:refreshRegistrationCaptcha', async (event) => {
    return await refreshRegistrationCaptcha((msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:startLoginFlow', async (event, payload) => {
    return await startLoginFlow(payload, (msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:submitLoginCaptcha', async (event, payload) => {
    const captchaText = typeof payload === 'string' ? payload : payload?.captcha;
    return await submitLoginCaptcha(captchaText, (msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:refreshLoginCaptcha', async (event) => {
    return await refreshLoginCaptcha((msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:submitLoginOtp', async (event, payload) => {
    const otp = typeof payload === 'string' ? payload : payload?.otp;
    return await submitLoginOtp(otp, (msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:resendLoginOtp', async (event) => {
    return await resendLoginOtp((msg) => event.sender.send('scraper:log', msg));
  });

  ipcMain.handle('scraper:closeRegistrationSession', async () => {
    return await closeRegistrationSession();
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

      if (payload.fromDate && payload.toDate) {
        const from = new Date(payload.fromDate);
        const to = new Date(payload.toDate);
        const diffDays = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays < 1 || diffDays > 31) {
          return { success: false, error: 'Date range cannot exceed 31 days.' };
        }
      }

      sendLog('Preparing dummy procurement Excel + invoice ZIP…', 'info');
      const files = (payload.excelPath && payload.zipPath) ? {
        excelPath: payload.excelPath,
        zipPath: payload.zipPath,
        fromDate: payload.fromDate,
        toDate: payload.toDate,
      } : prepareDummyProcurementBulk({
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

      if (payload.fromDate && payload.toDate) {
        const from = new Date(payload.fromDate);
        const to = new Date(payload.toDate);
        const diffDays = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays < 1 || diffDays > 31) {
          return { success: false, error: 'Date range cannot exceed 31 days.' };
        }
      }

      sendLog('Step 1: Select Unit on /onboarding/, then Sales Bulk Entry…', 'info');

      const result = await runSalesBulkFill(cpcbPage, {
        onLog: sendLog,
        unitId: payload.unitId,
        unitName: payload.unitName,
        salesType: payload.salesType || 'domestic',
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        files: (payload.excelPath && payload.zipPath) ? {
          excelPath: payload.excelPath,
          zipPath: payload.zipPath,
          fromDate: payload.fromDate,
          toDate: payload.toDate
        } : undefined,
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

  ipcMain.handle('scraper:prepareCpcbData', async (event, payload = {}) => {
    try {
      const { rows = [], type = 'sale', fromDate, toDate } = payload;
      if (!rows.length) throw new Error('No rows provided for data preparation.');
      
      const sendProgress = (msg) => {
        try {
          event.sender.send('scraper:prepare-progress', { message: msg });
        } catch (e) {}
      };

      sendProgress('Initializing export...');

      if (fromDate && toDate) {
        const from = new Date(fromDate);
        const to = new Date(toDate);
        const diffTime = to.getTime() - from.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays < 1 || diffDays > 31) {
          throw new Error('Date range cannot exceed 31 days. Please correct your dates.');
        }
      }
      
      const isPurchase = type !== 'sale';
      const outDir = path.join(os.tmpdir(), `pwp-cpcb-${type}-bulk-${Date.now()}`);
      fs.mkdirSync(outDir, { recursive: true });

      const { createZipStore, MINIMAL_PDF } = require('../automation/cpcbProcurementBulk.js');
      
      const BATCH_LIMIT = 22 * 1024 * 1024; // 22 MB limit buffer
      const batches = [];
      let currentBatch = { rows: [], files: [], size: 0, fileNamesSet: new Set() };
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (i % 10 === 0) sendProgress(`Processing record ${i + 1} of ${rows.length}...`);
        
        let pdfName = row.invoice_filename || row.invoice_file_name || row.invoice_number;
        if (!pdfName) {
          pdfName = `dummy_${type}_invoice_${i + 1}.pdf`;
        } else if (!pdfName.toLowerCase().endsWith('.pdf')) {
          pdfName += '.pdf';
        }
        
        // Ensure unique filename within the batch
        let uniquePdfName = pdfName;
        let counter = 1;
        while (currentBatch.fileNamesSet.has(uniquePdfName)) {
          uniquePdfName = pdfName.replace('.pdf', `_${counter}.pdf`);
          counter++;
        }
        
        let localPdfPath = null;
        if (row._source_fields && row._source_fields.local_pdf_path) {
          localPdfPath = row._source_fields.local_pdf_path;
        } else if (row.local_pdf_path) {
          localPdfPath = row.local_pdf_path;
        }

        let pdfData = MINIMAL_PDF;
        if (localPdfPath && fs.existsSync(localPdfPath)) {
          try {
            const tempCompressedPath = path.join(outDir, `compressed_${uniquePdfName}`);
            const { compressPdf } = require('../utils/pdfCompressor.js');
            const compressed = await compressPdf(localPdfPath, tempCompressedPath);
            
            if (compressed && fs.existsSync(tempCompressedPath)) {
              pdfData = fs.readFileSync(tempCompressedPath);
              fs.unlinkSync(tempCompressedPath);
            } else {
              pdfData = fs.readFileSync(localPdfPath);
            }
          } catch (e) {
            console.error(`Failed to read/compress PDF for ${uniquePdfName}`, e);
            try {
              pdfData = fs.readFileSync(localPdfPath); // Ultimate fallback
            } catch (fallbackError) {}
          }
        }
        const fileSize = pdfData.length;

        // If batch exceeds limit, save it and start new one
        if (currentBatch.size + fileSize > BATCH_LIMIT && currentBatch.rows.length > 0) {
          batches.push(currentBatch);
          currentBatch = { rows: [], files: [], size: 0, fileNamesSet: new Set() };
        }

        currentBatch.size += fileSize;
        currentBatch.files.push({ name: uniquePdfName, data: pdfData });
        currentBatch.fileNamesSet.add(uniquePdfName);

        let mappedRow = {};
        if (isPurchase) {
          mappedRow = {
            'Name of Supplier': row.supplier_name || row.name_of_supplier || 'Supplier',
            'Address Line 1': row.address_line_1 || 'Address',
            'Address Line 2': row.address_line_2 || '',
            'State': row.state || 'Haryana',
            'City': row.city || 'Gurugram',
            'Pincode': row.pin_code || '122001',
            'Supplier GST Number': row.supplier_gst_number || row.supplier_gst || '',
            'Invoice Number': row.invoice_number || row.invoice_no || `INV-${i+1}`,
            'Quantity (MT)': parseFloat(row.quantity_mt || row.qty_of_waste_plastic_mt) || 0,
            'Procurement Date': row.procurement_date || row.invoice_date || fromDate,
            'HSN Code': row.hsn_code || '3915',
            'Invoice File Name': uniquePdfName,
          };
        } else {
          mappedRow = {
            'S-No.': currentBatch.rows.length + 1,
            'Production ID': row.production_id || `PROD-${i + 1}`,
            'Available Quantity (MT)': parseFloat(row.available_quantity_mt) || 0,
            'Qty of Material Sold (MT)': parseFloat(row.quantity_sold_mt || row.quantity_mt) || 0,
            'Product Type': row.product_type || 'Others',
            '% of Clinker': parseFloat(row.percent_clinker) || 0,
            'Entity Name': row.entity_name || row.buyer_name || 'Buyer',
            'Address': row.address || 'Address',
            'State': row.state || 'Madhya Pradesh',
            'District': row.district || 'Dhar',
            'Account Number': row.account_number || '1234567890',
            'IFSC Code': row.ifsc_code || 'SBIN0001234',
            'GST & Other Charges (₹)': parseFloat(row.gst_and_other_charges || row.gst_other_charges) || 0,
            'Invoice File Name\n(Shall exactly match the name of pdf uploaded in ZIP folder)': uniquePdfName,
          };
        }
        currentBatch.rows.push(mappedRow);
      }
      
      if (currentBatch.rows.length > 0) {
        batches.push(currentBatch);
      }

      const generatedBatches = [];

      for (let b = 0; b < batches.length; b++) {
        sendProgress(`Generating Batch ${b + 1} of ${batches.length}...`);
        const batch = batches[b];
        
        const headers = Object.keys(batch.rows[0]);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(batch.rows, { header: headers });
        XLSX.utils.book_append_sheet(wb, ws, isPurchase ? 'Procurement' : 'DomesticSales');
        
        const excelName = `${type}_bulk_batch${b+1}_${Date.now()}.xlsx`;
        const excelPath = path.join(outDir, excelName);
        XLSX.writeFile(wb, excelPath);

        const zipName = `${type}_invoices_batch${b+1}_${Date.now()}.zip`;
        const zipPath = path.join(outDir, zipName);
        fs.writeFileSync(zipPath, createZipStore(batch.files));

        generatedBatches.push({
          excelPath,
          zipPath,
          sizeMb: (batch.size / (1024 * 1024)).toFixed(2),
          recordsCount: batch.rows.length
        });
      }

      sendProgress('Export completed successfully!');

      return {
        success: true,
        batches: generatedBatches,
        outDir,
        fromDate,
        toDate,
      };
    } catch (error) {
      console.error('prepareCpcbData failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('scraper:runEpr', async () => {
    let originalWriteFileSync;
    try {
      console.log("Starting EPR scraper...");
      
      const memoryDataMap = {};
      originalWriteFileSync = fs.writeFileSync;
      fs.writeFileSync = (filePath, data, ...args) => {
          if (typeof filePath === 'string' && filePath.endsWith('.json') && (filePath.includes('data') || filePath.includes('\\data\\'))) {
              const filename = path.basename(filePath);
              console.log(`\n--- [SCRAPED DATA IN MEMORY] ${filename} ---`);
              let parsed = data;
              try {
                  parsed = JSON.parse(data);
                  console.log(JSON.stringify(parsed, null, 2).substring(0, 300) + '... (truncated)');
              } catch(e) {}
              memoryDataMap[filename] = parsed;
              // Skipping originalWriteFileSync to keep data exclusively in memory
          } else {
              originalWriteFileSync(filePath, data, ...args);
          }
      };

      const userDataDir = path.join(__dirname, '..', 'playwright_session');
      const context = await chromium.launchPersistentContext(userDataDir, { 
          headless: false,
          acceptDownloads: true,
          viewport: null,
          args: ['--start-maximized'],
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
  
          console.log("🔘 Selecting the 'PWP' application radio button...");
          try {
            // Find the radio button explicitly by XPath
            const pwpRadioBtn = page.locator('xpath=/html/body/app-root/div/app-dashboard/div/div/main/app-waste-category/app-modal-frame[1]/div/div[2]/div/div/form/div[1]/table/tbody/tr[2]/td[1]/div/input');
            await pwpRadioBtn.waitFor({ state: 'visible', timeout: 3000 });
            await pwpRadioBtn.click();
          } catch (e) {
            console.log("⚠️ PWP radio button not found by XPath, falling back to first radio button...");
            const firstRadioBtn = page.locator('app-modal-frame input[type="radio"]').first();
            await firstRadioBtn.click();
          }
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
        // Keep data in memory, do not write to disk
        memoryDataMap[filename] = data;
      };

      allData.dashboard = await extractEprDashboard(page);
      saveJson('epr_dashboard.json', allData.dashboard);

      allData.profile = await extractEprProfile(page);
      saveJson('epr_profile.json', allData.profile);

      allData.application = await extractEprApplication(page);
      saveJson('epr_application.json', allData.application);

      allData.material = await extractEprMaterial(page);
      saveJson('epr_material.json', allData.material);

      allData.production = await extractEprProduction(page);
      await saveJson('epr_production.json', allData.production);

      allData.sales = await extractEprSales(page);
      saveJson('epr_sales.json', allData.sales);

      allData.wallet = await extractEprWallet(page);
      saveJson('epr_wallet.json', allData.wallet);

      allData.annualFiling = await extractEprAnnualFiling(page);
      saveJson('epr_annual_filing.json', allData.annualFiling);

      allData.payment = await extractEprPaymentHistory(page);
      saveJson('epr_payment.json', allData.payment);

      allData.newApplication = await extractEprNewApplication(page);
      saveJson('epr_new_application.json', allData.newApplication);

      saveJson('scraped_data_latest.json', allData);

      // Commenting out close so you can inspect the browser
      // await browser.close();
      console.log("EPR Scraping completed successfully.");
      
      // Auto-sync JSONs to SQLite
      try {
          const syncPath = path.join(__dirname, '..', 'sync_to_sqlite.js');
          const syncModule = await import('file://' + syncPath.replace(/\\/g, '/'));
          if (syncModule.default) {
              await syncModule.default(memoryDataMap);
          }
      } catch (err) {
          console.error("Failed to sync to SQLite:", err);
          throw err;
      }

      return { success: true, data: allData };
    } catch (error) {
      console.error("Scraper failed:", error);
      return { success: false, error: error.message };
    } finally {
      if (originalWriteFileSync) {
          fs.writeFileSync = originalWriteFileSync;
      }
    }
  });

  // ─── SQLITE SCRAPER DATA ──────────────────────────────────────────────
  ipcMain.handle('scraper:getProfile', async () => {
    const sdb = getDb();
    if (!sdb) return null;
    try {
      return await sdb.get('SELECT * FROM epr_profile LIMIT 1');
    } catch (e) {
      // Fallback: Try getting company name from epr_dashboard
      try {
        const dashboard = await sdb.get('SELECT * FROM epr_dashboard LIMIT 1');
        if (dashboard && dashboard.company_name) {
           return { company_name: dashboard.company_name };
        }
      } catch (err2) {}
      return null;
    }
  });

  ipcMain.handle('scraper:getDashboardCards', async () => {
    const sdb = getDb();
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
    const sdb = getDb();
    if (!sdb) return [];
    try {
      return await sdb.all('SELECT * FROM epr_payment');
    } catch (e) {
      // Table doesn't exist yet if user has no payments
      return [];
    }
  });

  ipcMain.handle('scraper:getWallet', async () => {
    const sdb = getDb();
    if (!sdb) return [];
    try {
      return await sdb.all('SELECT * FROM wallet_wallet_potentials');
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('scraper:getWalletHistory', async () => {
    const sdb = getDb();
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
    const sdb = getDb();
    if (!sdb) return [];
    try {
      return await sdb.all(`SELECT * FROM procurement_details WHERE file_source LIKE ?`, [`%${year || 2025}%`]);
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('scraper:getSales', async (e, year) => {
    const sdb = getDb();
    if (!sdb) return [];
    try {
      const rows = await sdb.all(`SELECT * FROM transactions WHERE transaction_type = 'sales' AND year = ?`, [String(year || 2025)]);
        return rows.map(r => ({ ...r, ...(r.raw_data ? JSON.parse(r.raw_data) : {}) }));
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('scraper:getProduction', async (e, year) => {
    const sdb = getDb();
    if (!sdb) return [];
    try {
      const rows = await sdb.all(`SELECT * FROM transactions WHERE transaction_type = 'production' AND year = ?`, [String(year || 2025)]);
        return rows.map(r => ({ ...r, ...(r.raw_data ? JSON.parse(r.raw_data) : {}) }));
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('invoices:exportZip', async (_, { type, label, exportRows, headers, pdfFiles }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Invoices ZIP',
        defaultPath: `${type}_Invoices_${label.replace(/ /g, '_')}.zip`,
        filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
      });
      if (canceled || !filePath) return { success: false, canceled: true };

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      XLSX.utils.book_append_sheet(wb, ws, label.substring(0, 31));
      const excelBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const entries = [
        { name: `${type}_Invoices_${label.replace(/ /g, '_')}.xlsx`, data: excelBuf }
      ];

      for (const pdfFile of pdfFiles) {
        if (pdfFile && pdfFile.name) {
          let pdfData = MINIMAL_PDF;
          if (pdfFile.localPath && fs.existsSync(pdfFile.localPath)) {
            try {
              pdfData = fs.readFileSync(pdfFile.localPath);
            } catch (err) {
              console.error('Failed to read local PDF for ZIP:', err);
            }
          }
          entries.push({ name: pdfFile.name, data: pdfData });
        }
      }

      const zipBuf = createZipStore(entries);
      fs.writeFileSync(filePath, zipBuf);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scraper:getInventory', async () => {
    try {
      const invPath = path.join(__dirname, '..', 'data', 'inventory.json');
      if (fs.existsSync(invPath)) {
        return JSON.parse(fs.readFileSync(invPath, 'utf8'));
      }
    } catch (e) { console.error("Error reading inventory.json", e); }
    return [];
  });
  // ─── LOCAL PRODUCTION (USER ENTRIES) ────────────────────────
  ipcMain.handle('localProduction:getAll', async (_, filters) => {
    const db = getDb();
    let query = 'SELECT p.*, c.name as company_name FROM local_productions p LEFT JOIN companies c ON p.company_id = c.id WHERE 1=1';
    const params = [];
    if (filters?.company_id) { query += ' AND p.company_id=?'; params.push(filters.company_id); }
    if (filters?.from_date) { query += ' AND p.from_date >= ?'; params.push(filters.from_date); }
    if (filters?.to_date) { query += ' AND p.to_date <= ?'; params.push(filters.to_date); }
    query += ' ORDER BY p.created_at DESC';
    return await db.all(query, params);
  });

  ipcMain.handle('localProduction:add', async (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    const info = await db.run(
      `INSERT INTO local_productions 
      (company_id, from_date, to_date, clinker_production, energy_percentage, energy_contribution_mj, qualifying_feed_mt, cat_i, cat_ii, cat_iii, cat_iv, conversion_factor, calorific_value, calorific_unit, plastic_percent, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.company_id || null, data.from_date || '', data.to_date || '',
        data.clinker_production || 0, data.energy_percentage || 0,
        data.energy_contribution_mj || 0, data.qualifying_feed_mt || 0,
        data.cat_i || 0, data.cat_ii || 0, data.cat_iii || 0, data.cat_iv || 0,
        data.conversion_factor || 0, data.calorific_value || 0, data.calorific_unit || 'KJ/Kg', data.plastic_percent || 0,
        created_at
      ]
    );
    return { id: info.lastID, ...data, created_at };
  });

  ipcMain.handle('localProduction:bulkAdd', async (_, rows) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    let inserted = 0;
    
    // Using a transaction for bulk insert
    await db.run('BEGIN TRANSACTION');
    try {
      for (const data of rows) {
        await db.run(
          `INSERT INTO local_productions 
          (company_id, from_date, to_date, clinker_production, energy_percentage, energy_contribution_mj, qualifying_feed_mt, cat_i, cat_ii, cat_iii, cat_iv, conversion_factor, calorific_value, calorific_unit, plastic_percent, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.company_id || null, data.from_date || '', data.to_date || '',
            data.clinker_production || 0, data.energy_percentage || 0,
            data.energy_contribution_mj || 0, data.qualifying_feed_mt || 0,
            data.cat_i || 0, data.cat_ii || 0, data.cat_iii || 0, data.cat_iv || 0,
            data.conversion_factor || 0, data.calorific_value || 0, data.calorific_unit || 'KJ/Kg', data.plastic_percent || 0,
            created_at
          ]
        );
        inserted++;
      }
      await db.run('COMMIT');
      return { success: true, count: inserted };
    } catch (e) {
      await db.run('ROLLBACK');
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('localProduction:update', async (_, data) => {
    const db = getDb();
    await db.run(
      `UPDATE local_productions SET 
        company_id=?, from_date=?, to_date=?, clinker_production=?, energy_percentage=?, 
        energy_contribution_mj=?, qualifying_feed_mt=?, cat_i=?, cat_ii=?, cat_iii=?, cat_iv=?,
        conversion_factor=?, calorific_value=?, calorific_unit=?, plastic_percent=?
      WHERE id=?`,
      [
        data.company_id || null, data.from_date || '', data.to_date || '',
        data.clinker_production || 0, data.energy_percentage || 0,
        data.energy_contribution_mj || 0, data.qualifying_feed_mt || 0,
        data.cat_i || 0, data.cat_ii || 0, data.cat_iii || 0, data.cat_iv || 0,
        data.conversion_factor || 0, data.calorific_value || 0, data.calorific_unit || 'KJ/Kg', data.plastic_percent || 0,
        data.id
      ]
    );
    return { success: true };
  });

  ipcMain.handle('localProduction:delete', async (_, id) => {
    const db = getDb();
    await db.run('DELETE FROM local_productions WHERE id=?', [id]);
    return { success: true };
  });

  // Update qualifying_feed_mt for all production records matching a given month/year (by to_date)
  ipcMain.handle('localProduction:updateQualifyingFeed', async (_, { month, year, qualifying_feed_mt }) => {
    const db = getDb();
    // Get all records and filter in JS (same logic as frontend)
    const allRows = await db.all('SELECT id, to_date FROM local_productions');
    let updated = 0;
    for (const row of allRows) {
      if (!row.to_date) continue;
      const d = new Date(row.to_date);
      if (d.getMonth() === month && d.getFullYear() === year) {
        await db.run('UPDATE local_productions SET qualifying_feed_mt=? WHERE id=?', [qualifying_feed_mt, row.id]);
        updated++;
      }
    }
    return { success: true, updated };
  });

  // ─── CREDIT CALCULATIONS (SQLITE) ────────────────────────
  ipcMain.handle('creditCalculations:getAll', async () => {
    const db = getDb();
    return await db.all('SELECT * FROM credit_calculations ORDER BY created_at DESC');
  });

  ipcMain.handle('creditCalculations:add', async (_, data) => {
    const db = getDb();
    try {
      const info = await db.run(
        `INSERT INTO credit_calculations 
        (month, energy_contribution_percent, energy_consumption_mj, calorific_value_unit, calorific_value_input, calorific_value_kj, clinker_produced_tons, energy_contribution_mj, rdf_burnt_tons, plastic_percent, potential_tons) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.month, data.energy_contribution_percent, data.energy_consumption_mj,
          data.calorific_value_unit, data.calorific_value_input, data.calorific_value_kj,
          data.clinker_produced_tons, data.energy_contribution_mj, data.rdf_burnt_tons,
          data.plastic_percent, data.potential_tons
        ]
      );
      return { success: true, id: info.lastID };
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'Calculations for this month already exist.' };
      }
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('creditCalculations:update', async (_, data) => {
    const db = getDb();
    try {
      await db.run(
        `UPDATE credit_calculations SET
          month=?, energy_contribution_percent=?, energy_consumption_mj=?, calorific_value_unit=?, calorific_value_input=?, calorific_value_kj=?, clinker_produced_tons=?, energy_contribution_mj=?, rdf_burnt_tons=?, plastic_percent=?, potential_tons=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
        [
          data.month, data.energy_contribution_percent, data.energy_consumption_mj,
          data.calorific_value_unit, data.calorific_value_input, data.calorific_value_kj,
          data.clinker_produced_tons, data.energy_contribution_mj, data.rdf_burnt_tons,
          data.plastic_percent, data.potential_tons, data.id
        ]
      );
      return { success: true };
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'Calculations for this month already exist.' };
      }
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('creditCalculations:delete', async (_, id) => {
    const db = getDb();
    await db.run('DELETE FROM credit_calculations WHERE id=?', [id]);
    return { success: true };
  });

  // --- NEW APPLICATION DATA ---
  ipcMain.handle('eprData:getNewApplicationData', async () => {
    const db = getDb();
    try {
      // Find all tables related to new_application
      const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'new_app%');");
      const result = {};
      
      for (const t of tables) {
        const rows = await db.all(`SELECT * FROM ${t.name}`);
        // Remove internal/sqlite fields like _internal_id and file_source
        const cleanRows = rows.map(row => {
          const { _internal_id, file_source, ...rest } = row;
          return rest;
        });
        
        if (t.name === 'new_application_part_a' || t.name === 'new_application_part_b' || t.name === 'new_application_part_c') {
          result[t.name] = cleanRows.length > 0 ? cleanRows[0] : null;
        } else {
          result[t.name] = cleanRows; // Arrays for nested tables
        }
      }
      return result;
    } catch (e) {
      console.error("Failed to fetch new application data:", e);
      return {};
    }
  });

  // --- SYSTEM SHELL & DOCUMENT OPENER ---
  const { shell } = require('electron');
  
  ipcMain.handle('eprData:openDocument', async (_, filename) => {
    try {
      const fs = require('fs');
      const dlDir = path.join(__dirname, '..', 'data', 'downloads', 'new_application');
      const filePath = path.join(dlDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found on local disk. Please run the scraper again.' };
      }
      
      const error = await shell.openPath(filePath);
      if (error) {
        return { success: false, error };
      }
      return { success: true };
    } catch (err) {
      console.error('Error opening document:', err);
      return { success: false, error: err.message };
    }
  });

}

