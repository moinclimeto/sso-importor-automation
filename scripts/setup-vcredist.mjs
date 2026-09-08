/**
 * Downloads Microsoft VC++ Redistributable (x64) so native modules
 * (sqlite3, sharp, Playwright Chromium) work on a fresh Windows PC.
 *
 * Usage: npm run setup:vcredist
 * Runs automatically before: npm run electron:build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(ROOT, 'vendor', 'vcredist');
const TARGET_EXE = path.join(TARGET_DIR, 'vc_redist.x64.exe');
const DOWNLOAD_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';

function log(message) {
  console.log(`[vcredist-setup] ${message}`);
}

async function main() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  if (process.platform !== 'win32') {
    log('Skipping download — VC++ redistributable is only bundled for Windows installers.');
    return;
  }

  if (fs.existsSync(TARGET_EXE) && fs.statSync(TARGET_EXE).size > 1_000_000) {
    log(`Already present at ${TARGET_EXE}`);
    return;
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  log(`Downloading ${DOWNLOAD_URL}`);
  const response = await fetch(DOWNLOAD_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${DOWNLOAD_URL}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(TARGET_EXE));
  log(`Saved ${TARGET_EXE} (${fs.statSync(TARGET_EXE).size} bytes)`);
}

main().catch((err) => {
  console.error('[vcredist-setup] Failed:', err.message);
  process.exit(1);
});
