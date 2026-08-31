import { app, ipcMain, dialog } from 'electron';
import { registerOcrHandlers } from '../ocr_captcha/ocrHandlers.js';
import { registerGstVerifyHandlers } from '../gstVerifyHandlers.js';
import { getDb, getDbFilePath } from '../db/database.js';
import { getRegistrationDetails, saveRegistrationDetails } from '../db/registrationDb.js';
import { createLogger } from '../utils/logger.js';
import { warmupQrScanner } from '../ocr_captcha/qrScan.js';
import { chromium } from '../automation/playwrightRuntime.js';
import {
  lineItemsToPackagingSyncRows,
  normalizePackagingMasterRecord,
  sanitizePlasticCategory,
  sanitizePlasticMaterial,
} from '../../shared/packagingMasterSync.js';
import { buildProductMatchKey, normalizeLineUom, syncRecordMtFromLines } from '../../shared/procurementConversionFactor.js';
import {
  assertNoDuplicatePurchase,
  assertNoDuplicateSale,
  pruneOrphanFileHashes,
} from '../invoiceDuplicateCheck.js';
import { getCpcbPersistentLaunchOpts, prepareCpcbBrowserPage } from '../automation/cpcbBrowserLaunch.js';
import { storeProcessedUpload } from '../utils/storeUploadFile.js';
import {
  computeImporter3aDraft,
  finalizeAndGenerateImporter3a,
  generateImporter3bFromImages,
} from '../reports/importerEprService.js';
import { buildImporter3aDraft } from '../../shared/importerSection3a.js';
import { resolveProcurementSource } from '../../shared/importerPurchaseSaleMatch.js';
import { registrationDocFileName } from '../utils/registrationDocFileName.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import {
  prepareDummyProcurementBulk,
  runProcurementBulkFill,
  CPCB_ONBOARDING_URL,
  createZipStore,
  MINIMAL_PDF,
} from '../automation/cpcbProcurementBulk.js';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import { previewPartCLetters, buildFilledDocx, zipPartCLetters } from '../utils/partCLetters.js';
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
  runApplicationOnboardingAfterLogin,
  resendLoginOtp,
} from '../automation/cpcbLogin.js';
import { runEprExtraction } from '../automation/cpcbEprScraper.js';
import { upsertSupplierMasterRow } from '../supplierMasterService.js';
import { upsertPackagingMasterRow } from '../packagingMasterService.js';
import { setPaymentBypassNotifier, resolvePaymentBypass } from '../automation/paymentBypassBridge.js';
import { setPortalToastEmitter, attachPortalToastWatcherToContext } from '../automation/portalToastWatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const registrationLog = createLogger('registration-ipc', 'registration.log');

function bindPortalToastSender(event) {
  const sender = event?.sender;
  if (!sender) return;
  setPortalToastEmitter((payload) => {
    try {
      if (!sender.isDestroyed()) sender.send('cpcb:portal-toast', payload);
    } catch {
      /* renderer gone */
    }
  });
}

function sendScraperLog(event, msg) {
  bindPortalToastSender(event);
  const text = typeof msg === 'string' ? msg : (msg?.text || msg?.message || String(msg));
  registrationLog.info(text);
  console.log('[scraper]', text);
  event.sender.send('scraper:log', text);
}

let ipcHandlersRegistered = false;

export function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;
  registerOcrHandlers();
  registerGstVerifyHandlers();
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

  // ─── EXTRACTOR DATA ──────────────────────────────────────────
  ipcMain.handle('extractor:getData', async () => {
    const db = getDb();
    try {
      // Just return the most recent one
      const row = await db.get('SELECT * FROM extractor_data ORDER BY id DESC LIMIT 1');
      return row || null;
    } catch (err) {
      console.error('extractor:getData error', err);
      return null;
    }
  });

  ipcMain.handle('extractor:saveData', async (_, data) => {
    const db = getDb();
    try {
      const existing = await db.get('SELECT id FROM extractor_data ORDER BY id DESC LIMIT 1');

      // Sync with companies table so invoices can be matched and saved against a valid company_id
      if (data.companyName) {
        let companyExists;
        if (data.gst) {
          companyExists = await db.get('SELECT id FROM companies WHERE gstin = ?', data.gst);
        } else {
          companyExists = await db.get('SELECT id FROM companies WHERE name = ?', data.companyName);
        }
        
        if (!companyExists) {
          const gstStr = data.gst || '';
          const panStr = gstStr.length >= 15 ? gstStr.substring(2, 12) : '';
          await db.run(
            'INSERT INTO companies (name, gstin, pan, entity_type, created_at) VALUES (?, ?, ?, ?, ?)',
            data.companyName,
            gstStr,
            panStr,
            'Other',
            new Date().toISOString()
          );
        }
      }

      if (existing) {
        await db.run('UPDATE extractor_data SET company_name = ?, gst = ? WHERE id = ?', data.companyName, data.gst || '', existing.id);
        return { success: true, id: existing.id };
      } else {
        const res = await db.run('INSERT INTO extractor_data (company_name, gst) VALUES (?, ?)', data.companyName, data.gst || '');
        return { success: true, id: res.lastID };
      }
    } catch (err) {
      console.error('extractor:saveData error', err);
      return { success: false, error: err.message };
    }
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

  async function getGlobalBankDetails(db) {
    try {
      const row = await db.get(`SELECT value FROM app_settings WHERE key = ?`, 'global_bank_details');
      if (!row?.value) return null;
      const parsed = JSON.parse(row.value);
      const account_number = String(parsed?.account_number || '').trim();
      const ifsc_code = String(parsed?.ifsc_code || '').trim().toUpperCase();
      if (!account_number || !ifsc_code) return null;
      return { account_number, ifsc_code };
    } catch {
      return null;
    }
  }

  function applyGlobalBankToRecord(record = {}, globalBank = null) {
    if (!globalBank) return record;
    const account = String(record.account_number || '').trim();
    const ifsc = String(record.ifsc_code || '').trim();
    return {
      ...record,
      account_number: account || globalBank.account_number,
      ifsc_code: ifsc || globalBank.ifsc_code,
    };
  }

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
  const uploadsDir = () => {
    const destDir = path.join(app.getPath('userData'), 'registration_uploads');
    fs.mkdirSync(destDir, { recursive: true });
    return destDir;
  };

  const resolveLocalFile = (filePath) => {
    if (!filePath || typeof filePath !== 'string') return null;
    const base = path.basename(filePath);
    const candidates = [];
    if (path.isAbsolute(filePath)) candidates.push(filePath);
    candidates.push(
      path.join(uploadsDir(), base),
      path.join(app.getPath('downloads'), base),
      path.join(app.getPath('desktop'), base),
      path.join(app.getPath('documents'), base)
    );
    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
  };

  const readFileAsBase64 = async (_, filePath) => {
    try {
      const resolved = resolveLocalFile(filePath);
      if (!resolved) return null;
      return fs.readFileSync(resolved).toString('base64');
    } catch (e) {
      console.error('Failed to read file as base64', e);
      return null;
    }
  };
  ipcMain.handle('fs:readFileBase64', readFileAsBase64);
  ipcMain.handle('fs:readLocalFileBase64', readFileAsBase64);

  ipcMain.handle('fs:copyRegistrationFile', async (_, srcPath) => {
    try {
      const resolved = resolveLocalFile(srcPath);
      if (!resolved) return null;
      const dest = path.join(uploadsDir(), path.basename(resolved));
      fs.copyFileSync(resolved, dest);
      return dest;
    } catch (e) {
      console.error('Failed to copy registration file', e);
      return srcPath || null;
    }
  });

  ipcMain.handle('fs:saveRegistrationFile', async (_, fileName, base64) => {
    try {
      if (!base64) return null;
      const safeName = path.basename(String(fileName || 'document.bin')).replace(/[<>:"/\\|?*]/g, '_');
      const dest = path.join(uploadsDir(), safeName);
      fs.writeFileSync(dest, Buffer.from(base64, 'base64'));
      return dest;
    } catch (e) {
      console.error('Failed to save registration file', e);
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
        const docType = data.doc_type || 'document';
        const ext = path.extname(finalPath).toLowerCase() || '.pdf';
        const newFileName = registrationDocFileName(docType, ext);
        const stored = await storeProcessedUpload({
          sourcePath: finalPath,
          fileName: newFileName,
          destSubdir: 'processed_registration_docs',
        });
        if (stored.success && stored.filePath) {
          finalPath = stored.filePath;
        }
      } catch (err) {
        console.error('Failed to process registration document:', err);
      }
    }

    const db = getDb();
    const cols = await db.all('PRAGMA table_info(company_documents)');
    if (!cols.some((c) => c.name === 'file_hash')) {
      await db.exec('ALTER TABLE company_documents ADD COLUMN file_hash TEXT');
    }
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

  ipcMain.handle('files:store-upload', async (_, payload = {}) => {
    try {
      return await storeProcessedUpload({
        sourcePath: payload.sourcePath || payload.filePath || '',
        fileName: payload.fileName || '',
        destSubdir: payload.destSubdir || 'processed_uploads',
      });
    } catch (err) {
      console.error('files:store-upload error', err);
      return { success: false, message: err?.message || 'Failed to store upload.' };
    }
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
    if (filters?.doc_status) {
      conditions.push("(COALESCE(p.doc_status, 'inbox') = ?)");
      params.push(filters.doc_status);
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

async function autoPopulatePackagingMaster(db, companyId, listType, lineItems, supplierGst, supplierName) {
  if (!companyId || !lineItems || !lineItems.length) return;
  const now = new Date().toISOString();
  const partyName = String(supplierName || '').trim();
  for (const item of lineItems) {
    if (!item.productDescription && !item.product && !item.item_name) continue;

    const normalized = normalizePackagingMasterRecord({
      company_id: companyId,
      list_type: listType || 'purchase',
      product_description: item.productDescription || item.product || item.item_name || '',
      hsn: item.hsn || item.hsn_code || '',
      uom: normalizeLineUom(item).unit || item.uom || item.unit || '',
      supplier_gst: supplierGst || '',
      supplier_name: partyName,
      plastic_category: item.plasticCategory || item.category_of_plastic || '',
      plastic_material: item.plasticMaterial || item.plastic_material || item.plastic_type || '',
      source: 'upload',
    });

    const existing = await db.get(
      'SELECT id FROM packaging_master WHERE company_id = ? AND list_type = ? AND product_match_key = ?',
      [companyId, normalized.list_type, normalized.product_match_key],
    );

    if (!existing) {
      await db.run(`
        INSERT INTO packaging_master (
          company_id, list_type, product_description, product_match_key, hsn, uom,
          supplier_gst, supplier_name, plastic_category, plastic_material,
          is_active, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'upload', ?, ?)
      `, [
        companyId, normalized.list_type, normalized.product_description, normalized.product_match_key,
        normalized.hsn, normalized.uom, normalized.supplier_gst, normalized.supplier_name,
        normalized.plastic_category, normalized.plastic_material, now, now,
      ]);
    } else if (partyName) {
      await db.run(
        `UPDATE packaging_master SET supplier_name = ?, supplier_gst = COALESCE(NULLIF(?, ''), supplier_gst), updated_at = ? WHERE id = ?`,
        [partyName, supplierGst || '', now, existing.id],
      );
    }
  }
}

/** Review save → upsert Category, Material, UOM, Manual/Auto-Master CF into packaging_master. */
async function syncReviewLinesToPackagingMaster(db, companyId, listType, lineItems, supplierGst, supplierName) {
  if (!companyId || !lineItems?.length) return { synced: 0 };

  const rows = lineItemsToPackagingSyncRows(lineItems, {
    companyId,
    listType: listType || 'purchase',
    supplierGst,
    supplierName,
    source: 'review',
  });
  if (!rows.length) return { synced: 0 };

  const now = new Date().toISOString();
  let synced = 0;

  for (const row of rows) {
    const existing = await db.get(
      'SELECT id FROM packaging_master WHERE company_id = ? AND list_type = ? AND product_match_key = ?',
      [row.company_id, row.list_type, row.product_match_key],
    );

    if (!existing) {
      await db.run(
        `INSERT INTO packaging_master (
          company_id, list_type, product_description, product_match_key, hsn, uom,
          supplier_gst, supplier_name, plastic_category, plastic_material,
          other_plastic_material, recycled_percent, conversion_factor, cf_base_source,
          value_in_mt, source, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          row.company_id,
          row.list_type,
          row.product_description,
          row.product_match_key,
          row.hsn,
          row.uom,
          row.supplier_gst,
          row.supplier_name,
          row.plastic_category,
          row.plastic_material,
          row.other_plastic_material || null,
          row.recycled_percent,
          row.conversion_factor,
          row.cf_base_source,
          row.value_in_mt,
          row.source,
          now,
          now,
        ],
      );
    } else {
      await db.run(
        `UPDATE packaging_master SET
          product_description = COALESCE(NULLIF(?, ''), product_description),
          hsn = COALESCE(NULLIF(?, ''), hsn),
          uom = COALESCE(NULLIF(?, ''), uom),
          supplier_gst = COALESCE(NULLIF(?, ''), supplier_gst),
          supplier_name = COALESCE(NULLIF(?, ''), supplier_name),
          plastic_category = COALESCE(NULLIF(?, ''), plastic_category),
          plastic_material = COALESCE(NULLIF(?, ''), plastic_material),
          other_plastic_material = COALESCE(NULLIF(?, ''), other_plastic_material),
          recycled_percent = COALESCE(?, recycled_percent),
          conversion_factor = CASE WHEN ? IS NOT NULL THEN ? ELSE conversion_factor END,
          cf_base_source = COALESCE(NULLIF(?, ''), cf_base_source),
          value_in_mt = COALESCE(?, value_in_mt),
          source = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          row.product_description,
          row.hsn,
          row.uom,
          row.supplier_gst,
          row.supplier_name,
          row.plastic_category,
          row.plastic_material,
          row.other_plastic_material,
          row.recycled_percent,
          row.conversion_factor,
          row.conversion_factor,
          row.cf_base_source,
          row.value_in_mt,
          row.source,
          now,
          existing.id,
        ],
      );
    }

    const saved = await db.get(
      'SELECT * FROM packaging_master WHERE company_id = ? AND list_type = ? AND product_match_key = ?',
      [row.company_id, row.list_type, row.product_match_key],
    );
    if (saved) {
      await cascadePackagingMasterUpdates(db, companyId, saved);
      synced += 1;
    }
  }

  return { synced };
}

async function syncSupplierMasterFromRecord(
  db,
  companyId,
  gstNumber,
  tradeName,
  legalName,
  address,
  mobile,
  entityType,
  registrationType,
  source = 'invoice_review',
) {
  if (!companyId || !gstNumber) return;
  try {
    await upsertSupplierMasterRow(
      db,
      {
        company_id: companyId,
        gst_number: gstNumber,
        trade_name: tradeName || '',
        legal_name: legalName || '',
        address: address || '',
        mobile: mobile || '',
        entity_type: entityType || '',
        registration_type: registrationType || 'Unregistered',
        source,
      },
      { cascadeFn: cascadeSupplierMasterUpdates, fromImport: false },
    );
  } catch (e) {
    console.warn('[supplierMaster] sync from record skipped:', e.message);
  }
}


  ipcMain.handle('purchases:add', async (_, data) => {
    const db = getDb();
    await assertNoDuplicatePurchase(db, data);

    let processedData = withLocalPdfInSourceFields(
      await storeInvoicePdfLocally({ ...data })
    );
    processedData = syncRecordMtFromLines(processedData, 'purchase');
    processedData.procurement_source = resolveProcurementSource(processedData);

    await autoPopulatePackagingMaster(
      db,
      processedData.company_id,
      'purchase',
      processedData.lineItems,
      processedData.supplier_gst_number || processedData.vendor_gstin,
      processedData.supplier_name || processedData.vendor_name
    );

    await syncSupplierMasterFromRecord(
      db,
      processedData.company_id,
      processedData.supplier_gst_number || processedData.vendor_gstin,
      processedData.supplier_name || processedData.vendor_name,
      '',
      processedData.address_line_1,
      processedData.supplier_mobile_number,
      processedData.entity_type,
      processedData.registration_type,
    );

    const stmt = await db.prepare(`
      INSERT INTO purchases (
        company_id, record_type, category_of_plastic, supplier_name, address_line_1,
        address_line_2, state, city, pin_code, buyer_gst, is_supplier_gst_available,
        supplier_gst_number, supplier_mobile_number, procurement_date, quantity_mt,
        invoice_number, hsn_code, invoice_filename, vendor_name, vendor_gstin, invoice_no,
        invoice_date, item_name, quantity, unit, total_amount, line_items, extraction,
        _source_fields, _routing, file_hash, created_at, registration_type, entity_type,
        financial_year, plastic_type, recycled_plastic_percent, country, irn_no, account_number, ifsc_code,
        conversion_factor, doc_status, procurement_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(processedData.lineItems || []),
      JSON.stringify(processedData.extraction || {}),
      JSON.stringify(processedData._source_fields || {}),
      JSON.stringify(processedData._routing || {}),
      processedData.fileHash || null,
      new Date().toISOString(),
      processedData.registration_type,
      processedData.entity_type,
      processedData.financial_year,
      processedData.plastic_type,
      processedData.recycled_plastic_percent,
      processedData.country,
      processedData.irn_no || null,
      processedData.account_number || null,
      processedData.ifsc_code || null,
      processedData.conversion_factor ?? null,
      processedData.doc_status || 'inbox',
      processedData.procurement_source || 'domestic'
    );
    await stmt.finalize();

    if (processedData.fileHash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', processedData.fileHash);
    }

    return { id: result.lastID, ...processedData };
  });

  ipcMain.handle('purchases:updateStatus', async (_, { id, doc_status }) => {
    const db = getDb();
    if (!id || !doc_status) return { success: false, error: 'Missing id or doc_status' };
    await db.run('UPDATE purchases SET doc_status = ? WHERE id = ?', [doc_status, id]);
    return { success: true };
  });

  ipcMain.handle('purchases:update', async (_, data) => {
    const db = getDb();
    await assertNoDuplicatePurchase(db, data, { excludeId: data.id });

    const oldData = await db.get('SELECT file_hash FROM purchases WHERE id = ?', data.id);
    const synced = syncRecordMtFromLines(data, 'purchase');
    synced.procurement_source = resolveProcurementSource(synced);

    const stmt = await db.prepare(`
      UPDATE purchases SET
        company_id = ?, record_type = ?, category_of_plastic = ?, supplier_name = ?, address_line_1 = ?,
        address_line_2 = ?, state = ?, city = ?, pin_code = ?, buyer_gst = ?, is_supplier_gst_available = ?,
        supplier_gst_number = ?, supplier_mobile_number = ?, procurement_date = ?, quantity_mt = ?,
        invoice_number = ?, hsn_code = ?, invoice_filename = ?, vendor_name = ?, vendor_gstin = ?, invoice_no = ?,
        invoice_date = ?, item_name = ?, quantity = ?, unit = ?, total_amount = ?, line_items = ?, extraction = ?,
        _source_fields = ?, _routing = ?, file_hash = ?, entity_type = ?, registration_type = ?,
        financial_year = ?, plastic_type = ?, recycled_plastic_percent = ?, country = ?,
        irn_no = ?, account_number = ?, ifsc_code = ?, conversion_factor = ?, doc_status = ?,
        procurement_source = ?
      WHERE id = ?
    `);

    await stmt.run(
      synced.company_id,
      synced.record_type,
      synced.category_of_plastic,
      synced.supplier_name,
      synced.address_line_1,
      synced.address_line_2,
      synced.state,
      synced.city,
      synced.pin_code,
      synced.buyer_gst,
      synced.is_supplier_gst_available,
      synced.supplier_gst_number,
      synced.supplier_mobile_number,
      synced.procurement_date,
      synced.quantity_mt,
      synced.invoice_number,
      synced.hsn_code,
      synced.invoice_filename,
      synced.vendor_name,
      synced.vendor_gstin,
      synced.invoice_no,
      synced.invoice_date,
      synced.item_name,
      synced.quantity,
      synced.unit,
      synced.total_amount,
      synced.lineItems ? JSON.stringify(synced.lineItems) : null,
      synced.extraction ? JSON.stringify(synced.extraction) : null,
      synced._source_fields ? JSON.stringify(synced._source_fields) : null,
      synced._routing ? JSON.stringify(synced._routing) : null,
      synced.fileHash || null,
      synced.entity_type,
      synced.registration_type,
      synced.financial_year,
      synced.plastic_type,
      synced.recycled_plastic_percent,
      synced.country,
      synced.irn_no || null,
      synced.account_number || null,
      synced.ifsc_code || null,
      synced.conversion_factor ?? null,
      synced.doc_status || 'inbox',
      synced.procurement_source || 'domestic',
      synced.id
    );
    await stmt.finalize();

    // Update fileHash in the file_hashes table if it changed
    if (synced.fileHash && oldData.file_hash !== synced.fileHash) {
      await db.run('UPDATE file_hashes SET hash = ? WHERE hash = ?', synced.fileHash, oldData.file_hash);
      if (!(await db.get('SELECT 1 FROM file_hashes WHERE hash = ?', synced.fileHash))) {
        await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', synced.fileHash);
      }
    } else if (synced.fileHash && !oldData.file_hash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', synced.fileHash);
    }

    const packagingResult = await syncReviewLinesToPackagingMaster(
      db,
      synced.company_id,
      'purchase',
      synced.lineItems || [],
      synced.supplier_gst_number || synced.vendor_gstin,
      synced.supplier_name || synced.vendor_name,
    );

    await syncSupplierMasterFromRecord(
      db,
      synced.company_id,
      synced.supplier_gst_number || synced.vendor_gstin,
      synced.supplier_name || synced.vendor_name,
      '',
      synced.address_line_1,
      synced.supplier_mobile_number,
      synced.entity_type,
      synced.registration_type,
    );

    return {
      success: true,
      packagingSynced: packagingResult.synced || 0,
      lineItems: synced.lineItems,
      quantity_mt: synced.quantity_mt,
      quantity: synced.quantity,
    };
  });

  ipcMain.handle('purchases:delete', async (_, id) => {
    const db = getDb();
    await db.run('DELETE FROM purchases WHERE id = ?', id);
    await pruneOrphanFileHashes(db);
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
    if (filters?.doc_status) {
      conditions.push("(COALESCE(s.doc_status, 'inbox') = ?)");
      params.push(filters.doc_status);
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
    await assertNoDuplicateSale(db, data);

    let processedData = withLocalPdfInSourceFields(
      await storeInvoicePdfLocally({ ...data })
    );
    processedData = syncRecordMtFromLines(processedData, 'sale');
    const globalBank = await getGlobalBankDetails(db);
    processedData = applyGlobalBankToRecord(processedData, globalBank);

    await autoPopulatePackagingMaster(
      db,
      processedData.company_id,
      'sales',
      processedData.lineItems,
      processedData.customer_gstin || processedData.buyer_gst,
      processedData.customer_name || processedData.entity_name
    );

    await syncSupplierMasterFromRecord(
      db,
      processedData.company_id,
      processedData.customer_gstin || processedData.buyer_gst,
      processedData.customer_name || processedData.entity_name,
      '',
      processedData.address,
      processedData.mobile_number,
      processedData.entity_type,
      processedData.registration_type,
    );

    const stmt = await db.prepare(`
      INSERT INTO sales (
        company_id, record_type, s_no, category_of_plastic, process_code,
        plastic_type, product_type, recycled_plastic_percent, conversion_factor,
        available_quantity_mt, quantity_sold_mt, registration_type, entity_name,
        address, state, district, account_number, ifsc_code, gst_other_charges,
        invoice_file_name, application_number, customer_name, customer_gstin, invoice_no,
        invoice_date, item_name, quantity, unit, total_amount, line_items, extraction,
        _source_fields, _routing, file_hash, created_at, entity_type, financial_year, mobile_number, doc_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      new Date().toISOString(),
      processedData.entity_type,
      processedData.financial_year,
      processedData.mobile_number,
      processedData.doc_status || 'inbox'
    );
    await stmt.finalize();

    if (processedData.fileHash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', processedData.fileHash);
    }

    return { id: result.lastID, ...processedData };
  });

  ipcMain.handle('sales:updateStatus', async (_, { id, doc_status }) => {
    const db = getDb();
    if (!id || !doc_status) return { success: false, error: 'Missing id or doc_status' };
    await db.run('UPDATE sales SET doc_status = ? WHERE id = ?', [doc_status, id]);
    return { success: true };
  });

  ipcMain.handle('sales:update', async (_, data) => {
    const db = getDb();
    await assertNoDuplicateSale(db, data, { excludeId: data.id });

    const oldData = await db.get('SELECT file_hash FROM sales WHERE id = ?', data.id);
    const globalBank = await getGlobalBankDetails(db);
    const synced = applyGlobalBankToRecord(syncRecordMtFromLines(data, 'sale'), globalBank);

    const stmt = await db.prepare(`
      UPDATE sales SET
        company_id = ?, record_type = ?, s_no = ?, category_of_plastic = ?, process_code = ?,
        plastic_type = ?, product_type = ?, recycled_plastic_percent = ?, conversion_factor = ?,
        available_quantity_mt = ?, quantity_sold_mt = ?, registration_type = ?, entity_name = ?,
        address = ?, state = ?, district = ?, account_number = ?, ifsc_code = ?, gst_other_charges = ?,
        invoice_file_name = ?, application_number = ?, customer_name = ?, customer_gstin = ?, invoice_no = ?,
        invoice_date = ?, item_name = ?, quantity = ?, unit = ?, total_amount = ?, line_items = ?, extraction = ?,
        _source_fields = ?, _routing = ?, file_hash = ?, entity_type = ?, financial_year = ?, mobile_number = ?, doc_status = ?
      WHERE id = ?
    `);

    await stmt.run(
      synced.company_id,
      synced.record_type,
      synced.s_no,
      synced.category_of_plastic,
      synced.process_code,
      synced.plastic_type,
      synced.product_type,
      synced.recycled_plastic_percent,
      synced.conversion_factor,
      synced.available_quantity_mt,
      synced.quantity_sold_mt,
      synced.registration_type,
      synced.entity_name,
      synced.address,
      synced.state,
      synced.district,
      synced.account_number,
      synced.ifsc_code,
      synced.gst_other_charges,
      synced.invoice_file_name,
      synced.application_number,
      synced.customer_name,
      synced.customer_gstin,
      synced.invoice_no,
      synced.invoice_date,
      synced.item_name,
      synced.quantity,
      synced.unit,
      synced.total_amount,
      synced.lineItems ? JSON.stringify(synced.lineItems) : null,
      synced.extraction ? JSON.stringify(synced.extraction) : null,
      synced._source_fields ? JSON.stringify(synced._source_fields) : null,
      synced._routing ? JSON.stringify(synced._routing) : null,
      synced.fileHash || null,
      synced.entity_type,
      synced.financial_year,
      synced.mobile_number,
      synced.doc_status || 'inbox',
      synced.id
    );
    await stmt.finalize();

    // Update fileHash in the file_hashes table if it changed
    if (synced.fileHash && oldData.file_hash !== synced.fileHash) {
      await db.run('UPDATE file_hashes SET hash = ? WHERE hash = ?', synced.fileHash, oldData.file_hash);
      if (!(await db.get('SELECT 1 FROM file_hashes WHERE hash = ?', synced.fileHash))) {
        await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', synced.fileHash);
      }
    } else if (synced.fileHash && !oldData.file_hash) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', synced.fileHash);
    }

    const packagingResult = await syncReviewLinesToPackagingMaster(
      db,
      synced.company_id,
      'sales',
      synced.lineItems || [],
      synced.customer_gstin || synced.buyer_gst,
      synced.customer_name || synced.entity_name,
    );

    await syncSupplierMasterFromRecord(
      db,
      synced.company_id,
      synced.customer_gstin || synced.buyer_gst,
      synced.customer_name || synced.entity_name,
      '',
      synced.address,
      synced.mobile_number,
      synced.entity_type,
      synced.registration_type,
    );

    return {
      success: true,
      packagingSynced: packagingResult.synced || 0,
      lineItems: synced.lineItems,
      quantity_sold_mt: synced.quantity_sold_mt,
      quantity: synced.quantity,
    };
  });

  ipcMain.handle('sales:applyBankDetailsToAll', async (_, { account_number, ifsc_code, overwriteAll = true }) => {
    try {
      const account = String(account_number || '').trim();
      const ifsc = String(ifsc_code || '').trim().toUpperCase();
      if (!account || !ifsc) {
        return { success: false, error: 'Account number and IFSC code are required' };
      }
      const db = getDb();
      const result = overwriteAll
        ? await db.run(
          `UPDATE sales SET account_number = ?, ifsc_code = ?`,
          account,
          ifsc,
        )
        : await db.run(
          `UPDATE sales SET account_number = ?, ifsc_code = ?
           WHERE (account_number IS NULL OR account_number = '')
             AND (ifsc_code IS NULL OR ifsc_code = '')`,
          account,
          ifsc,
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
    await db.run('DELETE FROM sales WHERE id = ?', id);
    await pruneOrphanFileHashes(db);
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
      const result = await getRegistrationDetails();
      registrationLog.info('IPC registration:get', {
        dbPath: getDbFilePath(),
        hasData: Boolean(result?.data),
        ceprId: result?.data?.cepr_id || null,
      });
      return result;
    } catch (err) {
      registrationLog.error('IPC registration:get failed', { error: err.message });
      console.error('registration:get error', err);
      return { success: false, data: null, error: err.message };
    }
  });

  ipcMain.handle('registration:save', async (_, data) => {
    try {
      const result = await saveRegistrationDetails(data);
      registrationLog.success('IPC registration:save', {
        dbPath: getDbFilePath(),
        id: result?.id,
        inserted: result?.inserted,
        ceprId: result?.data?.cepr_id || data?.cepr_id || null,
      });
      return result;
    } catch (err) {
      registrationLog.error('IPC registration:save failed', { error: err.message, ceprId: data?.cepr_id || null });
      console.error('registration:save error', err);
      return { success: false, error: err.message };
    }
  });

  // Removed duplicate registration:get handler

  // ─── REGISTRATION SCRAPER ────────────────────────────────────
  ipcMain.handle('scraper:startRegistrationFlow', async (event, data) => {
    bindPortalToastSender(event);
    return await startRegistrationFlow(data, (msg) => sendScraperLog(event, msg));
  });
  
  ipcMain.handle('scraper:submitEmailOtp', async (event, payload) => {
    const otp = typeof payload === 'string' ? payload : payload?.otp;
    const mobile = typeof payload === 'object' ? payload?.mobile : undefined;
    return await submitEmailOtp(otp, mobile, (msg) => sendScraperLog(event, msg));
  });
  
  ipcMain.handle('scraper:resendEmailOtp', async (event) => {
    return await resendEmailOtp((msg) => sendScraperLog(event, msg));
  });
  
  ipcMain.handle('scraper:submitMobileOtp', async (event, payload) => {
    return await submitMobileOtp(payload, (msg) => sendScraperLog(event, msg));
  });
  
  ipcMain.handle('scraper:resendMobileOtp', async (event) => {
    return await resendMobileOtp((msg) => sendScraperLog(event, msg));
  });

  ipcMain.handle('scraper:submitRegistrationCaptcha', async (event, payload) => {
    const captchaText = typeof payload === 'string' ? payload : payload?.captcha;
    return await submitRegistrationCaptcha(captchaText, (msg) => sendScraperLog(event, msg));
  });

  ipcMain.handle('scraper:refreshRegistrationCaptcha', async (event) => {
    return await refreshRegistrationCaptcha((msg) => sendScraperLog(event, msg));
  });

  ipcMain.handle('scraper:startLoginFlow', async (event, payload) => {
    bindPortalToastSender(event);
    setPaymentBypassNotifier(() => event.sender.send('scraper:payment-bypass-prompt'));
    return await startLoginFlow(payload, (msg) => sendScraperLog(event, msg));
  });

  ipcMain.handle('scraper:submitLoginCaptcha', async (event, payload) => {
    const captchaText = typeof payload === 'string' ? payload : payload?.captcha;
    return await submitLoginCaptcha(captchaText, (msg) => sendScraperLog(event, msg), payload);
  });

  ipcMain.handle('scraper:refreshLoginCaptcha', async (event) => {
    return await refreshLoginCaptcha((msg) => sendScraperLog(event, msg));
  });

  ipcMain.handle('scraper:submitLoginOtp', async (event, payload) => {
    setPaymentBypassNotifier(() => event.sender.send('scraper:payment-bypass-prompt'));
    const otp = typeof payload === 'string' ? payload : payload?.otp;
    const autoScrape = Boolean(typeof payload === 'object' && payload?.autoScrape);
    const runOnboarding = Boolean(typeof payload === 'object' && payload?.runOnboarding);
    return await submitLoginOtp(otp, (msg) => sendScraperLog(event, msg), { autoScrape, runOnboarding });
  });

  ipcMain.handle('scraper:runApplicationOnboardingAfterLogin', async (event, payload) => {
    setPaymentBypassNotifier(() => event.sender.send('scraper:payment-bypass-prompt'));
    const autoScrape = Boolean(typeof payload === 'object' && payload?.autoScrape);
    return await runApplicationOnboardingAfterLogin((msg) => sendScraperLog(event, msg), { autoScrape });
  });

  ipcMain.handle('scraper:answerPaymentBypass', async (_event, payload) => {
    return resolvePaymentBypass(payload || {});
  });

  ipcMain.handle('scraper:resendLoginOtp', async (event) => {
    return await resendLoginOtp((msg) => sendScraperLog(event, msg));
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
          await prepareCpcbBrowserPage(cpcbPage);
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
        await prepareCpcbBrowserPage(cpcbPage);
        await pruneExtraTabs(cpcbPage);
        return { reused: true };
      }
    }

    cpcbLaunchPromise = (async () => {
      const userDataDir = getCpcbSessionDir();
      const launchOpts = getCpcbPersistentLaunchOpts();

      let context;
      try {
        context = await chromium.launchPersistentContext(userDataDir, launchOpts);
      } catch (firstErr) {
        try {
          context = await chromium.launchPersistentContext(
            userDataDir,
            getCpcbPersistentLaunchOpts({ channel: 'chrome' }),
          );
        } catch {
          throw firstErr;
        }
      }

      cpcbContext = context;
      cpcbBrowser = context;

      // Prefer an existing page; never open extras
      const existing = context.pages();
      cpcbPage = existing.length > 0 ? existing[0] : await context.newPage();
      await prepareCpcbBrowserPage(cpcbPage);
      await attachPortalToastWatcherToContext(context).catch(() => {});
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
    try {
      console.log('Starting EPR scraper...');

      const userDataDir = path.join(__dirname, '..', 'playwright_session');
      const context = await chromium.launchPersistentContext(
        userDataDir,
        getCpcbPersistentLaunchOpts(),
      );
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      await prepareCpcbBrowserPage(page);

      await page.goto('https://epr.cpcb.gov.in');

      console.log('Waiting for manual login... (continues when URL changes to dashboard)');
      try {
        await page.waitForURL('**/*dashboard*', { timeout: 300000 });
        console.log('Login detected! Proceeding with extraction...');
      } catch (e) {
        console.error('Login wait error:', e.message);
        console.log('Trying extractors anyway...');
      }

      const result = await runEprExtraction(page, {
        onLog: (msg) => console.log(msg),
      });

      return result.success
        ? { success: true, data: result.data }
        : { success: false, error: result.error || 'Scraper failed' };
    } catch (error) {
      console.error('Scraper failed:', error);
      return { success: false, error: error.message };
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
      const result = {};

      const appRow = await db.get(
        'SELECT * FROM scraped_new_application ORDER BY scraped_at DESC LIMIT 1',
      );
      if (appRow) {
        const { id, ...app } = appRow;
        result.new_application_part_a = app;
        result.new_application_part_b = app;
      }

      const plasticRows = await db.all(
        'SELECT financial_year, rigid_plastic_cat_i_mt, flexible_plastic_cat_ii_mt, mlp_plastic_cat_iii_mt, compostable_plastic_cat_iv_mt, unit_gst, scraped_at FROM scraped_plastic_consumed ORDER BY financial_year',
      );
      if (plasticRows.length) {
        result.new_app_plastic_consumed_tpa = plasticRows;
      }

      if (result.new_application_part_a) return result;

      // Legacy fallback: old new_app* tables
      const tables = await db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'new_app%');",
      );
      for (const t of tables) {
        const rows = await db.all(`SELECT * FROM ${t.name}`);
        const cleanRows = rows.map((row) => {
          const { _internal_id, file_source, ...rest } = row;
          return rest;
        });
        if (
          t.name === 'new_application_part_a' ||
          t.name === 'new_application_part_b' ||
          t.name === 'new_application_part_c'
        ) {
          result[t.name] = cleanRows.length > 0 ? cleanRows[0] : null;
        } else {
          result[t.name] = cleanRows;
        }
      }
      return result;
    } catch (e) {
      console.error('Failed to fetch new application data:', e);
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

  ipcMain.handle('supplierMaster:getAll', async (_, filters) => {
    const db = getDb();
    return await db.all('SELECT * FROM supplier_master ORDER BY created_at DESC');
  });

  ipcMain.handle('supplierMaster:add', async (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    try {
      const result = await db.run(
        `INSERT INTO supplier_master (
          company_id, gst_number, trade_name, address, mobile, entity_type, registration_type,
          registration_number, state, pan, source, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.company_id,
          data.gst_number,
          data.trade_name,
          data.address,
          data.mobile,
          data.entity_type,
          data.registration_type,
          data.registration_number || null,
          data.state || null,
          data.pan || null,
          data.source || 'manual',
          1,
          created_at,
          created_at,
        ],
      );
      return { success: true, id: result.lastID };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('supplierMaster:update', async (_, { id, ...data }) => {
    const db = getDb();
    const updated_at = new Date().toISOString();
    try {
      const oldRecord = await db.get('SELECT * FROM supplier_master WHERE id = ?', [id]);
      const oldGstNumber = oldRecord ? oldRecord.gst_number : null;

      await db.run(
        `UPDATE supplier_master SET
           company_id = COALESCE(?, company_id),
           gst_number = COALESCE(?, gst_number),
           trade_name = COALESCE(?, trade_name),
           address = COALESCE(?, address),
           mobile = COALESCE(?, mobile),
           entity_type = COALESCE(?, entity_type),
           registration_type = COALESCE(?, registration_type),
           registration_number = COALESCE(?, registration_number),
           state = COALESCE(?, state),
           pan = COALESCE(?, pan),
           source = COALESCE(?, source),
           is_active = COALESCE(?, is_active),
           updated_at = ?
         WHERE id = ?`,
        [
          data.company_id,
          data.gst_number,
          data.trade_name,
          data.address,
          data.mobile,
          data.entity_type,
          data.registration_type,
          data.registration_number,
          data.state,
          data.pan,
          data.source,
          data.is_active,
          updated_at,
          id,
        ],
      );

      const updatedRecord = await db.get('SELECT * FROM supplier_master WHERE id = ?', [id]);
      if (updatedRecord && oldGstNumber) {
        await cascadeSupplierMasterUpdates(db, updatedRecord.company_id, oldGstNumber, updatedRecord);
      }

      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

async function cascadeSupplierMasterUpdates(db, companyId, oldGstNumber, updatedRecord) {
  if (!oldGstNumber) return; // Cannot cascade if we don't know the old GST

  // Update purchases
  await db.run(
    `UPDATE purchases SET
      supplier_name = ?,
      vendor_name = ?,
      address_line_1 = ?,
      supplier_mobile_number = ?,
      entity_type = ?,
      registration_type = ?,
      supplier_gst_number = ?,
      vendor_gstin = ?
    WHERE company_id = ? AND (supplier_gst_number = ? OR vendor_gstin = ?)`,
    [
      updatedRecord.trade_name, updatedRecord.trade_name, updatedRecord.address, updatedRecord.mobile, updatedRecord.entity_type, updatedRecord.registration_type, updatedRecord.gst_number, updatedRecord.gst_number,
      companyId, oldGstNumber, oldGstNumber
    ]
  );

  // Update sales
  await db.run(
    `UPDATE sales SET
      customer_name = ?,
      entity_name = ?,
      address = ?,
      mobile_number = ?,
      entity_type = ?,
      registration_type = ?,
      customer_gstin = ?
    WHERE company_id = ? AND customer_gstin = ?`,
    [
      updatedRecord.trade_name, updatedRecord.trade_name, updatedRecord.address, updatedRecord.mobile, updatedRecord.entity_type, updatedRecord.registration_type, updatedRecord.gst_number,
      companyId, oldGstNumber
    ]
  );
}

async function cascadePackagingMasterUpdates(db, companyId, updatedRecord) {
  const matchKey = updatedRecord.product_match_key;
  if (!matchKey) return;

  const updateLineItems = (lineItemsJson) => {
    if (!lineItemsJson) return lineItemsJson;
    try {
      const items = JSON.parse(lineItemsJson);
      let changed = false;
      for (const item of items) {
        const productDesc = item.productDescription || item.item_name || '';
        const desc = String(productDesc).trim().toLowerCase();
        const hsn = String(item.hsn || item.hsn_code || '').trim().replace(/\D/g, '');
        const itemKey = `${desc}::${hsn}`;
        
        if (itemKey === matchKey) {
          item.plasticCategory = updatedRecord.plastic_category;
          item.plasticMaterial = updatedRecord.plastic_material;
          if (updatedRecord.hsn) {
            item.hsn = updatedRecord.hsn;
            item.hsn_code = updatedRecord.hsn;
          }
          if (updatedRecord.uom) {
            item.uom = updatedRecord.uom;
            item.unit = updatedRecord.uom;
          }
          if (updatedRecord.conversion_factor != null && Number(updatedRecord.conversion_factor) > 0) {
            item.conversionFactor = String(updatedRecord.conversion_factor);
            item.conversionFactorApplied = String(updatedRecord.conversion_factor);
            item.conversion_factor = updatedRecord.conversion_factor;
            item.conversion_factor_applied = updatedRecord.conversion_factor;
            item.quantityDerivationType = 'conversion_factor';
            item.quantity_derivation_type = 'conversion_factor';
            item.conversionMethodUsed = 'auto_master';
            item.conversion_method_used = 'auto_master';
          }
          if (updatedRecord.cf_base_source) {
            item.cfBaseSource = updatedRecord.cf_base_source;
            item.cf_base_source = updatedRecord.cf_base_source;
          }
          changed = true;
        }
      }
      return changed ? JSON.stringify(items) : lineItemsJson;
    } catch (e) {
      return lineItemsJson;
    }
  };

  // Update Purchases
  const purchases = await db.all('SELECT id, line_items FROM purchases WHERE company_id = ?', [companyId]);
  for (const p of purchases) {
    const updatedItems = updateLineItems(p.line_items);
    if (updatedItems !== p.line_items) {
      await db.run(`
        UPDATE purchases SET 
          line_items = ?,
          category_of_plastic = COALESCE(?, category_of_plastic)
        WHERE id = ?`, 
        [updatedItems, updatedRecord.plastic_category, p.id]
      );
    }
  }

  // Update Sales
  const sales = await db.all('SELECT id, line_items FROM sales WHERE company_id = ?', [companyId]);
  for (const s of sales) {
    const updatedItems = updateLineItems(s.line_items);
    if (updatedItems !== s.line_items) {
      await db.run(`
        UPDATE sales SET 
          line_items = ?,
          category_of_plastic = COALESCE(?, category_of_plastic),
          plastic_type = COALESCE(?, plastic_type),
          conversion_factor = COALESCE(?, conversion_factor),
          recycled_plastic_percent = COALESCE(?, recycled_plastic_percent)
        WHERE id = ?`, 
        [
          updatedItems, 
          updatedRecord.plastic_category, 
          updatedRecord.plastic_material, 
          updatedRecord.conversion_factor, 
          updatedRecord.recycled_percent, 
          s.id
        ]
      );
    }
  }
}

  ipcMain.handle('supplierMaster:bulkUpsert', async (_, { rows }) => {
    const db = getDb();
    try {
      let added = 0;
      let updated = 0;
      const errors = [];
      for (let i = 0; i < (rows || []).length; i++) {
        const row = rows[i];
        try {
          const result = await upsertSupplierMasterRow(db, row, {
            cascadeFn: cascadeSupplierMasterUpdates,
            fromImport: true,
          });
          if (result.action === 'added') added += 1;
          else updated += 1;
        } catch (e) {
          errors.push(`Row ${i + 1}: ${e.message}`);
        }
      }
      return {
        success: errors.length === 0,
        added,
        updated,
        errors,
      };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('supplierMaster:delete', async (_, id) => {
    const db = getDb();
    try {
      await db.run('DELETE FROM supplier_master WHERE id=?', [id]);
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('packagingMaster:getAll', async (_, filters) => {
    const db = getDb();
    const params = [];
    let query = 'SELECT * FROM packaging_master';
    const conditions = [];
    if (filters?.company_id) {
      conditions.push('company_id = ?');
      params.push(filters.company_id);
    }
    if (filters?.list_type) {
      conditions.push('list_type = ?');
      params.push(filters.list_type);
    }
    if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY created_at DESC';
    return await db.all(query, ...params);
  });

  ipcMain.handle('packagingMaster:lookup', async (_, { company_id, product_description, hsn, list_type = 'gpl' }) => {
    const db = getDb();
    const desc = String(product_description ?? '').trim().toLowerCase();
    const h = String(hsn ?? '').trim().replace(/\D/g, '');
    const productMatchKey = `${desc}::${h}`;
    const row = await db.get(
      `SELECT * FROM packaging_master
       WHERE company_id = ? AND list_type = ? AND product_match_key = ? AND is_active != 0
       LIMIT 1`,
      [company_id, list_type, productMatchKey],
    );
    return row || null;
  });

  ipcMain.handle('packagingMaster:add', async (_, data) => {
    const db = getDb();
    const created_at = new Date().toISOString();
    try {
      const normalized = normalizePackagingMasterRecord(data);
      const result = await db.run(
        `INSERT INTO packaging_master (
          company_id, list_type, product_description, product_match_key, hsn, uom,
          supplier_gst, supplier_name, plastic_category, plastic_material, other_plastic_material,
          cat1, recycled_percent, conversion_factor_id, cf_base_source, conversion_factor,
          cf_date_from, cf_date_to, total_quantity, value_in_mt, match_type, source, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.company_id, normalized.list_type || 'purchase', normalized.product_description,
          normalized.product_match_key, normalized.hsn, normalized.uom,
          normalized.supplier_gst, normalized.supplier_name, normalized.plastic_category,
          normalized.plastic_material, normalized.other_plastic_material,
          normalized.cat1, normalized.recycled_percent, normalized.conversion_factor_id,
          normalized.cf_base_source, normalized.conversion_factor,
          normalized.cf_date_from, normalized.cf_date_to, normalized.total_quantity,
          normalized.value_in_mt, normalized.match_type || 'exact',
          normalized.source || 'manual', 1, created_at, created_at,
        ],
      );
      return { success: true, id: result.lastID };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('packagingMaster:update', async (_, { id, ...data }) => {
    const db = getDb();
    const updated_at = new Date().toISOString();
    try {
      const normalized = normalizePackagingMasterRecord({ ...data, id });
      await db.run(
        `UPDATE packaging_master SET
          company_id = COALESCE(?, company_id),
          list_type = COALESCE(?, list_type),
          product_description = COALESCE(?, product_description),
          product_match_key = COALESCE(?, product_match_key),
          hsn = COALESCE(?, hsn),
          uom = COALESCE(?, uom),
          supplier_gst = COALESCE(?, supplier_gst),
          supplier_name = COALESCE(?, supplier_name),
          plastic_category = COALESCE(?, plastic_category),
          plastic_material = COALESCE(?, plastic_material),
          other_plastic_material = COALESCE(?, other_plastic_material),
          cat1 = COALESCE(?, cat1),
          recycled_percent = COALESCE(?, recycled_percent),
          conversion_factor_id = COALESCE(?, conversion_factor_id),
          cf_base_source = COALESCE(?, cf_base_source),
          conversion_factor = COALESCE(?, conversion_factor),
          cf_date_from = COALESCE(?, cf_date_from),
          cf_date_to = COALESCE(?, cf_date_to),
          total_quantity = COALESCE(?, total_quantity),
          value_in_mt = COALESCE(?, value_in_mt),
          match_type = COALESCE(?, match_type),
          is_active = COALESCE(?, is_active),
          updated_at = ?
        WHERE id = ?`,
        [
          normalized.company_id, normalized.list_type, normalized.product_description,
          normalized.product_match_key, normalized.hsn, normalized.uom,
          normalized.supplier_gst, normalized.supplier_name, normalized.plastic_category,
          normalized.plastic_material, normalized.other_plastic_material,
          normalized.cat1, normalized.recycled_percent, normalized.conversion_factor_id,
          normalized.cf_base_source, normalized.conversion_factor,
          normalized.cf_date_from, normalized.cf_date_to, normalized.total_quantity,
          normalized.value_in_mt, normalized.match_type, normalized.is_active,
          updated_at, id,
        ],
      );

      const updated = await db.get('SELECT * FROM packaging_master WHERE id = ?', [id]);
      if (updated) {
        await cascadePackagingMasterUpdates(db, updated.company_id, updated);
      }

      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('packagingMaster:repair', async (_, { company_id = null } = {}) => {
    const db = getDb();
    const params = [];
    let query = 'SELECT * FROM packaging_master';
    if (company_id) {
      query += ' WHERE company_id = ?';
      params.push(company_id);
    }
    const rows = await db.all(query, ...params);
    const now = new Date().toISOString();
    let repaired = 0;

    for (const row of rows) {
      const normalized = normalizePackagingMasterRecord({
        ...row,
        list_type: row.list_type === 'gpl' ? 'purchase' : row.list_type,
        plastic_material: sanitizePlasticMaterial(row.plastic_material),
        plastic_category: sanitizePlasticCategory(row.plastic_category),
      });

      const changed =
        normalized.product_description !== row.product_description ||
        normalized.product_match_key !== row.product_match_key ||
        normalized.hsn !== (row.hsn || '') ||
        normalized.plastic_category !== (row.plastic_category || '') ||
        normalized.plastic_material !== (row.plastic_material || '') ||
        normalized.list_type !== row.list_type;

      if (!changed) continue;

      await db.run(
        `UPDATE packaging_master SET
          list_type = ?,
          product_description = ?,
          product_match_key = ?,
          hsn = ?,
          uom = COALESCE(NULLIF(?, ''), uom),
          plastic_category = ?,
          plastic_material = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          normalized.list_type,
          normalized.product_description,
          normalized.product_match_key,
          normalized.hsn,
          normalized.uom,
          normalized.plastic_category,
          normalized.plastic_material,
          now,
          row.id,
        ],
      );
      repaired += 1;
    }

    return { success: true, repaired, total: rows.length };
  });

  ipcMain.handle('packagingMaster:delete', async (_, id) => {
    const db = getDb();
    try {
      await db.run('DELETE FROM packaging_master WHERE id=?', [id]);
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('packagingMaster:deleteMany', async (_, ids) => {
    const db = getDb();
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: 'No records selected' };
    }
    try {
      const placeholders = ids.map(() => '?').join(',');
      const result = await db.run(
        `DELETE FROM packaging_master WHERE id IN (${placeholders})`,
        ids,
      );
      return { success: true, deleted: result?.changes ?? ids.length };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('packagingMaster:updateMany', async (_, { ids, updates }) => {
    const db = getDb();
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: 'No records selected' };
    }

    const allowed = [
      'plastic_category', 'plastic_material', 'conversion_factor',
      'hsn', 'uom', 'list_type', 'recycled_percent', 'cf_base_source',
    ];
    const patch = {};
    for (const key of allowed) {
      const value = updates?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        patch[key] = value;
      }
    }
    if (!Object.keys(patch).length) {
      return { success: false, error: 'Select at least one field to update' };
    }

    const updated_at = new Date().toISOString();
    let updated = 0;

    try {
      for (const id of ids) {
        const existing = await db.get('SELECT * FROM packaging_master WHERE id = ?', [id]);
        if (!existing) continue;

        const merged = { ...existing, ...patch };
        if (patch.hsn !== undefined) {
          merged.product_match_key = buildProductMatchKey(merged.product_description, patch.hsn);
        }
        const normalized = normalizePackagingMasterRecord({ ...merged, id });

        await db.run(
          `UPDATE packaging_master SET
            list_type = COALESCE(?, list_type),
            product_match_key = COALESCE(?, product_match_key),
            hsn = COALESCE(?, hsn),
            uom = COALESCE(?, uom),
            plastic_category = COALESCE(?, plastic_category),
            plastic_material = COALESCE(?, plastic_material),
            recycled_percent = COALESCE(?, recycled_percent),
            cf_base_source = COALESCE(?, cf_base_source),
            conversion_factor = COALESCE(?, conversion_factor),
            updated_at = ?
          WHERE id = ?`,
          [
            normalized.list_type,
            normalized.product_match_key,
            normalized.hsn,
            normalized.uom,
            normalized.plastic_category,
            normalized.plastic_material,
            normalized.recycled_percent,
            normalized.cf_base_source,
            normalized.conversion_factor,
            updated_at,
            id,
          ],
        );

        const saved = await db.get('SELECT * FROM packaging_master WHERE id = ?', [id]);
        if (saved) {
          await cascadePackagingMasterUpdates(db, saved.company_id, saved);
        }
        updated += 1;
      }

      return { success: true, updated };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message, updated };
    }
  });

  ipcMain.handle('packagingMaster:bulkUpsert', async (_, { rows }) => {
    const db = getDb();
    try {
      let added = 0;
      let updated = 0;
      const errors = [];
      for (let i = 0; i < (rows || []).length; i++) {
        const row = rows[i];
        try {
          const result = await upsertPackagingMasterRow(db, row, {
            cascadeFn: cascadePackagingMasterUpdates,
            fromImport: true,
          });
          if (result.action === 'added') added += 1;
          else updated += 1;
        } catch (e) {
          errors.push(`Row ${i + 2}: ${e.message}`);
        }
      }
      return {
        success: added + updated > 0,
        added,
        updated,
        failed: errors.length,
        errors,
      };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('letters:preview', async (_event, payload = {}) => {
    try {
      const result = await previewPartCLetters(payload);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('letters:save', async (_event, payload = {}) => {
    try {
      const filled = await buildFilledDocx(payload.templateId, payload.values || {});
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save letter',
        defaultPath: filled.fileName,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      fs.writeFileSync(filePath, filled.buffer);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('letters:saveAll', async (_event, payload = {}) => {
    try {
      const zipped = await zipPartCLetters(payload);
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save letters ZIP',
        defaultPath: zipped.fileName,
        filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      fs.writeFileSync(filePath, zipped.buffer);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('importerEpr:compute3aDraft', async (_, payload = {}) => {
    try {
      const { companyId, purchases, sales, packagingRows } = payload;
      if (purchases && sales) {
        const draft = buildImporter3aDraft({ purchases, sales, packagingRows: packagingRows || [] });
        return { success: true, draft };
      }
      const draft = await computeImporter3aDraft({ companyId: companyId || null });
      return { success: true, draft };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('importerEpr:finalize3a', async (_, payload = {}) => {
    try {
      const result = await finalizeAndGenerateImporter3a({
        companyId: payload.companyId || null,
        companyName: payload.companyName || 'Importer',
        draft: payload.draft || null,
      });
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('importerEpr:generate3bPdf', async (_, payload = {}) => {
    try {
      return await generateImporter3bFromImages({
        companyName: payload.companyName || 'Importer',
        images: payload.images || [],
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

