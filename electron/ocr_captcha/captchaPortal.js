/**
 * CPCB portal CAPTCHA — OCR pipeline adapted from Downloads/Automation.
 * Google Vision + Sharp preprocess variants + Tesseract + Gemini fallback.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  mergeCaseWithHint,
  resolveGoogleVisionApiKey,
  runGoogleVisionCaptchaOcrBest,
} from './captchaGoogleVision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const candidates = [path.join(process.cwd(), '.env'), path.join(__dirname, '../.env')];
  for (const file of candidates) {
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

async function getArtifactsDir() {
  try {
    const { app } = await import('electron');
    return path.join(app.getPath('userData'), 'captcha-artifacts');
  } catch {
    return path.join(os.tmpdir(), 'pwp-captcha-artifacts');
  }
}

async function captchaBlurBinary(sharpMod, rgbBuf, blurSigma, thr) {
  return sharpMod(rgbBuf).greyscale().normalize().blur(blurSigma).threshold(thr).png().toBuffer();
}

/** Sharp preprocess variants — Automation reference. */
export async function buildCaptchaOcrVariants(rawPath, outDir) {
  const sharp = (await import('sharp')).default;
  const paths = [];

  const pushIfValid = async (p) => {
    if (!fs.existsSync(p)) return;
    try {
      const m = await sharp(p).metadata();
      if ((m.width ?? 0) >= 24 && (m.height ?? 0) >= 16) paths.push(p);
    } catch {
      /* skip */
    }
  };

  await pushIfValid(rawPath);

  let work;
  try {
    work = await fs.promises.readFile(rawPath);
  } catch {
    return paths.length ? paths : [rawPath];
  }

  try {
    const trimmed = await sharp(work).trim({ threshold: 20 }).png().toBuffer();
    const tm = await sharp(trimmed).metadata();
    if ((tm.width ?? 0) >= 8 && (tm.height ?? 0) >= 8) work = trimmed;
  } catch {
    /* no trim */
  }

  const meta = await sharp(work).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 4 || h < 4) return paths.length ? paths : [rawPath];

  const minSide = Math.min(w, h);
  const scales = [...new Set([Math.max(3.6, 120 / minSide), Math.max(5.2, 180 / minSide)])];

  let idx = 0;
  for (const scale of scales) {
    const nw = Math.max(56, Math.round(w * scale));
    const nh = Math.max(56, Math.round(h * scale));
    const baseBuf = await sharp(work).resize(nw, nh, { kernel: sharp.kernel.nearest }).png().toBuffer();
    const tag = `${idx}`;
    idx += 1;

    const variants = [
      ['a-grey', () => sharp(baseBuf).greyscale().normalize().png()],
      ['b-bin128', () => sharp(baseBuf).greyscale().normalize().threshold(128).png()],
      ['c-bin138', () => sharp(baseBuf).greyscale().normalize().threshold(138).png()],
      [
        'd-hi',
        () =>
          sharp(baseBuf)
            .greyscale()
            .normalize()
            .linear(1.52, -(0.12 * 255))
            .threshold(126)
            .png(),
      ],
      ['h-medth', () => sharp(baseBuf).greyscale().median(3).normalize().threshold(132).png()],
      [
        'i-sharp',
        () =>
          sharp(baseBuf)
            .greyscale()
            .normalize()
            .sharpen({ sigma: 1.1, flat: 1, jagged: 2 })
            .threshold(124)
            .png(),
      ],
    ];

    for (const [name, fn] of variants) {
      const p = path.join(outDir, `captcha-ocr-${tag}${name}.png`);
      await fn().toFile(p);
      await pushIfValid(p);
    }

    for (const [sig, thr] of [
      [0.42, 118],
      [0.75, 110],
    ]) {
      const pBl = path.join(outDir, `captcha-ocr-${tag}e-blur${sig}.png`);
      const buf = await captchaBlurBinary(sharp, baseBuf, sig, thr);
      await sharp(buf).png().toFile(pBl);
      await pushIfValid(pBl);
    }
  }

  if (paths.length === 0 && fs.existsSync(rawPath)) paths.push(rawPath);
  return [...new Set(paths)];
}

function effectiveOcrConfidence(data) {
  const line = typeof data.confidence === 'number' && !Number.isNaN(data.confidence) ? data.confidence : 0;
  if (!data?.words?.length) return line;
  let sum = 0;
  let n = 0;
  for (const w of data.words) {
    const raw = (w.text || '').replace(/\s+/g, '');
    if (!raw) continue;
    const c = typeof w.confidence === 'number' && !Number.isNaN(w.confidence) ? w.confidence : 0;
    sum += c;
    n += 1;
  }
  return Math.max(line, n > 0 ? sum / n : 0);
}

function ocrPickScore(text, confidence) {
  let s = confidence;
  if (text.length >= 5 && text.length <= 8) s += 40;
  if (text.length === 6) s += 45;
  if (text.length < 4) s -= 80;
  if (text.length > 10) s -= 30;
  return s;
}

function ocrTallyHit(tally, text, sc, effectiveConf) {
  if (!text || text.length < 4 || effectiveConf < 44) return;
  const prev = tally.get(text);
  if (!prev) {
    tally.set(text, { count: 1, bestScore: sc, sumConf: effectiveConf, minEff: effectiveConf });
    return;
  }
  prev.count += 1;
  prev.bestScore = Math.max(prev.bestScore, sc);
  prev.sumConf += effectiveConf;
  prev.minEff = Math.min(prev.minEff, effectiveConf);
}

function ocrPickFromTally(tally, fallback) {
  let bestAgree = '';
  let bestAgreeTie = -Infinity;
  for (const [t, v] of tally) {
    if (v.count < 2 || v.minEff < 52) continue;
    let tie = v.bestScore + v.count * 6 + v.minEff * 0.45;
    if (t.length === 6) tie += 28;
    if (tie > bestAgreeTie) {
      bestAgreeTie = tie;
      bestAgree = t;
    }
  }
  if (bestAgree) return bestAgree;

  const candidates = [...tally.entries()].filter(([, v]) => v.minEff >= 44);
  if (!candidates.length) return fallback;
  candidates.sort((a, b) => {
    const b1 = a[0].length === 6 ? 32 : 0;
    const b2 = b[0].length === 6 ? 32 : 0;
    return b[1].bestScore + b2 - (a[1].bestScore + b1);
  });
  return candidates[0][0] || fallback;
}

async function ocrOnce(worker, imagePath, psm) {
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      tessedit_pageseg_mode: psm,
    });
  } catch {
    /* ignore */
  }
  const { data } = await worker.recognize(imagePath, {}, { blocks: true, text: true });
  const text = (data.text || '').replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').trim();
  return { text, confidence: effectiveOcrConfidence(data) };
}

export async function runTesseractCaptchaOcr(imagePaths) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: () => {} });
  const psms = ['7', '8', '13', '6'];
  let bestText = '';
  let bestScore = -Infinity;
  let bestConf = -1;
  const tally = new Map();

  try {
    for (const imgPath of imagePaths) {
      if (!fs.existsSync(imgPath)) continue;
      for (const psm of psms) {
        const { text, confidence: effConf } = await ocrOnce(worker, imgPath, psm);
        if (text.length < 4 || text.length > 12) continue;
        const sc = ocrPickScore(text, effConf);
        ocrTallyHit(tally, text, sc, effConf);
        if (effConf < 36) continue;
        if (sc > bestScore || (sc === bestScore && text.length > bestText.length)) {
          bestScore = sc;
          bestText = text;
          bestConf = effConf;
        }
      }
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  const picked = ocrPickFromTally(tally, bestText);
  const vPick = picked ? tally.get(picked) : undefined;
  const confPicked = vPick && vPick.count > 0 ? vPick.sumConf / vPick.count : bestConf;
  const finalText = picked || bestText;
  const finalConf = finalText === picked && vPick ? confPicked : bestConf;
  return { text: finalText, confidence: Math.max(0, finalConf) };
}

async function refineVisionCaseWithTesseract(visionText, imagePaths) {
  if (!visionText || visionText.length < 4) return visionText;
  const want = visionText.toLowerCase();
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: () => {} });
  let bestHint = '';
  let bestScore = -Infinity;

  try {
    for (const imgPath of imagePaths.slice(0, 12)) {
      if (!fs.existsSync(imgPath)) continue;
      for (const psm of ['7', '8']) {
        const { text, confidence: effConf } = await ocrOnce(worker, imgPath, psm);
        if (text.length !== visionText.length || text.toLowerCase() !== want) continue;
        let lowerBonus = 0;
        for (const c of text) {
          if (c >= 'a' && c <= 'z') lowerBonus += 2;
        }
        const score = effConf + lowerBonus;
        if (score > bestScore) {
          bestScore = score;
          bestHint = text;
        }
      }
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  return bestHint ? mergeCaseWithHint(visionText, bestHint) : visionText;
}

async function solveCaptchaWithGemini(imageBuffer) {
  loadEnvFile();
  const apiKeys = Object.entries(process.env)
    .filter(([k, v]) => k.startsWith('GEMINI_API_KEY') && v?.trim())
    .map(([, v]) => v.trim());
  if (!apiKeys.length) throw new Error('GEMINI_API_KEY not found in .env');

  const prompt =
    'This image is a CAPTCHA. Return ONLY the captcha characters (letters/digits), no spaces or explanation. Preserve case.';

  const genAI = new GoogleGenerativeAI(apiKeys[0]);
  for (const modelName of ['gemini-3.6-flash', 'gemini-flash-latest']) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0, maxOutputTokens: 32 },
      });
      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBuffer.toString('base64'),
          },
        },
      ]);
      const cleaned = result.response.text().trim().replace(/[^a-zA-Z0-9]/g, '');
      if (cleaned) return cleaned;
    } catch {
      /* next model */
    }
  }
  throw new Error('Gemini captcha OCR failed');
}

/** Main OCR entry — Automation-style pipeline. */
export async function solveCaptchaFromScreenshot(screenshotBuffer, onLog) {
  const artifactsDir = await getArtifactsDir();
  fs.mkdirSync(artifactsDir, { recursive: true });
  const rawPath = path.join(artifactsDir, 'captcha-latest.png');
  fs.writeFileSync(rawPath, screenshotBuffer);

  const ocrPaths = await buildCaptchaOcrVariants(rawPath, artifactsDir);
  if (onLog) onLog(`Captcha preprocess: ${ocrPaths.length} variant(s)`);

  loadEnvFile();
  const visionKey = resolveGoogleVisionApiKey();
  if (visionKey) {
    try {
      const vis = await runGoogleVisionCaptchaOcrBest(ocrPaths, visionKey);
      if (vis.text?.length >= 4) {
        const refined = await refineVisionCaseWithTesseract(vis.text, ocrPaths).catch(() => vis.text);
        if (onLog) onLog(`Captcha OCR (Google Vision): ${refined}`);
        return refined;
      }
    } catch (err) {
      if (onLog) onLog(`Google Vision: ${err.message}`);
    }
  } else if (onLog) {
    onLog('Google Vision key not set — trying Tesseract/Gemini');
  }

  try {
    const tess = await runTesseractCaptchaOcr(ocrPaths);
    if (tess.text?.length >= 4) {
      if (onLog) onLog(`Captcha OCR (Tesseract): ${tess.text}`);
      return tess.text;
    }
  } catch (err) {
    if (onLog) onLog(`Tesseract: ${err.message}`);
  }

  const geminiText = await solveCaptchaWithGemini(screenshotBuffer);
  if (onLog) onLog(`Captcha OCR (Gemini fallback): ${geminiText}`);
  return geminiText;
}

/** CPCB captcha API — returns PNG buffer + captchaKey. */
export async function fetchCaptchaFromApi(page) {
  const apiUrl = 'https://epr.cpcb.gov.in/cpcbadmin/api/v1/captcha';
  const response = await page.request.get(apiUrl);
  if (!response.ok()) {
    throw new Error(`Captcha API HTTP ${response.status()}`);
  }
  const data = await response.json();
  const imageData = String(data?.image || '');
  const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  if (!base64) throw new Error('Captcha API returned empty image');
  return {
    captchaKey: data.captchaKey || null,
    buffer: Buffer.from(base64, 'base64'),
  };
}

/** Find captcha canvas/img on CPCB Supporting Documents tab. */
export async function findCaptchaElement(page) {
  const canvasCandidates = [
    page.locator('app-captcha canvas').first(),
    page.locator('.captch-canvas-blk canvas').first(),
    page.locator('canvas').filter({ has: page.locator('xpath=ancestor::app-captcha') }).first(),
  ];

  for (const canvas of canvasCandidates) {
    if (await canvas.isVisible({ timeout: 2000 }).catch(() => false)) {
      return { type: 'canvas', locator: canvas };
    }
  }

  const imgCandidates = [
    page.locator('app-captcha img').first(),
    page.locator('.captch-canvas-blk img').first(),
  ];

  for (const img of imgCandidates) {
    if (await img.isVisible({ timeout: 1000 }).catch(() => false)) {
      const src = (await img.getAttribute('src').catch(() => '')) || '';
      if (!/icon|info|eye|logo|refresh/i.test(src)) {
        return { type: 'img', locator: img };
      }
    }
  }

  const captchaInput = page.getByPlaceholder(/Enter Captcha/i);
  if ((await captchaInput.count()) > 0) {
    for (let level = 2; level <= 8; level += 1) {
      let ancestor = captchaInput.first();
      for (let i = 0; i < level; i += 1) {
        ancestor = ancestor.locator('xpath=..');
      }
      const canvas = ancestor.locator('canvas').first();
      if (await canvas.isVisible().catch(() => false)) {
        return { type: 'canvas', locator: canvas };
      }
      const img = ancestor.locator('img').first();
      if (await img.isVisible().catch(() => false)) {
        const src = (await img.getAttribute('src').catch(() => '')) || '';
        if (!/icon|info|eye|logo|refresh/i.test(src)) {
          return { type: 'img', locator: img };
        }
      }
    }
  }

  return null;
}

/** Return captcha as data URL for frontend display (canvas first — matches portal). */
export async function getCaptchaImageDataUrl(page, onLog) {
  await page
    .locator('app-captcha, .captch-canvas-blk, input[placeholder="Enter Captcha"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});

  await page.waitForTimeout(500);

  const element = await findCaptchaElement(page);
  if (element?.locator) {
    await element.locator.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    const buffer = await element.locator.screenshot();
    if (onLog) onLog(`Captcha loaded from portal ${element.type}`);
    return { captchaImage: `data:image/png;base64,${buffer.toString('base64')}` };
  }

  try {
    const api = await fetchCaptchaFromApi(page);
    if (onLog) onLog('Captcha loaded from CPCB API');
    return {
      captchaImage: `data:image/png;base64,${api.buffer.toString('base64')}`,
      captchaKey: api.captchaKey,
    };
  } catch (err) {
    throw new Error(err?.message || 'Captcha image not found on Supporting Documents tab');
  }
}

/** Capture captcha PNG for OCR — prefer CPCB API (clean PNG), then canvas. */
export async function captureCaptchaForOcr(page, onLog) {
  await page
    .locator('app-captcha, .captch-canvas-blk, input[placeholder="Enter Captcha"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});

  await page.waitForTimeout(500);

  try {
    const api = await fetchCaptchaFromApi(page);
    if (onLog) onLog('Captcha captured from CPCB API');
    return { buffer: api.buffer, source: 'api', captchaKey: api.captchaKey };
  } catch (err) {
    if (onLog) onLog(`Captcha API capture: ${err.message} — trying canvas`);
  }

  const element = await findCaptchaElement(page);
  if (element?.locator) {
    await element.locator.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    const buffer = await element.locator.screenshot();
    if (onLog) onLog(`Captcha captured from ${element.type}`);
    return { buffer, source: element.type };
  }

  throw new Error('Captcha image not found on Supporting Documents tab');
}

/** @deprecated Use findCaptchaElement */
export async function findCaptchaImage(page) {
  const el = await findCaptchaElement(page);
  return el?.locator ?? null;
}

export async function refreshCaptcha(page) {
  const refreshBtn = page.locator('app-captcha button.btnCaptcha, button.btnCaptcha').first();
  if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await refreshBtn.click();
    await page.waitForTimeout(1500);
    return;
  }

  const captchaInput = page.getByPlaceholder(/Enter Captcha/i);
  for (let level = 2; level <= 8; level += 1) {
    let ancestor = captchaInput.first();
    for (let i = 0; i < level; i += 1) {
      ancestor = ancestor.locator('xpath=..');
    }
    const buttons = ancestor.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      const btn = buttons.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1500);
        return;
      }
    }
  }
}

/** Robust captcha fill — Automation reference. */
export async function fillCaptchaField(page, text) {
  const inp = page
    .locator('app-captcha input.captcha-input, input[placeholder="Enter Captcha"]')
    .first();
  await inp.waitFor({ state: 'visible', timeout: 10000 });

  let v = String(text || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();
  const maxAttr = await inp.getAttribute('maxlength');
  const maxLen = maxAttr ? Number.parseInt(maxAttr, 10) : NaN;
  if (Number.isFinite(maxLen) && maxLen > 0 && v.length > maxLen) v = v.slice(0, maxLen);

  await inp.scrollIntoViewIfNeeded();
  await inp.click({ force: true });
  await inp.fill('');
  await inp.pressSequentially(v, { delay: 45 });
  await inp.dispatchEvent('input');
  await inp.dispatchEvent('change');
  await page.waitForTimeout(150);

  let actual = (await inp.inputValue().catch(() => '')).trim();
  if (actual !== v) {
    await inp.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await page.waitForTimeout(120);
    actual = (await inp.inputValue().catch(() => '')).trim();
  }

  if (actual !== v) {
    throw new Error(`Captcha fill failed: expected "${v}", got "${actual}"`);
  }

  await inp.evaluate((el) => {
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try {
      el.blur();
    } catch {
      /* ignore */
    }
  });
}
