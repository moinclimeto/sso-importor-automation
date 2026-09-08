/**
 * Build-time runtime dependencies for a fresh Windows install:
 * Ghostscript, Playwright Chromium, and VC++ redistributable.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STEPS = [
  'setup-ghostscript.mjs',
  'setup-playwright.mjs',
  'setup-vcredist.mjs',
  'setup-app-env.mjs',
];

for (const file of STEPS) {
  console.log(`\n[prepare-installer] ${file}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\n[prepare-installer] Runtime dependencies are ready for electron-builder.');
