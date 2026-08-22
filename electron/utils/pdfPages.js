/**
 * PDF page helpers for multi-invoice (1 page = 1 invoice job).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

function isPdf(filePath) {
  return path.extname(filePath || '').toLowerCase() === '.pdf';
}

export async function getPdfPageCount(filePath) {
  if (!isPdf(filePath)) return 1;
  try {
    const buffer = await fs.promises.readFile(filePath);
    const data = new Uint8Array(buffer);
    const pdf = await getDocument({ data, useSystemFonts: true }).promise;
    const n = Number(pdf.numPages) || 1;
    try {
      await pdf.destroy?.();
    } catch {
      /* ignore */
    }
    return Math.max(1, n);
  } catch (err) {
    console.error('Error counting PDF pages:', err);
    return 1;
  }
}

/**
 * Render one PDF page to PNG buffer.
 */
export async function renderPdfPageToPng(filePath, pageNumber = 1, scale = 2.2) {
  const buffer = await fs.promises.readFile(filePath);
  const data = new Uint8Array(buffer);
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const total = Number(pdf.numPages) || 1;
  const pageNo = Math.min(Math.max(1, Number(pageNumber) || 1), total);
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const buf = canvas.toBuffer('image/png');
  try {
    await pdf.destroy?.();
  } catch {
    /* ignore */
  }
  return buf;
}

export function pageInvoiceFileName(originalName, pageNumber, pageCount) {
  const base = path.basename(originalName || 'invoice.pdf');
  if (!pageCount || pageCount <= 1) return base;
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const pad = String(pageNumber).padStart(2, '0');
  // Keep .pdf suffix so EPR "invoice filename" stays pdf-like
  return `${stem}_p${pad}${ext || '.pdf'}`;
}

export function pageDisplayName(originalName, pageNumber, pageCount) {
  const base = path.basename(originalName || 'file');
  if (!pageCount || pageCount <= 1) return base;
  return `${base} · page ${pageNumber}/${pageCount}`;
}

/**
 * Expand selected files into per-page extract jobs.
 * 10-page PDF + 1-page PDF => 11 jobs.
 */
export async function expandFilesToPageJobs(filePaths = [], { type = '' } = {}) {
  const jobs = [];
  const files = [];
  let totalPages = 0;

  for (const filePath of filePaths) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    const name = path.basename(filePath);
    let pageCount = 1;
    try {
      pageCount = await getPdfPageCount(filePath);
    } catch {
      pageCount = 1;
    }
    totalPages += pageCount;
    files.push({ filePath, name, pageCount });

    if (type === 'company_document') {
      jobs.push({
        filePath,
        sourceFileName: name,
        pageNumber: 1, // Treat as whole document
        pageCount,
        invoiceFileName: name, // Keep original filename
        displayName: name,
        jobKey: name.toLowerCase(),
        isWholeFile: true,
      });
    } else {
      for (let page = 1; page <= pageCount; page += 1) {
        const invoiceFileName = pageInvoiceFileName(name, page, pageCount);
        jobs.push({
          filePath,
          sourceFileName: name,
          pageNumber: page,
          pageCount,
          invoiceFileName,
          displayName: pageDisplayName(name, page, pageCount),
          jobKey: `${name.toLowerCase()}::p${page}`,
        });
      }
    }
    
    // Yield to event loop so UI does not hang while counting pages
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  return { jobs, files, totalPages, fileCount: files.length };
}

/**
 * Write PNG to a temp file for QR scanners that need a path.
 */
export function writeTempPng(buffer, tag = 'page') {
  const dir = path.join(os.tmpdir(), 'pwp-ocr-pages');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  fs.writeFileSync(file, buffer);
  return file;
}

export function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}