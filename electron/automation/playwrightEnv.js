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

export function getPlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && dirHasBrowser(process.env.PLAYWRIGHT_BROWSERS_PATH)) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  if (isPackaged() && process.resourcesPath) {
    return path.join(process.resourcesPath, 'playwright-browsers');
  }
  if (dirHasBrowser(VENDOR_BROWSERS)) return VENDOR_BROWSERS;
  return '';
}

export function findBundledChromiumExecutable(root = getPlaywrightBrowsersPath()) {
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

const browsersPath = getPlaywrightBrowsersPath();
if (browsersPath) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}
