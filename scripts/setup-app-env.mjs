/**
 * Copy project .env into vendor/app-env so the Windows installer can load
 * GEMINI_API_KEY and other secrets (the asar build does not include .env).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destDir = path.join(root, 'vendor', 'app-env');
const dest = path.join(destDir, '.env');
const src = path.join(root, '.env');

fs.mkdirSync(destDir, { recursive: true });

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('[app-env] Bundled project .env for the installer');
} else if (!fs.existsSync(dest)) {
  fs.writeFileSync(
    dest,
    '# Copy this file to %APPDATA%\\sso-importor-automation\\.env and set GEMINI_API_KEY=\n',
    'utf8',
  );
  console.log('[app-env] No project .env found; wrote a placeholder');
} else {
  console.log('[app-env] Keeping existing vendor/app-env/.env');
}
