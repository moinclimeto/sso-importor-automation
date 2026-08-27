import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { scanQrFromDocument } from './ocr_captcha/qrScan.js';
import {
  dedupeParties,
  extractGstNumbersFromText,
  extractPanNumbersFromText,
  normalizeGstin,
  panFromGstin,
  resolveSellerGstFromInvoiceText,
} from './gstPartyUtils.js';
import { verifyGstComplete } from './gstVerifyService.js';

async function extractTextFromPdfPage(filePath, pageNumber = 1) {
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await getDocument({ data, useSystemFonts: true }).promise;
    const pageNo = Math.min(Math.max(1, pageNumber), doc.numPages);
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    return content.items.map((item) => item.str).join(' ');
  } catch {
    return '';
  }
}

async function extractTextFromPdfFirstPage(filePath) {
  return extractTextFromPdfPage(filePath, 1);
}

/** First + last page text — footer seller GST often appears on the last page. */
export async function extractPdfTextForGstFallback(filePath) {
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await getDocument({ data, useSystemFonts: true }).promise;
    const pages = doc.numPages > 1 ? [1, doc.numPages] : [1];
    const chunks = [];
    for (const pageNo of pages) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      chunks.push(content.items.map((item) => item.str).join(' '));
    }
    return chunks.join('\n');
  } catch {
    return extractTextFromPdfFirstPage(filePath);
  }
}

function partyFromQr(qrData = {}) {
  const parties = [];
  const sellerGst = normalizeGstin(qrData.SellerGstin || qrData.sellerGstin);
  const buyerGst = normalizeGstin(qrData.BuyerGstin || qrData.buyerGstin);
  if (sellerGst) {
    parties.push({
      role: 'seller',
      gst: sellerGst,
      name: String(qrData.SellerNm || qrData.SellerName || '').trim(),
      pan: panFromGstin(sellerGst),
      source: 'qr',
    });
  }
  if (buyerGst) {
    parties.push({
      role: 'buyer',
      gst: buyerGst,
      name: String(qrData.BuyerNm || qrData.BuyerName || '').trim(),
      pan: panFromGstin(buyerGst),
      source: 'qr',
    });
  }
  return parties;
}

function partiesFromText(text, buyerGstHint = '') {
  const footerSeller = resolveSellerGstFromInvoiceText(text, { buyerGst: buyerGstHint });
  const gsts = extractGstNumbersFromText(text);
  const ordered = footerSeller
    ? [footerSeller, ...gsts.filter((g) => g !== footerSeller)]
    : gsts;
  const pans = extractPanNumbersFromText(text);
  return ordered.map((gst, idx) => ({
    role: idx === 0 ? 'seller' : 'buyer',
    gst,
    name: '',
    pan: panFromGstin(gst) || pans[idx] || '',
    source: idx === 0 && footerSeller ? 'footer' : 'text',
  }));
}

export async function probeInvoicePartiesFromFile(filePath) {
  const fileName = path.basename(filePath);
  if (!filePath || !fs.existsSync(filePath)) {
    return { fileName, filePath, success: false, error: 'File not found', parties: [] };
  }

  let parties = [];
  const qrResult = await scanQrFromDocument(filePath);
  if (qrResult?.success && qrResult.data) {
    parties = partyFromQr(qrResult.data);
  }

  if (!parties.length) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      const text = await extractTextFromPdfFirstPage(filePath);
      parties = partiesFromText(text);
    }
  }

  parties = dedupeParties(parties);
  return {
    fileName,
    filePath,
    success: true,
    qrFound: Boolean(qrResult?.success),
    parties,
  };
}

export async function probeInvoicePartiesFromFiles(db, filePaths = []) {
  const paths = Array.isArray(filePaths) ? filePaths : [];
  const files = [];
  for (const filePath of paths) {
    files.push(await probeInvoicePartiesFromFile(filePath));
  }

  const gstSet = new Set();
  for (const file of files) {
    for (const party of file.parties || []) {
      if (party.gst) gstSet.add(party.gst);
    }
  }

  const verifiedByGst = {};
  for (const gst of gstSet) {
    verifiedByGst[gst] = await verifyGstComplete(db, gst);
  }

  const enrichedFiles = files.map((file) => ({
    ...file,
    parties: (file.parties || []).map((party) => ({
      ...party,
      verified: verifiedByGst[party.gst] || null,
    })),
  }));

  return {
    success: true,
    files: enrichedFiles,
    verifiedByGst,
    totalFiles: paths.length,
    sampleFileName: enrichedFiles[0]?.fileName || null,
  };
}

/** Probe only the first invoice — used before bulk extraction to identify user's company. */
export async function probeFirstInvoiceForCompanySetup(db, filePaths = []) {
  const firstPath = (Array.isArray(filePaths) ? filePaths : []).find(Boolean);
  if (!firstPath) {
    return { success: true, files: [], verifiedByGst: {}, totalFiles: 0, sampleFileName: null };
  }
  const result = await probeInvoicePartiesFromFiles(db, [firstPath]);
  return {
    ...result,
    totalFiles: filePaths.length,
  };
}

export async function verifyGstForCompanyProfile(db, gst) {
  return verifyGstComplete(db, gst);
}
