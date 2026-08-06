import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scanQrFromDocument } from './qrScan.js';
import { getFileSha256 } from './hashUtils.js';
import { getDb, saveDb } from './database.js';
import {
  buildExtractionPrompt,
  mapPurchaseFromOcr,
  mapSaleFromOcr,
  applyQrPriority,
  fileBaseName,
} from './ocrExtract.js';
import { createLogger, createTrackId } from './logger.js';
import { runExtractQueue } from './extractQueue.js';
import {
  getPdfPageCount,
  expandFilesToPageJobs,
  renderPdfPageToPng,
  writeTempPng,
  safeUnlink,
  pageInvoiceFileName,
} from './pdfPages.js';
import { resolveUploadPaths } from './zipExpand.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function loadEnvFile() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
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
}) {
  loadEnvFile();
  const log = parentLog || createLogger(trackId || createTrackId('ocr'));
  const apiKeys = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GEMINI_API_KEY') && v) {
      apiKeys.push(v.trim());
    }
  }
  if (!apiKeys.length) {
    log.error('GEMINI_API_KEY missing');
    return {
      success: false,
      message:
        'GEMINI_API_KEY not found. Add it to project root .env file and restart the app.',
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
    // Multi-page PDF: render ONE page → PNG for Gemini + QR (1 page = 1 invoice)
    if (isPdf) {
      log.info('Rendering PDF page for extract', {
        sourceName,
        pageNo,
        pageCount: resolvedPageCount,
      });
      const pngBuf = await renderPdfPageToPng(filePath, pageNo, 2.2);
      base64 = pngBuf.toString('base64');
      mimeType = 'image/png';
      tempPng = writeTempPng(pngBuf, `p${pageNo}`);
      qrTargetPath = tempPng;
    } else {
      if (mimeType === 'application/octet-stream') {
        return { success: false, message: 'Unsupported file type.', trackId: log.trackId };
      }
      base64 = fs.readFileSync(filePath).toString('base64');
    }

    const invoiceType = type === 'sale' ? 'sale' : 'purchase';
    const qrPromise = scanQrFromDocument(qrTargetPath);

    const genAI = new GoogleGenerativeAI(apiKey);
    const envModel = process.env.GEMINI_MODEL?.trim();
    const envCandidates = (process.env.GEMINI_MODEL_CANDIDATES || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const defaultModels = [
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemini-2.0-flash',
    ];
    const modelNames = [
      ...new Set([...(envModel ? [envModel] : []), ...envCandidates, ...defaultModels]),
    ];
    const prompt = buildExtractionPrompt(invoiceType, financialYear);
    let parsed = null;
    let lastError = null;
    let usedModel = null;

    for (const modelName of modelNames) {
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
        parsed = JSON.parse(text);
        usedModel = modelName;
        break;
      } catch (err) {
        lastError = err;
        log.warn('Gemini model failed', { modelName, message: err?.message });
      }
    }

    if (!parsed) {
      log.error('Gemini extraction failed for all models', {
        fileName: outFileName,
        message: lastError?.message,
      });
      return {
        success: false,
        message: lastError?.message || 'Gemini extraction failed for all models.',
        fileName: outFileName,
        trackId: log.trackId,
      };
    }

    const qrResult = await qrPromise;
    let row =
      invoiceType === 'purchase'
        ? mapPurchaseFromOcr(parsed, outFileName)
        : mapSaleFromOcr(parsed, outFileName, sNo);

    const cpy = row.extraction?.copyType;
    if (cpy && (cpy.includes('duplicate') || cpy.includes('triplicate'))) {
      log.warn('Skipping duplicate/triplicate invoice', { fileName: outFileName, copyType: cpy });
      return {
        success: false,
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

    for (const key of Object.keys(row)) {
      if (key.startsWith('_')) continue;
      if (!row._source_fields[key] && row[key] !== '' && row[key] !== 0) {
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
      title: 'Select invoice documents',
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
    const type = payload?.type === 'sale' ? 'sale' : 'purchase';
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
      return await runExtractQueue({
        filePaths,
        type,
        financialYear,
        trackId,
        onProgress: send,
        extractFn: (args) => extractOneInvoice(args),
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
    }
  });
}
