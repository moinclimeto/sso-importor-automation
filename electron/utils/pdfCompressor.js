import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CPCB_MAX_UPLOAD_BYTES = 1024 * 1024;

function bundledGhostscriptRoots() {
  const roots = [];
  if (app?.isPackaged) {
    roots.push(path.join(process.resourcesPath, 'ghostscript'));
  }
  roots.push(path.join(__dirname, '..', 'ghostscript'));
  return roots;
}

function getGhostscriptPath() {
  const candidates = [];

  for (const root of bundledGhostscriptRoots()) {
    candidates.push(path.join(root, 'bin', 'gswin64c.exe'));
  }

  if (app?.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'bin', 'gswin64c.exe'));
  }

  candidates.push(
    path.join(__dirname, 'bin', 'gswin64c.exe'),
    path.join(__dirname, '..', 'bin', 'gswin64c.exe')
  );

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const gsRoot = path.join(programFiles, 'gs');
  if (fs.existsSync(gsRoot)) {
    for (const dir of fs.readdirSync(gsRoot)) {
      candidates.push(path.join(gsRoot, dir, 'bin', 'gswin64c.exe'));
    }
  }

  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function getGhostscriptLibPath(gsPath) {
  const binDir = path.dirname(gsPath);
  const bundledLib = path.join(path.dirname(binDir), 'lib');
  if (fs.existsSync(bundledLib)) return bundledLib;

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const gsRoot = path.join(programFiles, 'gs');
  if (fs.existsSync(gsRoot)) {
    for (const dir of fs.readdirSync(gsRoot)) {
      const lib = path.join(gsRoot, dir, 'lib');
      if (fs.existsSync(lib)) return lib;
    }
  }

  return bundledLib;
}

function runGhostscript(inputPath, outputPath, pdfSettings = '/ebook') {
  return new Promise((resolve) => {
    try {
      const gsPath = getGhostscriptPath();
      if (!gsPath) {
        console.warn('[Ghostscript] Not installed — skipping PDF compression.');
        resolve(false);
        return;
      }

      const gsLib = getGhostscriptLibPath(gsPath);
      const args = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=${pdfSettings}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`,
      ];
      const command = `"${gsPath}" ${args.join(' ')}`;
      exec(
        command,
        {
          env: {
            ...process.env,
            GS_LIB: gsLib,
            GS_DLL: path.join(path.dirname(gsPath), 'gsdll64.dll'),
          },
        },
        (error) => {
          if (error) {
            console.error('[Ghostscript] Compression failed:', error.message);
            resolve(false);
          } else {
            resolve(true);
          }
        }
      );
    } catch (err) {
      console.error('[Ghostscript] Execution error:', err);
      resolve(false);
    }
  });
}

export async function compressPdf(inputPath, outputPath) {
  return runGhostscript(inputPath, outputPath, '/ebook');
}

export async function compressPdfWithSetting(inputPath, outputPath, pdfSettings = '/ebook') {
  return runGhostscript(inputPath, outputPath, pdfSettings);
}

export async function ensurePdfUnderMaxSize(
  inputPath,
  outputPath,
  maxBytes = CPCB_MAX_UPLOAD_BYTES
) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    return { success: false, filePath: inputPath, compressed: false, sizeBytes: 0 };
  }

  const inputSize = fs.statSync(inputPath).size;
  if (inputSize <= maxBytes) {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return { success: true, filePath: outputPath, compressed: false, sizeBytes: inputSize };
  }

  const tempPath = `${outputPath}.tmp.pdf`;
  const settings = ['/ebook', '/screen'];
  let bestPath = '';
  let bestSize = Number.POSITIVE_INFINITY;

  for (const setting of settings) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    const ok = await compressPdfWithSetting(inputPath, tempPath, setting);
    if (!ok || !fs.existsSync(tempPath)) continue;
    const size = fs.statSync(tempPath).size;
    if (size < bestSize) {
      bestSize = size;
      bestPath = tempPath;
    }
    if (size <= maxBytes) {
      fs.copyFileSync(tempPath, outputPath);
      fs.unlinkSync(tempPath);
      return { success: true, filePath: outputPath, compressed: true, sizeBytes: size };
    }
  }

  if (bestPath && fs.existsSync(bestPath)) {
    fs.copyFileSync(bestPath, outputPath);
    fs.unlinkSync(bestPath);
    return {
      success: true,
      filePath: outputPath,
      compressed: true,
      sizeBytes: bestSize,
      warning: bestSize > maxBytes ? 'PDF is still above 1 MB after compression.' : undefined,
    };
  }

  fs.copyFileSync(inputPath, outputPath);
  return {
    success: true,
    filePath: outputPath,
    compressed: false,
    sizeBytes: fs.statSync(outputPath).size,
    warning: 'PDF compression unavailable; original file kept.',
  };
}
