/**
 * Google Cloud Vision API — CAPTCHA OCR (from Downloads/Automation reference).
 */
import fs from 'fs';
import path from 'path';

const VISION_ANNOTATE = 'https://vision.googleapis.com/v1/images:annotate';

function sanitizeCaptcha(raw) {
  return String(raw || '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();
}

function collectConfidences(full) {
  const confs = [];
  for (const page of full?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          if (typeof word.confidence === 'number') confs.push(word.confidence);
          for (const sym of word.symbols ?? []) {
            if (typeof sym.confidence === 'number') confs.push(sym.confidence);
          }
        }
      }
    }
  }
  return confs;
}

function collectRawTextCandidates(resp) {
  const out = [];
  const push = (s) => {
    const t = String(s ?? '').trim();
    if (t) out.push(t);
  };

  push(resp?.fullTextAnnotation?.text);

  const tas = resp?.textAnnotations;
  if (Array.isArray(tas)) {
    for (const t of tas) push(t?.description);
    if (tas.length > 1) {
      push(
        tas
          .slice(1)
          .map((a) => (a?.description ?? '').trim())
          .filter(Boolean)
          .join('')
      );
    }
  }

  return [...new Set(out)];
}

function collectDocumentSymbolStrings(resp) {
  const full = resp?.fullTextAnnotation;
  const out = [];
  for (const page of full?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        let acc = '';
        for (const word of para.words ?? []) {
          for (const sym of word.symbols ?? []) {
            if (typeof sym.text === 'string' && sym.text.length > 0) acc += sym.text;
          }
        }
        const t = acc.trim();
        if (t) out.push(t);
      }
    }
  }
  return [...new Set(out)];
}

export function mergeCaseWithHint(primary, hint) {
  if (!primary || !hint) return primary || '';
  if (primary.length !== hint.length) return primary;
  if (primary.toLowerCase() !== hint.toLowerCase()) return primary;
  let out = '';
  for (let i = 0; i < primary.length; i += 1) {
    const p = primary[i];
    const h = hint[i];
    if (/[a-zA-Z]/.test(p) && /[a-zA-Z]/.test(h) && p.toLowerCase() === h.toLowerCase()) {
      out += h;
    } else {
      out += p;
    }
  }
  return out;
}

function mixedCaseBonus(s) {
  let b = 0;
  for (const c of s) {
    if (c >= 'a' && c <= 'z') b += 35;
  }
  return b;
}

function pickBestCaptchaToken(rawCandidates) {
  const expanded = [...rawCandidates];
  for (const raw of rawCandidates) {
    const firstLine = String(raw ?? '')
      .split(/\r?\n/)[0]
      ?.trim();
    if (firstLine && firstLine !== raw) expanded.push(firstLine);
  }

  const bySan = new Map();
  for (const raw of expanded) {
    const s = sanitizeCaptcha(raw);
    if (s.length < 4 || s.length > 12) continue;
    bySan.set(s, (bySan.get(s) ?? 0) + 1);
  }

  const byLower = new Map();
  for (const [s, hits] of bySan) {
    const k = s.toLowerCase();
    let sc = hits * 40 + s.length * 3 + mixedCaseBonus(s);
    if (s.length === 6) sc += 120;
    const cur = byLower.get(k);
    if (!cur || sc > cur.score) byLower.set(k, { text: s, score: sc });
  }

  let best = '';
  let bestScore = -1;
  for (const { text: s, score: sc } of byLower.values()) {
    if (sc > bestScore || (sc === bestScore && s.length > best.length)) {
      bestScore = sc;
      best = s;
    }
  }

  const confHint = best.length === 6 ? 84 : best.length >= 4 ? 72 : 0;
  return { text: best, confHint };
}

async function upscaleIfTinyForVision(imageBuf) {
  const minW = 280;
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(imageBuf).metadata();
    const w = meta.width ?? 0;
    if (w >= minW) return imageBuf;
    const scale = minW / Math.max(1, w);
    const nw = Math.round(w * scale);
    const nh = Math.max(32, Math.round((meta.height ?? 24) * scale));
    return sharp(imageBuf).resize(nw, nh, { kernel: sharp.kernel.cubic }).png().toBuffer();
  } catch {
    return imageBuf;
  }
}

async function visionAnnotate(contentBase64, apiKey, featureTypes) {
  const url = `${VISION_ANNOTATE}?key=${encodeURIComponent(apiKey.trim())}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: contentBase64 },
          features: featureTypes.map((type) => ({ type, maxResults: 50 })),
          imageContext: { languageHints: ['en'] },
        },
      ],
    }),
  });

  const rawText = await res.text();
  if (!res.ok) throw new Error(`Google Vision HTTP ${res.status}: ${rawText.slice(0, 500)}`);

  const json = JSON.parse(rawText);
  const first = json.responses?.[0];
  if (first?.error) throw new Error(first.error.message || JSON.stringify(first.error));
  return first ?? {};
}

export async function runGoogleVisionCaptchaOcr(imagePath, apiKey) {
  if (!apiKey?.trim()) throw new Error('Google Vision: API key missing');
  if (!fs.existsSync(imagePath)) throw new Error(`Google Vision: file not found: ${imagePath}`);

  let buf = fs.readFileSync(imagePath);
  buf = await upscaleIfTinyForVision(buf);
  const content = buf.toString('base64');

  const rText = await visionAnnotate(content, apiKey, ['TEXT_DETECTION']);
  const rDoc = await visionAnnotate(content, apiKey, ['DOCUMENT_TEXT_DETECTION']);

  const cands = [
    ...collectRawTextCandidates(rText),
    ...collectRawTextCandidates(rDoc),
    ...collectDocumentSymbolStrings(rDoc),
  ];

  const { text, confHint } = pickBestCaptchaToken(cands);
  const confs = collectConfidences(rDoc?.fullTextAnnotation);
  let confidence = confHint;
  if (confs.length > 0) {
    confidence = Math.max(confidence, (confs.reduce((a, c) => a + c, 0) / confs.length) * 100);
  }

  const ocrMinTrust = 62;
  const trusted = text.length === 6 && confidence >= ocrMinTrust;
  return { text, confidence, trusted };
}

export async function runGoogleVisionCaptchaOcrBest(imagePaths, apiKey) {
  const max = 8;
  const seen = new Set();
  const byLower = new Map();
  let n = 0;

  for (const p of imagePaths) {
    if (n >= max) break;
    const rp = path.resolve(p);
    if (seen.has(rp)) continue;
    seen.add(rp);
    if (!fs.existsSync(p)) continue;
    n += 1;
    try {
      const o = await runGoogleVisionCaptchaOcr(p, apiKey);
      if (!o.text || o.text.length < 4 || o.text.length > 12) continue;
      const k = o.text.toLowerCase();
      const cur = byLower.get(k) ?? { votes: 0, sumConf: 0, bestText: o.text, bestConf: -1 };
      cur.votes += 1;
      cur.sumConf += o.confidence;
      if (o.confidence > cur.bestConf) {
        cur.bestConf = o.confidence;
        cur.bestText = o.text;
      }
      byLower.set(k, cur);
    } catch {
      /* next */
    }
  }

  if (byLower.size === 0) return { text: '', confidence: 0, trusted: false, visionVotes: 0 };

  let winKey = '';
  let winScore = -Infinity;
  for (const [k, cur] of byLower) {
    const avg = cur.sumConf / Math.max(1, cur.votes);
    let sc = avg + cur.votes * 38 + mixedCaseBonus(cur.bestText);
    if (k.length === 6) sc += 85;
    if (sc > winScore) {
      winScore = sc;
      winKey = k;
    }
  }

  const w = byLower.get(winKey);
  const text = w?.bestText ?? '';
  const confidence = Math.min(95, w ? w.sumConf / Math.max(1, w.votes) : 0);
  return { text, confidence, trusted: text.length === 6 && confidence >= 62, visionVotes: w?.votes ?? 0 };
}

export function resolveGoogleVisionApiKey() {
  return (
    process.env.PWP_GOOGLE_VISION_API_KEY ||
    process.env.EABKARI_GOOGLE_VISION_API_KEY ||
    process.env.GOOGLE_CLOUD_VISION_API_KEY ||
    ''
  ).trim();
}
