import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';

const ALLOWED_DOC_EXTS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
const RAR_EXTS = new Set(['.rar', '.r00', '.r01', '.rev']);

function isMacJunk(entryName) {
  const n = String(entryName || '').replace(/\\/g, '/');
  return (
    n.startsWith('__MACOSX/') ||
    n.includes('/__MACOSX/') ||
    n.endsWith('/.DS_Store') ||
    n === '.DS_Store'
  );
}

function safeRelPath(entryName) {
  return String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join(path.sep);
}

/**
 * Expand a ZIP (and nested ZIPs up to maxDepth). Folders inside are walked via zip entries.
 * RAR and non PDF/image files are reported in skipped.
 */
export async function expandZipFile(zipPath, { maxDepth = 2, depth = 0 } = {}) {
  const zipName = path.basename(zipPath);
  const files = [];
  const skipped = [];
  const tempRoots = [];

  if (!zipPath || !fs.existsSync(zipPath)) {
    skipped.push({ name: zipName || 'archive.zip', reason: 'ZIP file not found' });
    return { files, skipped, tempRoots };
  }

  let zip;
  try {
    const buf = fs.readFileSync(zipPath);
    zip = await JSZip.loadAsync(buf);
  } catch (err) {
    skipped.push({
      name: zipName,
      reason: err?.message || 'Could not open ZIP',
    });
    return { files, skipped, tempRoots };
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwp-zip-'));
  tempRoots.push(outDir);

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const entryName = entry.name;
    if (isMacJunk(entryName)) continue;

    const base = path.basename(entryName.replace(/\\/g, '/'));
    const ext = path.extname(base).toLowerCase();

    if (RAR_EXTS.has(ext)) {
      skipped.push({
        name: base,
        reason: 'RAR skipped — only ZIP archives are supported',
        fromZip: zipName,
      });
      continue;
    }

    if (ext === '.zip') {
      if (depth >= maxDepth) {
        skipped.push({
          name: base,
          reason: 'Nested ZIP too deep — skipped',
          fromZip: zipName,
        });
        continue;
      }
      try {
        const nestedBuf = await entry.async('nodebuffer');
        const nestedPath = path.join(outDir, `_nested_${depth}_${files.length}_${base}`);
        fs.writeFileSync(nestedPath, nestedBuf);
        const nested = await expandZipFile(nestedPath, { maxDepth, depth: depth + 1 });
        files.push(...nested.files);
        skipped.push(...nested.skipped);
        tempRoots.push(...nested.tempRoots);
      } catch (err) {
        skipped.push({
          name: base,
          reason: err?.message || 'Nested ZIP failed',
          fromZip: zipName,
        });
      }
      continue;
    }

    if (!ALLOWED_DOC_EXTS.has(ext)) {
      skipped.push({
        name: base,
        reason: `Skipped (${ext || 'unknown type'}) — only PDF / images allowed`,
        fromZip: zipName,
      });
      continue;
    }

    try {
      const rel = safeRelPath(entryName) || base;
      const dest = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const data = await entry.async('nodebuffer');
      fs.writeFileSync(dest, data);
      files.push({
        name: base,
        path: dest,
        size: data.length,
        fromZip: zipName,
        zipEntry: entryName,
      });
    } catch (err) {
      skipped.push({
        name: base,
        reason: err?.message || 'Failed to extract file',
        fromZip: zipName,
      });
    }
  }

  return { files, skipped, tempRoots };
}

function walkCollectPaths(dir, { maxDepth = 3, limit = 200 } = {}) {
  const collected = [];
  const walk = (current, depth) => {
    if (depth > maxDepth || collected.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (collected.length >= limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        collected.push(full);
      }
    }
  };
  walk(dir, 0);
  return collected;
}

/**
 * Resolve a mixed list of upload paths: folders, ZIPs, skip RAR/unsupported, keep PDF/images.
 */
export async function resolveUploadPaths(filePaths = []) {
  const files = [];
  const skipped = [];
  const tempRoots = [];
  const zipSummaries = [];

  // Flatten directories first so ZIP/RAR/docs are handled uniformly.
  const flatPaths = [];
  for (const p of filePaths || []) {
    if (!p || typeof p !== 'string') continue;
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        const nested = walkCollectPaths(p);
        if (!nested.length) {
          skipped.push({
            name: path.basename(p),
            reason: 'Folder has no files to upload',
          });
        } else {
          flatPaths.push(...nested);
        }
        continue;
      }
    } catch {
      /* treat as file path below */
    }
    flatPaths.push(p);
  }

  for (const p of flatPaths) {
    if (!p || typeof p !== 'string') continue;
    const name = path.basename(p);
    const ext = path.extname(name).toLowerCase();

    if (RAR_EXTS.has(ext)) {
      skipped.push({
        name,
        reason: 'RAR skipped — only ZIP archives are supported',
      });
      continue;
    }

    if (ext === '.zip') {
      const expanded = await expandZipFile(p);
      files.push(...expanded.files);
      skipped.push(...expanded.skipped);
      tempRoots.push(...expanded.tempRoots);
      zipSummaries.push({
        zipName: name,
        zipPath: p,
        files: expanded.files,
        skipped: expanded.skipped.filter((s) => s.fromZip === name || !s.fromZip),
      });
      continue;
    }

    if (ALLOWED_DOC_EXTS.has(ext)) {
      let size = 0;
      try {
        if (fs.existsSync(p)) size = fs.statSync(p).size;
      } catch {
        /* ignore */
      }
      files.push({ name, path: p, size, fromZip: null });
      continue;
    }

    skipped.push({
      name,
      reason: `Skipped (${ext || 'unknown type'}) — only PDF / images / ZIP allowed`,
    });
  }

  return { files, skipped, tempRoots, zipSummaries };
}

export { ALLOWED_DOC_EXTS, RAR_EXTS };
