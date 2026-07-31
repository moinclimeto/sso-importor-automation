import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY missing');
  process.exit(1);
}

const imagePath = process.argv[2] || 'debug-embed-full.png';
const b64 = fs.readFileSync(imagePath).toString('base64');
const models = [
  process.env.GEMINI_MODEL,
  ...(process.env.GEMINI_MODEL_CANDIDATES || '').split(',').map((s) => s.trim()),
  'gemini-flash-latest',
  'gemini-2.0-flash',
].filter(Boolean);

const prompt = `Read this Indian GST TAX INVOICE image.
Extract e-invoice QR / IRN related data.
Return ONLY JSON:
{
  "DocNo": "",
  "DocDt": "DD/MM/YYYY",
  "TotInvVal": 0,
  "SellerGstin": "",
  "BuyerGstin": "",
  "Irn": "64-char hex from QR or printed IRN",
  "printedIrn": "IRN printed next to QR",
  "EwbNo": "",
  "raw": null
}
Read printed IRN text carefully. Read invoice number and grand total from the page.`;

const genAI = new GoogleGenerativeAI(key);
let lastErr = null;
for (const modelName of [...new Set(models)]) {
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    });
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: 'image/png', data: b64 } },
    ]);
    console.log('MODEL', modelName);
    console.log(result.response.text());
    process.exit(0);
  } catch (err) {
    lastErr = err;
    console.warn('fail', modelName, err?.message);
  }
}
console.error(lastErr?.message || 'all models failed');
process.exit(1);
