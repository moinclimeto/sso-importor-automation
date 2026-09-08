/**
 * Must load before `playwright` so Chromium resolves from the installer bundle
 * instead of requiring `npx playwright install` on the user's PC.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_BROWSERS = path.join(__dirname, '../../vendor/playwright-browsers');

function isPackaged() {
  try {
    return Boolean(app?.isPackaged);
  } catch {
    return false;
  }
}

function dirHasBrowser(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((name) => /chromium/i.test(name));
  } catch {
    return false;
  }
}

export function findBundledChromiumExecutable(root = '') {
  if (!root || !fs.existsSync(root)) return '';
  const wanted = new Set(['chrome.exe', 'chrome', 'headless_shell.exe', 'headless_shell']);
  const walk = (dir, depth = 0) => {
    if (depth > 6) return '';
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return '';
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && wanted.has(entry.name.toLowerCase())) return full;
      if (entry.isDirectory()) {
        const hit = walk(full, depth + 1);
        if (hit) return hit;
      }
    }
    return '';
  };
  return walk(root);
}

export function getPlaywrightBrowsersPath() {
  const candidates = [];

  if (dirHasBrowser(VENDOR_BROWSERS)) candidates.push(VENDOR_BROWSERS);
  if (isPackaged() && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'playwright-browsers'));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  }
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    candidates.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }

  const seen = new Set();
  for (const dir of candidates) {
    const key = path.resolve(dir).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (findBundledChromiumExecutable(dir)) return dir;
  }

  return '';
}

export function formatPlaywrightBrowserError(err) {
  const raw = err?.message || String(err || 'Unknown Playwright error');
  if (!/executable doesn't exist|browser.*not found|failed to launch/i.test(raw)) {
    return raw;
  }

  return [
    'Automation browser (Chromium) is not installed on this PC.',
    'From the project folder run: npm run setup:playwright',
    'Then restart the app and try Start Registration again.',
  ].join(' ');
}

const browsersPath = getPlaywrightBrowsersPath();
if (browsersPath) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}
