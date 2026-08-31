/**
 * Downloads Playwright Chromium into vendor/playwright-browsers at build time.
 * The Windows installer copies this folder so users never run `npx playwright install`.
 *
 * Usage: npm run setup:playwright
 * Runs automatically before: npm run electron:build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(ROOT, 'vendor', 'playwright-browsers');
const PLAYWRIGHT_CLI = path.join(ROOT, 'node_modules', 'playwright', 'cli.js');

function log(message) {
  console.log(`[playwright-setup] ${message}`);
}

function findChrome(root, depth = 0) {
  if (!root || !fs.existsSync(root) || depth > 6) return '';
  const wanted = new Set(['chrome.exe', 'chrome', 'headless_shell.exe', 'headless_shell']);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && wanted.has(entry.name.toLowerCase())) return full;
    if (entry.isDirectory()) {
      const hit = findChrome(full, depth + 1);
      if (hit) return hit;
    }
  }
  return '';
}

function alreadyInstalled() {
  return Boolean(findChrome(TARGET_DIR));
}

async function main() {
  if (!fs.existsSync(PLAYWRIGHT_CLI)) {
    throw new Error('playwright is not installed. Run npm install first.');
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  if (alreadyInstalled() && process.env.PWP_FORCE_PLAYWRIGHT_SETUP !== '1') {
    log(`Already present at ${TARGET_DIR}`);
    log(`Chromium: ${findChrome(TARGET_DIR)}`);
    return;
  }

  log(`Installing Chromium into ${TARGET_DIR}`);
  execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], {
    stdio: 'inherit',
    cwd: ROOT,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: TARGET_DIR,
    },
  });

  const chrome = findChrome(TARGET_DIR);
  if (!chrome) {
    throw new Error(`Chromium download finished but chrome.exe was not found in ${TARGET_DIR}`);
  }

  fs.writeFileSync(
    path.join(TARGET_DIR, 'VERSION.txt'),
    `Playwright Chromium\nPath: ${chrome}\nInstalled: ${new Date().toISOString()}\n`,
  );
  log(`Bundled Chromium at ${chrome}`);
}

main().catch((err) => {
  console.error('[playwright-setup] Failed:', err.message);
  process.exit(1);
});
