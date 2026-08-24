import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ensurePdfUnderMaxSize } from '../utils/pdfCompressor.js';

const MARGIN = 50;
const LINE_HEIGHT = 14;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

function wrapText(text, maxChars = 90) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

async function drawLines(page, font, lines, startY, size = 10) {
  let y = startY;
  for (const line of lines) {
    if (y < MARGIN) break;
    page.drawText(line, { x: MARGIN, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    y -= LINE_HEIGHT;
  }
  return y;
}

export async function generateImporter3aPdf({
  companyName = 'Importer',
  importer3a = {},
  destDir,
} = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  page.drawText('Section 3a — Products Produced/Marketed (Importer)', {
    x: MARGIN,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0, 0.35, 0.4),
  });
  y -= 24;

  page.drawText(`Company: ${companyName}`, { x: MARGIN, y, size: 11, font });
  y -= LINE_HEIGHT;
  page.drawText(`Reporting FYs: ${(importer3a.reportingYears || []).join(', ')}`, {
    x: MARGIN,
    y,
    size: 10,
    font,
  });
  y -= LINE_HEIGHT;
  page.drawText(`Status: ${String(importer3a.status || 'draft').toUpperCase()}`, {
    x: MARGIN,
    y,
    size: 10,
    font,
  });
  y -= 24;

  if (importer3a.status === 'nil' || !(importer3a.detailRows || []).length) {
    const nilText = [
      'NIL DECLARATION',
      '',
      'No imported products were sold/marketed in India during the reporting financial year(s).',
      'Imported products that were not sold in the Indian market are excluded from this section.',
    ];
    y = await drawLines(page, font, nilText, y, 11);
  } else {
    page.drawText('Summary (Packaging MT — Tonnes)', { x: MARGIN, y, size: 11, font: fontBold });
    y -= 18;
    for (const fy of importer3a.reportingYears || []) {
      const row = importer3a.summaryByFy?.[fy] || {};
      page.drawText(
        `${fy}: Cat-I=${row.cat1 || '0'} | Cat-II=${row.cat2 || '0'} | Cat-III=${row.cat3 || '0'} | Cat-IV=${row.cat4 || '0'} MT`,
        { x: MARGIN, y, size: 9, font },
      );
      y -= LINE_HEIGHT;
    }
    y -= 12;

    page.drawText('Detail', { x: MARGIN, y, size: 11, font: fontBold });
    y -= 16;

    let currentPage = page;
    for (const row of importer3a.detailRows || []) {
      const block = [
        `FY: ${row.financialYear} | ${row.plasticCategory} | MT: ${row.packagingMt}`,
        `Product: ${row.productDescription}`,
        `HSN: ${row.hsn || '—'} | Sold Qty: ${row.productQtySold} ${row.unit || ''}`,
        `Sale Inv: ${row.saleInvoiceRef || '—'} | Purchase Inv: ${(row.purchaseInvoiceRefs || []).join(', ') || '—'}`,
      ];
      for (const line of block) {
        if (y < MARGIN + 40) {
          currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - MARGIN;
        }
        for (const wrapped of wrapText(line, 95)) {
          currentPage.drawText(wrapped, { x: MARGIN, y, size: 8, font, color: rgb(0.15, 0.15, 0.15) });
          y -= 11;
        }
      }
      y -= 6;
    }
  }

  const rawBytes = await pdfDoc.save();
  if (!destDir) {
    throw new Error('destDir is required');
  }
  fs.mkdirSync(destDir, { recursive: true });
  const fileName = `importer_3a_${Date.now()}.pdf`;
  const destPath = path.join(destDir, fileName);
  fs.writeFileSync(destPath, rawBytes);

  const compressed = await ensurePdfUnderMaxSize(destPath);
  return {
    success: true,
    filePath: compressed.filePath || destPath,
    compressed: compressed.compressed || false,
  };
}

export async function generateImporter3bPdf({
  companyName = 'Importer',
  images = [],
  destDir,
} = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const titlePage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  titlePage.drawText('Section 3b — Representative Plastic Packaging (Importer)', {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN,
    size: 14,
    font: fontBold,
    color: rgb(0, 0.35, 0.4),
  });
  titlePage.drawText(`Company: ${companyName}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 22,
    size: 11,
    font,
  });
  titlePage.drawText(`${images.length} image(s) covering EPR categories`, {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 38,
    size: 10,
    font,
  });

  for (const img of images) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const label = `${img.category || 'Uncategorized'}${img.label ? ` — ${img.label}` : ''}`;
    page.drawText(label, { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: 12, font: fontBold });

    const filePath = img.filePath;
    if (!filePath || !fs.existsSync(filePath)) {
      page.drawText('(Image file not found)', { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 30, size: 10, font });
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const bytes = fs.readFileSync(filePath);
    try {
      let embedded;
      if (ext === '.png') {
        embedded = await pdfDoc.embedPng(bytes);
      } else if (ext === '.jpg' || ext === '.jpeg') {
        embedded = await pdfDoc.embedJpg(bytes);
      } else if (ext === '.pdf') {
        page.drawText('(PDF attachment — see separate file)', {
          x: MARGIN,
          y: PAGE_HEIGHT - MARGIN - 30,
          size: 10,
          font,
        });
        continue;
      } else {
        page.drawText(`(Unsupported format: ${ext})`, {
          x: MARGIN,
          y: PAGE_HEIGHT - MARGIN - 30,
          size: 10,
          font,
        });
        continue;
      }

      const maxW = PAGE_WIDTH - MARGIN * 2;
      const maxH = PAGE_HEIGHT - MARGIN * 2 - 40;
      const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      page.drawImage(embedded, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN - 30 - h,
        width: w,
        height: h,
      });
    } catch (err) {
      page.drawText(`(Could not embed image: ${err.message})`, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN - 30,
        size: 9,
        font,
      });
    }
  }

  if (!destDir) throw new Error('destDir is required');
  fs.mkdirSync(destDir, { recursive: true });
  const fileName = `importer_3b_${Date.now()}.pdf`;
  const destPath = path.join(destDir, fileName);
  const rawBytes = await pdfDoc.save();
  fs.writeFileSync(destPath, rawBytes);
  const compressed = await ensurePdfUnderMaxSize(destPath);
  return {
    success: true,
    filePath: compressed.filePath || destPath,
    compressed: compressed.compressed || false,
  };
}
