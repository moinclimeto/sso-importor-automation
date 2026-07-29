import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

function buildPrompt(type) {
  const isPurchase = type === 'purchase';
  return `You are an Indian GST invoice OCR extractor.
Read the attached invoice document and return ONLY valid JSON (no markdown).

Extract for a ${isPurchase ? 'PURCHASE (vendor)' : 'SALE (customer)'} invoice with these keys:
{
  "invoice_no": "",
  "invoice_date": "YYYY-MM-DD",
  "${isPurchase ? 'vendor_name' : 'customer_name'}": "",
  "${isPurchase ? 'vendor_gstin' : 'customer_gstin'}": "",
  "item_name": "",
  "hsn_code": "",
  "quantity": 0,
  "unit": "PCS",
  "rate": 0,
  "taxable_amount": 0,
  "cgst_rate": 0,
  "sgst_rate": 0,
  "igst_rate": 0,
  "cgst_amount": 0,
  "sgst_amount": 0,
  "igst_amount": 0,
  "total_amount": 0,
  "notes": ""
}

Rules:
- Use the first/main line item if multiple items exist.
- Convert dates to YYYY-MM-DD.
- Numbers must be numeric (not strings with currency symbols).
- If a field is missing, use empty string or 0.
- Prefer IGST when IGST is present; otherwise CGST+SGST.`;
}

function normalizeExtracted(raw, type) {
  const isPurchase = type === 'purchase';
  const num = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const cleaned = String(v).replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

  const partyName = isPurchase
    ? str(raw.vendor_name || raw.supplier_name || raw.seller_name)
    : str(raw.customer_name || raw.buyer_name || raw.bill_to_name);
  const partyGstin = isPurchase
    ? str(raw.vendor_gstin || raw.supplier_gstin || raw.seller_gstin)
    : str(raw.customer_gstin || raw.buyer_gstin);

  let invoiceDate = str(raw.invoice_date || raw.date);
  // Accept DD/MM/YYYY or DD-MM-YYYY
  const m = invoiceDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    invoiceDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  const data = {
    invoice_no: str(raw.invoice_no || raw.invoice_number),
    invoice_date: invoiceDate,
    item_name: str(raw.item_name || raw.description || raw.product_name),
    hsn_code: str(raw.hsn_code || raw.hsn),
    quantity: num(raw.quantity || raw.qty),
    unit: str(raw.unit) || 'PCS',
    rate: num(raw.rate || raw.unit_price),
    taxable_amount: num(raw.taxable_amount || raw.taxable),
    cgst_rate: num(raw.cgst_rate),
    sgst_rate: num(raw.sgst_rate),
    igst_rate: num(raw.igst_rate),
    cgst_amount: num(raw.cgst_amount),
    sgst_amount: num(raw.sgst_amount),
    igst_amount: num(raw.igst_amount),
    total_amount: num(raw.total_amount || raw.grand_total || raw.total),
    notes: str(raw.notes),
  };

  if (isPurchase) {
    data.vendor_name = partyName;
    data.vendor_gstin = partyGstin;
  } else {
    data.customer_name = partyName;
    data.customer_gstin = partyGstin;
  }

  // Derive taxable/total if missing
  if (!data.taxable_amount && data.quantity && data.rate) {
    data.taxable_amount = Number((data.quantity * data.rate).toFixed(2));
  }
  if (!data.total_amount) {
    data.total_amount = Number(
      (data.taxable_amount + data.cgst_amount + data.sgst_amount + data.igst_amount).toFixed(2)
    );
  }

  // stringify numeric fields for form inputs
  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'number') data[key] = String(data[key]);
  }

  return data;
}

export function registerOcrHandlers() {
  loadEnvFile();

  ipcMain.handle('ocr:select-files', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select invoice documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'zip'] },
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

    const folder = result.filePaths[0];
    const allowed = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
    const collected = [];

    const walk = (dir, depth = 0) => {
      if (depth > 3 || collected.length >= 200) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (allowed.has(ext)) collected.push(full);
        }
        if (collected.length >= 200) break;
      }
    };

    walk(folder);
    return collected;
  });

  ipcMain.handle('ocr:extract', async (_, { filePath, type }) => {
    try {
      loadEnvFile();
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          message:
            'GEMINI_API_KEY not found. Add it to project root .env file and restart the app.',
        };
      }
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, message: 'File not found.' };
      }

      const mimeType = mimeFromPath(filePath);
      if (mimeType === 'application/octet-stream') {
        return { success: false, message: 'Unsupported file type.' };
      }

      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const invoiceType = type === 'sale' ? 'sale' : 'purchase';

      const genAI = new GoogleGenerativeAI(apiKey);
      const envModel = process.env.GEMINI_MODEL?.trim();
      const envCandidates = (process.env.GEMINI_MODEL_CANDIDATES || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      const defaultModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
      const modelNames = [...new Set([
        ...(envModel ? [envModel] : []),
        ...envCandidates,
        ...defaultModels,
      ])];

      let parsed = null;
      let lastError = null;

      for (const modelName of modelNames) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });

          const result = await model.generateContent([
            { text: buildPrompt(invoiceType) },
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ]);

          const text = result.response.text().trim()
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

          parsed = JSON.parse(text);
          break;
        } catch (err) {
          lastError = err;
          console.warn(`Gemini model ${modelName} failed:`, err?.message);
        }
      }

      if (!parsed) {
        return {
          success: false,
          message: lastError?.message || 'Gemini extraction failed for all models.',
        };
      }

      return {
        success: true,
        data: normalizeExtracted(parsed, invoiceType),
      };
    } catch (err) {
      console.error('ocr:extract error', err);
      return { success: false, message: err?.message || 'Extraction failed' };
    }
  });
}
