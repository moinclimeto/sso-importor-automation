/**
 * Bundles Ghostscript (bin + lib) into electron/ghostscript/ for the Windows installer.
 *
 * Order:
 * 1. Skip if already bundled
 * 2. Copy from an existing Ghostscript install in Program Files
 * 3. Download official installer + extract with full 7-Zip (NSIS support)
 *
 * Usage: npm run setup:ghostscript
 * Runs automatically before: npm run electron:build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GS_TAG = 'gs10071';
const GS_VERSION = '10.07.1';
const INSTALLER_NAME = 'gs10071w64.exe';
const DOWNLOAD_URL = `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/${GS_TAG}/${INSTALLER_NAME}`;

const TARGET_DIR = path.join(ROOT, 'electron', 'ghostscript');
const TARGET_BIN = path.join(TARGET_DIR, 'bin', 'gswin64c.exe');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'ghostscript-setup');

function log(message) {
  console.log(`[ghostscript-setup] ${message}`);
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function findFile(root, fileName) {
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const hit = findFile(full, fileName);
      if (hit) return hit;
    }
  }
  return null;
}

function writeVersionNote(source) {
  fs.writeFileSync(
    path.join(TARGET_DIR, 'VERSION.txt'),
    `Ghostscript ${GS_VERSION}\nSource: ${source}\n`
  );
}

function copyBundledFromLayout(binDir, libDir, sourceNote) {
  rmDir(TARGET_DIR);
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  copyDir(binDir, path.join(TARGET_DIR, 'bin'));
  copyDir(libDir, path.join(TARGET_DIR, 'lib'));
  writeVersionNote(sourceNote);
  log(`Bundled Ghostscript to ${TARGET_DIR}`);
}

function copyFromInstalledGhostscript() {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const gsRoot = path.join(programFiles, 'gs');
  if (!fs.existsSync(gsRoot)) return false;

  const versions = fs
    .readdirSync(gsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(gsRoot, entry.name))
    .sort()
    .reverse();

  for (const root of versions) {
    const binDir = path.join(root, 'bin');
    const libDir = path.join(root, 'lib');
    const gsExe = path.join(binDir, 'gswin64c.exe');
    if (fs.existsSync(gsExe) && fs.existsSync(libDir)) {
      log(`Copying Ghostscript from ${root}`);
      copyBundledFromLayout(binDir, libDir, root);
      return true;
    }
  }

  return false;
}

async function resolveFull7Zip() {
  try {
    const mod = await import('7zip-bin-full');
    if (mod.path7z && fs.existsSync(mod.path7z)) {
      return {
        exe: mod.path7z,
        cwd: path.dirname(mod.path7z),
      };
    }
  } catch {
    /* optional dependency */
  }

  const programFiles7z = path.join(process.env.ProgramFiles || 'C:\\Program Files', '7-Zip', '7z.exe');
  if (fs.existsSync(programFiles7z)) {
    return { exe: programFiles7z, cwd: path.dirname(programFiles7z) };
  }

  throw new Error(
    'Full 7-Zip (7z.exe + 7z.dll) is required to extract the Ghostscript installer. Install dev dependency with: npm install'
  );
}

async function downloadFile(url, dest) {
  log(`Downloading ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
  log(`Saved installer to ${dest}`);
}

function extractInstaller(installerPath, outDir, sevenZip) {
  rmDir(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  log('Extracting Ghostscript installer with 7-Zip (NSIS)...');
  execFileSync(
    sevenZip.exe,
    [
      'x',
      '-y',
      '-x!$PLUGINSDIR',
      '-x!*.nsis',
      '-x!vcredist*',
      `-o${outDir}`,
      installerPath,
    ],
    { stdio: 'inherit', cwd: sevenZip.cwd }
  );
}

function resolveExtractedLayout(extractDir) {
  const gsExe = findFile(extractDir, 'gswin64c.exe');
  if (!gsExe) {
    throw new Error('gswin64c.exe not found after extraction.');
  }

  const binDir = path.dirname(gsExe);
  const libDir = path.join(path.dirname(binDir), 'lib');
  if (!fs.existsSync(libDir)) {
    throw new Error('Ghostscript lib/ folder not found after extraction.');
  }

  return { binDir, libDir };
}

async function downloadAndExtractGhostscript() {
  const sevenZip = await resolveFull7Zip();
  const installerPath = path.join(CACHE_DIR, INSTALLER_NAME);
  const extractDir = path.join(CACHE_DIR, 'extract');

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  if (!fs.existsSync(installerPath)) {
    await downloadFile(DOWNLOAD_URL, installerPath);
  } else {
    log(`Using cached installer ${installerPath}`);
  }

  extractInstaller(installerPath, extractDir, sevenZip);
  const { binDir, libDir } = resolveExtractedLayout(extractDir);
  copyBundledFromLayout(binDir, libDir, DOWNLOAD_URL);
}

async function main() {
  if (process.platform !== 'win32') {
    log('Skipping — bundled Ghostscript setup is only required for Windows builds.');
    return;
  }

  if (fs.existsSync(TARGET_BIN)) {
    log(`Already present at ${TARGET_BIN}`);
    return;
  }

  if (copyFromInstalledGhostscript()) {
    return;
  }

  await downloadAndExtractGhostscript();
}

main().catch((err) => {
  console.error('[ghostscript-setup] Failed:', err.message);
  console.error(
    '[ghostscript-setup] Manual fallback: install Ghostscript, then rerun npm run setup:ghostscript'
  );
  process.exit(1);
});
