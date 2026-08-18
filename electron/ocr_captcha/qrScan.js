/**
 * Local QR scan for PWP Doc Processor.
 * Uses climeto-backend/Qr-scanner-main style pipeline:
 *   PDF → high-DPI page image → ZBar/pyzbar → JWT/JSON parse
 *
 * Order (no Gemini / no cloud API):
 *   1) Docker image `pwp-qr-scanner` (Python + Poppler + pyzbar)
 *   2) Host Python script (if installed)
 *   3) Pure Node ZBar fallback
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import {
  getDefaultScanner,
  scanGrayBuffer,
  ZBarConfigType,
  ZBarSymbolType,
} from '@undecaf/zbar-wasm';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_QR_SCRIPT = path.join(__dirname, '../scripts/qr_scanner/qr.py');
const DOCKER_IMAGE = process.env.QR_DOCKER_IMAGE || 'pwp-qr-scanner:latest';

function loadEnvFile() {
  for (const file of [path.join(process.cwd(), '.env'), path.join(__dirname, '../.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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
  return null;
}

function tryParseNestedJson(value) {
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!s) return value;
  if (
    !(
      (s.startsWith('{') && s.endsWith('}')) ||
      (s.startsWith('[') && s.endsWith(']'))
    )
  ) {
    return value;
  }
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

function normalizeParsedPayload(parsed) {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'data' in parsed) {
    parsed.data = tryParseNestedJson(parsed.data);
  }
  return parsed;
}

/** Pull invoice fields from JWT ({iss,data}) or flat OCR fallback JSON. */
export function extractQrData(parsedOrJson) {
  const json =
    parsedOrJson && typeof parsedOrJson === 'object' && 'json' in parsedOrJson
      ? parsedOrJson.json
      : parsedOrJson;
  if (!json || typeof json !== 'object') return null;
  if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
    return json.data;
  }
  return json;
}

/** Same parsing rules as Qr-scanner-main/qr.py */
export function parseQrPayload(raw) {
  if (!raw || typeof raw !== 'string') {
    return { raw, json: null, is_url: false, is_json: false, qr_type: 'unknown' };
  }

  const data = raw.trim();
  const out = {
    raw: data,
    json: null,
    is_url: data.startsWith('http://') || data.startsWith('https://'),
    is_json: false,
    qr_type: 'unknown',
  };

  let parsed = null;
  try {
    parsed = normalizeParsedPayload(JSON.parse(data));
    out.json = parsed;
    out.is_json = true;
  } catch {
    if (data.split('.').length >= 3) {
      try {
        const payload = data.split('.')[1];
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        const decoded = Buffer.from(
          padded.replace(/-/g, '+').replace(/_/g, '/'),
          'base64'
        ).toString('utf8');
        parsed = normalizeParsedPayload(JSON.parse(decoded));
        out.json = parsed;
        out.is_json = true;
      } catch {
        parsed = null;
      }
    }
  }

  try {
    let qrType = 'unknown';
    if (parsed && typeof parsed === 'object') {
      const payloadData = parsed.data;
      if (payloadData && typeof payloadData === 'object') {
        const docTyp = String(payloadData.DocTyp || '').toUpperCase();
        if (docTyp === 'INV' && payloadData.Irn) qrType = 'einvoice';
      }
      if (
        qrType === 'unknown' &&
        (parsed.Irn || parsed.DocNo || parsed.SellerGstin)
      ) {
        qrType = 'einvoice';
      }
    }
    const lower = data.toLowerCase();
    if (
      qrType === 'unknown' &&
      (lower.includes('ewb no') ||
        lower.includes('e-way bill') ||
        lower.includes('eway bill'))
    ) {
      qrType = 'eway_bill';
    }
    out.qr_type = qrType;
  } catch {
    /* keep unknown */
  }

  return out;
}

let zbarScannerPromise;
let dockerAvailableCache = null;

async function getZbarScanner() {
  if (!zbarScannerPromise) {
    zbarScannerPromise = (async () => {
      const scanner = await getDefaultScanner();
      scanner.setConfig(ZBarSymbolType.ZBAR_QRCODE, ZBarConfigType.ZBAR_CFG_ENABLE, 1);
      scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_TEST_INVERTED, 1);
      return scanner;
    })();
  }
  return zbarScannerPromise;
}

async function isDockerAvailable() {
  if (dockerAvailableCache !== null) return dockerAvailableCache;
  try {
    await execFileAsync('docker', ['info'], { timeout: 8000, windowsHide: true });
    dockerAvailableCache = true;
  } catch {
    dockerAvailableCache = false;
  }
  return dockerAvailableCache;
}

async function isDockerImagePresent() {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['image', 'inspect', DOCKER_IMAGE],
      { timeout: 8000, windowsHide: true }
    );
    return Boolean(stdout && stdout.trim());
  } catch {
    return false;
  }
}

/** Windows path → Docker Desktop mount-friendly path */
function toDockerHostPath(absPath) {
  const resolved = path.resolve(absPath);
  if (process.platform === 'win32') {
    return resolved.replace(/\\/g, '/');
  }
  return resolved;
}

function runSpawnCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: options.env || process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, reason: 'timeout', stdout, stderr });
    }, options.timeoutMs || Number(process.env.QR_SCAN_TIMEOUT_MS || 90000));

    child.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        reason: err?.code || err?.message || 'spawn-error',
        stdout,
        stderr,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          ok: false,
          reason: stderr.trim() || `exit-${code}`,
          stdout,
          stderr,
        });
        return;
      }
      try {
        resolve({ ok: true, result: JSON.parse(stdout), stdout, stderr });
      } catch (err) {
        resolve({
          ok: false,
          reason: err?.message || 'json-parse-error',
          stdout,
          stderr,
        });
      }
    });
  });
}

/**
 * Run reference Python QR scanner inside Docker.
 * Mounts the PDF's parent folder read-only at /input.
 */
async function runDockerQrScanner(filePath) {
  loadEnvFile();
  const mode = String(process.env.QR_SCAN_MODE || 'auto').toLowerCase();
  if (mode === 'node' || mode === 'python') {
    return { ok: false, reason: `mode=${mode}` };
  }

  const dockerOk = await isDockerAvailable();
  if (!dockerOk) return { ok: false, reason: 'docker-unavailable' };

  const imageOk = await isDockerImagePresent();
  if (!imageOk) {
    return {
      ok: false,
      reason: `docker-image-missing (${DOCKER_IMAGE}). Run: npm run qr:docker:build`,
    };
  }

  const abs = path.resolve(filePath);
  const hostDir = toDockerHostPath(path.dirname(abs));
  const baseName = path.basename(abs);
  const containerPdf = `/input/${baseName}`;

  const args = [
    'run',
    '--rm',
    '-v',
    `${hostDir}:/input:ro`,
    '-e',
    `QR_SCAN_DPI=${process.env.QR_SCAN_DPI || '200'}`,
    '-e',
    `QR_MAX_PAGES=${process.env.QR_MAX_PAGES || '1'}`,
    '-e',
    'POPPLER_PATH=/usr/bin',
    DOCKER_IMAGE,
    containerPdf,
  ];

  const run = await runSpawnCapture('docker', args, {
    timeoutMs: Number(process.env.QR_SCAN_TIMEOUT_MS || 120000),
  });

  if (!run.ok) return run;
  return { ok: true, result: run.result, via: 'docker' };
}

async function decodeGrayWithZbar(gray, width, height) {
  const scanner = await getZbarScanner();
  const symbols = await scanGrayBuffer(gray, width, height, scanner);
  if (!symbols.length) return null;
  return symbols[0].decode();
}

async function decodePngBufferLocal(pngBuffer) {
  const variants = [
    { width: 2000, sharpen: true },
    { width: 1600, sharpen: true },
    { width: 2400, sharpen: false },
  ];

  for (const v of variants) {
    let pipeline = sharp(pngBuffer)
      .resize({ width: v.width, withoutEnlargement: true })
      .greyscale()
      .normalize();
    if (v.sharpen) pipeline = pipeline.sharpen();
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const text = await decodeGrayWithZbar(new Uint8Array(data), info.width, info.height);
    if (text) {
      return { payload: text, decoder: 'zbar', source: `node-zbar@${v.width}` };
    }
  }
  return null;
}

async function getLargestEmbeddedPageImage(page) {
  const ops = await page.getOperatorList();
  let best = null;
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    if (
      ops.fnArray[i] !== OPS.paintImageXObject &&
      ops.fnArray[i] !== OPS.paintJpegXObject
    ) {
      continue;
    }
    const ref = ops.argsArray[i][0];
    try {
      const emb = await page.objs.get(ref);
      if (!emb?.width || !emb?.height || !emb?.data) continue;
      const area = emb.width * emb.height;
      if (!best || area > best.area) best = { emb, area };
    } catch {
      /* skip */
    }
  }
  return best?.emb || null;
}

async function renderPdfPagePng(filePath, scale = 4) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function pdfPageToPngLocal(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await pdf.getPage(1);
  const embedded = await getLargestEmbeddedPageImage(page);

  if (embedded && embedded.width * embedded.height > 400_000) {
    return sharp(Buffer.from(embedded.data), {
      raw: { width: embedded.width, height: embedded.height, channels: 3 },
    })
      .png()
      .toBuffer();
  }

  return renderPdfPagePng(filePath, 4.2);
}

function resolvePythonBin() {
  loadEnvFile();
  return (
    process.env.PYTHON_PATH ||
    process.env.PYTHON ||
    (process.platform === 'win32' ? 'python' : 'python3')
  );
}

function runPythonQrScanner(filePath) {
  loadEnvFile();
  const mode = String(process.env.QR_SCAN_MODE || 'auto').toLowerCase();
  if (mode === 'node' || mode === 'docker') {
    return Promise.resolve({ ok: false, reason: `mode=${mode}` });
  }
  if (!fs.existsSync(PYTHON_QR_SCRIPT)) {
    return Promise.resolve({ ok: false, reason: 'python-script-missing' });
  }

  const pythonBin = resolvePythonBin();
  const env = { ...process.env };
  if (process.env.POPPLER_PATH) env.POPPLER_PATH = process.env.POPPLER_PATH;
  if (process.env.QR_SCAN_DPI) env.QR_SCAN_DPI = process.env.QR_SCAN_DPI;

  return runSpawnCapture(pythonBin, [PYTHON_QR_SCRIPT, filePath], {
    env,
    timeoutMs: Number(process.env.QR_SCAN_TIMEOUT_MS || 90000),
  }).then((run) => {
    if (!run.ok) return run;
    return { ok: true, result: run.result, via: 'python' };
  });
}

function firstQrFromPythonResult(result, via = 'python') {
  if (!result?.success || !Array.isArray(result.pages)) return null;
  for (const page of result.pages) {
    const codes = page?.qr_codes || [];
    if (codes[0]?.raw_data) {
      const method = codes[0].decode_method || 'qr';
      return {
        payload: codes[0].raw_data,
        json: codes[0].parsed_data || null,
        qr_type: codes[0].qr_type || 'unknown',
        decoder: method === 'tesseract_printed_irn' ? 'tesseract' : 'pyzbar',
        source: `${via}:page-${page.page_number}${
          result.fallback ? `:${result.fallback}` : ''
        }`,
      };
    }
  }
  return null;
}

async function scanWithNodeLocal(filePath, mime) {
  let pngBuffer;
  if (mime === 'application/pdf') {
    pngBuffer = await pdfPageToPngLocal(filePath);
  } else {
    pngBuffer = fs.readFileSync(filePath);
  }

  if (process.versions?.electron) {
    try {
      const { scanQrWithBrowser } = await import('./qrScanBrowser.js');
      const payload = await scanQrWithBrowser(pngBuffer);
      if (payload) {
        return {
          payload,
          decoder: 'zbar-browser',
          source: 'electron-barcode-detector',
        };
      }
    } catch (err) {
      console.warn('Browser QR scan failed:', err?.message);
    }
  }

  return decodePngBufferLocal(pngBuffer);
}

/** Preload ZBar WASM */
export function warmupQrScanner() {
  return getZbarScanner();
}

export async function scanQrFromDocument(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, message: 'File not found.' };
  }

  const mime = mimeFromPath(filePath);
  if (!mime) {
    return { success: false, message: 'Unsupported file type for QR scan.' };
  }

  const started = Date.now();
  loadEnvFile();
  const mode = String(process.env.QR_SCAN_MODE || 'auto').toLowerCase();

  try {
    let hit = null;

    if (mime === 'application/pdf' && mode !== 'node') {
      if (mode === 'docker' || mode === 'auto') {
        const dock = await runDockerQrScanner(filePath);
        if (dock.ok) {
          hit = firstQrFromPythonResult(dock.result, 'docker');
          if (!hit && dock.result?.error) {
            console.warn('Docker QR scanner:', dock.result.error);
          }
        } else if (dock.reason && (mode === 'docker' || !String(dock.reason).includes('mode='))) {
          if (!String(dock.reason).includes('docker-unavailable')) {
            console.warn('Docker QR scanner:', dock.reason);
          }
        }
      }

      if (!hit && (mode === 'python' || mode === 'auto')) {
        const py = await runPythonQrScanner(filePath);
        if (py.ok) {
          hit = firstQrFromPythonResult(py.result, 'python');
          if (!hit && py.result?.error) {
            console.warn('Python QR scanner:', py.result.error);
          }
        } else if (py.reason && !String(py.reason).includes('ENOENT') && mode === 'python') {
          console.warn('Python QR scanner:', py.reason);
        }
      }
    }

    if (!hit) {
      hit = await scanWithNodeLocal(filePath, mime);
    }

    const ms = Date.now() - started;

    if (!hit?.payload) {
      return {
        success: false,
        message:
          'QR not found locally. Build Docker scanner (`npm run qr:docker:build`) or use a clear digital e-invoice PDF. No Gemini is used for QR.',
        meta: { durationMs: ms },
      };
    }

    const parsed = parseQrPayload(hit.payload);
    if (hit.json && !parsed.json) {
      parsed.json = hit.json;
    }
    const data = extractQrData(parsed) || extractQrData(hit.json);

    return {
      success: true,
      data,
      payload: hit.payload,
      parsed,
      meta: {
        decoder: hit.decoder,
        source: hit.source,
        qr_type: hit.qr_type || parsed.qr_type,
        durationMs: ms,
      },
    };
  } catch (err) {
    console.error('QR scan error:', err);
    return { success: false, message: err?.message || 'QR scan failed.' };
  }
}
