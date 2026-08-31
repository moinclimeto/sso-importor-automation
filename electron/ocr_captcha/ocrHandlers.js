import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scanQrFromDocument } from './qrScan.js';
import { getFileSha256 } from '../utils/hashUtils.js';
import { getDb, saveDb } from '../db/database.js';
import {
  buildExtractionPrompt,
  mapPurchaseFromOcr,
  mapSaleFromOcr,
  normalizePurchasePartyFields,
  applyQrPriority,
  fillMissingSupplierGst,
  fileBaseName,
} from './ocrExtract.js';
import { extractPdfTextForGstFallback } from '../invoicePartyProbe.js';
import { createLogger, createTrackId } from '../utils/logger.js';
import { loadEnvFile, getGeminiApiKeys } from '../loadEnv.js';
import { runExtractQueue } from './extractQueue.js';
import {
  beginEntityVerifyBatch,
  endEntityVerifyBatch,
} from '../entityRegistrationVerify.js';
import {
  getPdfPageCount,
  expandFilesToPageJobs,
  renderPdfPageToPng,
  writeTempPng,
  safeUnlink,
  pageInvoiceFileName,
} from '../utils/pdfPages.js';
import { resolveUploadPaths } from '../utils/zipExpand.js';
import {
  normalizeCompanyDocumentExtraction,
  needsCinOcrRetry,
} from '../../shared/companyDocNormalize.js';

async function fetchDefaultConversionFactor(db) {
  if (!db) return null;
  try {
    const tableCheck = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='conversion_factor'`
    );
    if (!tableCheck) return null;
    const row = await db.get(
      'SELECT conversion_factor FROM conversion_factor ORDER BY _internal_id LIMIT 1'
    );
    const n = parseFloat(row?.conversion_factor);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function isNetworkError(err) {
  const msg = `${err?.message || ''} ${err?.cause?.message || ''} ${err?.cause?.code || ''}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|socket|network|ECONNREFUSED/i.test(msg);
}

async function runGeminiJsonExtraction({
  genAI,
  modelNames,
  prompt,
  mimeType,
  base64,
  log,
}) {
  let lastError = null;
  for (const modelName of modelNames) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096),
          },
        });
        const result = await model.generateContent([
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ]);
        const text = result.response
          .text()
          .trim()
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        return { parsed: JSON.parse(text), usedModel: modelName, lastError: null };
      } catch (err) {
        lastError = err;
        log.warn('Gemini model failed', {
          modelName,
          attempt,
          message: err?.message,
          cause: err?.cause?.code || err?.cause?.message,
        });
        if (isNetworkError(err) && attempt < 3) {
          await new Promise((r) => setTimeout(r, 700 * attempt));
          continue;
        }
        break;
      }
    }
  }
  return { parsed: null, usedModel: null, lastError };
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}
async function extractOneInvoice({
  filePath,
  type,
  financialYear,
  sNo,
  trackId,
  log: parentLog,
  pageNumber = 1,
  pageCount = null,
  invoiceFileName = null,
  displayName = null,
  fileHash = null,
  companyDocType = null,
}) {
  loadEnvFile();
  const log = parentLog || createLogger(trackId || createTrackId('ocr'));
  const apiKeys = getGeminiApiKeys();
  if (!apiKeys.length) {
    log.error('GEMINI_API_KEY missing');
    return {
      success: false,
      message:
        'GEMINI_API_KEY not found. For the installed app add it to %APPDATA%\\sso-importor-automation\\.env (or rebuild the installer). For electron:dev use the project root .env, then restart.',
      trackId: log.trackId,
    };
  }
  const sNoIndex = sNo ? Number(sNo) : Math.floor(Math.random() * 100);
  const apiKey = apiKeys[sNoIndex % apiKeys.length];
  if (!filePath || !fs.existsSync(filePath)) {
    log.error('File not found', { filePath });
    return { success: false, message: 'File not found.', trackId: log.trackId };
  }

  const ext = path.extname(filePath).toLowerCase();
  const isPdf = ext === '.pdf';
    let resolvedPageCount = pageCount;
    if (resolvedPageCount == null) {
      try {
        resolvedPageCount = isPdf ? await getPdfPageCount(filePath) : 1;
      } catch {
        resolvedPageCount = 1;
      }
    }
    const pageNo = Math.min(Math.max(1, Number(pageNumber) || 1), resolvedPageCount);
    const sourceName = fileBaseName(filePath);
    const outFileName =
      invoiceFileName || pageInvoiceFileName(sourceName, pageNo, resolvedPageCount);

    if (!fileHash) {
      fileHash = await getFileSha256(filePath);
    }

    let mimeType = mimeFromPath(filePath);
    let base64;
    let qrTargetPath = filePath;
  let tempPng = null;

  try {
    const invoiceType = type === 'sale' ? 'sale' : type === 'company_document' ? 'company_document' : 'purchase';

    if (isPdf) {
      log.info('Passing whole PDF to Gemini', {
        sourceName,
        pageCount: resolvedPageCount,
      });
      base64 = fs.readFileSync(filePath).toString('base64');
      mimeType = 'application/pdf';
      qrTargetPath = filePath;
    } else {
      if (mimeType === 'application/octet-stream') {
        return { success: false, message: 'Unsupported file type.', trackId: log.trackId };
      }
      base64 = fs.readFileSync(filePath).toString('base64');
    }

    const qrPromise = scanQrFromDocument(qrTargetPath);

    const genAI = new GoogleGenerativeAI(apiKey);
    const envModel = process.env.GEMINI_MODEL?.trim();
    const envCandidates = (process.env.GEMINI_MODEL_CANDIDATES || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const defaultModels = [
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.6-flash',
    ];
    const modelNames = [
      ...new Set([...(envModel ? [envModel] : []), ...envCandidates, ...defaultModels]),
    ];
    const prompt = buildExtractionPrompt(invoiceType, financialYear, companyDocType, sourceName);
    let { parsed, usedModel, lastError } = await runGeminiJsonExtraction({
      genAI,
      modelNames,
      prompt,
      mimeType,
      base64,
      log,
    });

    if (
      parsed &&
      invoiceType === 'company_document' &&
      needsCinOcrRetry(parsed, sourceName, companyDocType || 'auto')
    ) {
      log.info('Retrying CIN-focused OCR', { sourceName });
      const cinPrompt = buildExtractionPrompt(invoiceType, financialYear, 'cin', sourceName);
      const retry = await runGeminiJsonExtraction({
        genAI,
        modelNames,
        prompt: cinPrompt,
        mimeType,
        base64,
        log,
      });
      if (retry.parsed) {
        parsed = retry.parsed;
        usedModel = retry.usedModel || usedModel;
        lastError = retry.lastError;
      }
    }

    if (parsed && invoiceType === 'company_document') {
      parsed = normalizeCompanyDocumentExtraction(parsed, sourceName);
    }

    if (!parsed) {
      const cause = lastError?.cause?.code || lastError?.cause?.message || '';
      const networkHint = isNetworkError(lastError)
        ? ' Cannot reach Google Gemini. Check internet, VPN, or firewall (generativelanguage.googleapis.com).'
        : '';
      log.error('Gemini extraction failed for all models', {
        fileName: outFileName,
        message: lastError?.message,
        cause,
      });
      return {
        success: false,
        message: (lastError?.message || 'Gemini extraction failed for all models.') + networkHint,
        fileName: outFileName,
        trackId: log.trackId,
      };
    }

    const qrResult = await qrPromise;
    let row =
      invoiceType === 'company_document'
        ? { ...parsed, fileName: outFileName, decidedType: 'company_document', _source_fields: {} }
        : invoiceType === 'purchase'
        ? mapPurchaseFromOcr(parsed, outFileName, financialYear)
        : mapSaleFromOcr(parsed, outFileName, sNo);

    const cpy = row.extraction?.copyType;
    if (cpy && (cpy.includes('duplicate') || cpy.includes('triplicate'))) {
      log.warn('Skipping duplicate/triplicate invoice', { fileName: outFileName, copyType: cpy });
      return {
        success: false,
        skipped: true,
        message: `Skipped ${cpy} copy. Only original is allowed.`,
        fileName: outFileName,
        trackId: log.trackId,
      };
    }

    // Ensure filename fields point at page-specific name
    if (invoiceType === 'purchase') {
      row.invoice_filename = outFileName;
    } else {
      row.invoice_file_name = outFileName;
    }
    row._page = {
      pageNumber: pageNo,
      pageCount: resolvedPageCount,
      sourceFileName: sourceName,
      sourceFilePath: filePath,
      displayName: displayName || outFileName,
    };

    const qrData = qrResult?.success ? qrResult.data || null : null;
    if (qrData) {
      row = applyQrPriority(row, qrData, invoiceType);
      if (invoiceType === 'purchase') row.invoice_filename = outFileName;
      else row.invoice_file_name = outFileName;
      log.info('QR priority merge applied', {
        fileName: outFileName,
        pageNo,
      });
    } else if (qrResult && !qrResult.success) {
      log.warn('QR scan empty', { fileName: outFileName, message: qrResult.message });
    }

    // Always expose both parties for company-profile routing (purchase vs sale)
    const sellerGst = String(
      row._qr?.SellerGstin ||
        qrData?.SellerGstin ||
        qrData?.sellerGstin ||
        row.seller_gst ||
        row.supplier_gst_number ||
        row.vendor_gstin ||
        ''
    )
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const buyerGst = String(
      row._qr?.BuyerGstin ||
        qrData?.BuyerGstin ||
        qrData?.buyerGstin ||
        row.buyer_gst ||
        row.customer_gstin ||
        ''
    )
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    row.seller_gst = sellerGst || row.seller_gst || '';
    row.buyer_gst = buyerGst || row.buyer_gst || '';

    if (invoiceType === 'purchase') {
      const hasSupplierGst = Boolean(
        row.supplier_gst_number || row.vendor_gstin || row.seller_gst,
      );
      if (!hasSupplierGst && isPdf) {
        const pdfText = await extractPdfTextForGstFallback(filePath);
        row = fillMissingSupplierGst(row, pdfText, parsed);
        if (row.supplier_gst_number) {
          row.seller_gst = row.supplier_gst_number;
          log.info('Seller GST inferred from PDF text', {
            fileName: outFileName,
            gst: row.supplier_gst_number,
          });
        }
      }
    }

    row.seller_name =
      row.seller_name ||
      String(qrData?.SellerNm || qrData?.SellerName || '').trim() ||
      row.supplier_name ||
      row.vendor_name ||
      '';
    row.buyer_name =
      row.buyer_name ||
      String(qrData?.BuyerNm || qrData?.BuyerName || '').trim() ||
      row.entity_name ||
      row.customer_name ||
      '';

    if (invoiceType === 'purchase') {
      row = normalizePurchasePartyFields(row);
    }

    // Counterparty GST/PIBO verify runs after company routing in DocUpload (with companyId + supplier_master cache).

    for (const key of Object.keys(row)) {
      if (key.startsWith('_')) continue;
      if (!row._source_fields[key] && row[key] != null && row[key] !== '') {
        row._source_fields[key] = 'ocr';
      }
    }

    return {
      success: true,
      data: row,
      fileName: outFileName,
      displayName: displayName || outFileName,
      pageNumber: pageNo,
      pageCount: resolvedPageCount,
      trackId: log.trackId,
      qr: qrResult?.success
        ? {
            data: qrData,
            payload: qrResult.payload,
            json: qrResult.parsed?.json ?? null,
            meta: qrResult.meta,
            priorityApplied: Boolean(qrData),
          }
        : { success: false, message: qrResult?.message },
      meta: {
        model: usedModel,
        qrUsed: Boolean(qrData),
        trackId: log.trackId,
        pageNumber: pageNo,
        pageCount: resolvedPageCount,
      },
      fileHash,
    };
  } finally {
    safeUnlink(tempPng);
  }
}
export function registerOcrHandlers() {
  loadEnvFile();
  ipcMain.handle('ocr:select-files', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'zip'] },
        { name: 'ZIP archive', extensions: ['zip'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths || [];
  });
  ipcMain.handle('ocr:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select folder with invoice documents',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return [];
    return [result.filePaths[0]];
  });

  /**
   * Single picker for uploads. Paths are returned raw — resolve-uploads
   * detects file vs folder vs ZIP vs unsupported.
   * Note: Windows/Linux dialogs cannot mix file+folder; folders also work via drag-drop.
   */
  ipcMain.handle('ocr:select-uploads', async () => {
    const properties =
      process.platform === 'darwin'
        ? ['openFile', 'openDirectory', 'multiSelections']
        : ['openFile', 'multiSelections'];
    const result = await dialog.showOpenDialog({
      title: 'Select invoices, ZIP, or folder',
      properties,
      filters: [
        { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'zip'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths || [];
  });

  /** Expand ZIPs, skip RAR/unsupported; return document paths for the queue. */
  ipcMain.handle('ocr:resolve-uploads', async (_, filePaths) => {
    try {
      return await resolveUploadPaths(Array.isArray(filePaths) ? filePaths : []);
    } catch (err) {
      return {
        files: [],
        skipped: [{ name: 'uploads', reason: err?.message || 'Failed to resolve uploads' }],
        tempRoots: [],
        zipSummaries: [],
      };
    }
  });

  /** Count pages per file — UI shows total pages (not just file count). */
  ipcMain.handle('ocr:inspect-paths', async (_, filePaths) => {
    try {
      const paths = Array.isArray(filePaths) ? filePaths : [];
      const expanded = await expandFilesToPageJobs(paths);
      return {
        success: true,
        fileCount: expanded.fileCount,
        totalPages: expanded.totalPages,
        files: expanded.files.map((f) => ({
          path: f.filePath,
          name: f.name,
          pageCount: f.pageCount,
        })),
        jobs: expanded.jobs.map((j) => ({
          displayName: j.displayName,
          invoiceFileName: j.invoiceFileName,
          pageNumber: j.pageNumber,
          pageCount: j.pageCount,
          sourceFileName: j.sourceFileName,
          filePath: j.filePath,
        })),
      };
    } catch (err) {
      return {
        success: false,
        message: err?.message || 'Failed to inspect PDF pages',
        fileCount: 0,
        totalPages: 0,
        files: [],
        jobs: [],
      };
    }
  });

  ipcMain.handle('ocr:extract', async (_, payload) => {
    try {
      return await extractOneInvoice(payload || {});
    } catch (err) {
      console.error('ocr:extract error', err);
      return { success: false, message: err?.message || 'Extraction failed' };
    }
  });
  /**
   * Multi-invoice queue: duplicate skip + progress + trackId logging.
   * payload: { filePaths: string[], type, financialYear, trackId? }
   */
  ipcMain.handle('ocr:extract-batch', async (event, payload) => {
    const filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths : [];
    const type = payload?.type === 'company_document' ? 'company_document' : payload?.type === 'sale' ? 'sale' : 'purchase';
    const companyDocType = payload?.companyDocType || null;
    const financialYear = payload?.financialYear || 'all';
    const trackId = payload?.trackId || createTrackId('batch');

    const send = (msg) => {
      try {
        event.sender.send('ocr:progress', msg);
      } catch {
        /* window closed */
      }
    };

    try {
      beginEntityVerifyBatch();
      return await runExtractQueue({
        filePaths,
        type,
        companyDocType,
        financialYear,
        trackId,
        onProgress: send,
        extractFn: (args) => extractOneInvoice({ ...args, companyDocType }),
      });
    } catch (err) {
      const log = createLogger(trackId);
      log.error('Batch queue crashed', { message: err?.message });
      send({
        trackId,
        stage: 'complete',
        total: 0,
        processed: 0,
        current: 0,
        successCount: 0,
        failedCount: 1,
        skippedCount: 0,
        message: err?.message || 'Batch failed',
        currentFile: '',
      });
      return {
        success: false,
        trackId,
        message: err?.message || 'Batch failed',
        results: [],
        successCount: 0,
        failedCount: 1,
        skippedCount: 0,
        total: 0,
      };
    } finally {
      endEntityVerifyBatch();
    }
  });
}
