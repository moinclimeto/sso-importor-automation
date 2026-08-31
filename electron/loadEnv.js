import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function candidateEnvPaths() {
  const list = [
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  try {
    list.push(path.join(app.getPath('userData'), '.env'));
    list.push(path.join(path.dirname(app.getPath('exe')), '.env'));
  } catch {
    /* app paths not ready yet */
  }
  try {
    if (process.resourcesPath) {
      list.push(path.join(process.resourcesPath, 'app-env', '.env'));
      list.push(path.join(process.resourcesPath, '.env'));
    }
  } catch {
    /* ignore */
  }
  const seen = new Set();
  const out = [];
  for (const file of list) {
    const normalized = path.normalize(file);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function seedUserDataEnv() {
  try {
    const dest = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(dest)) return;
    const bundled = process.resourcesPath
      ? path.join(process.resourcesPath, 'app-env', '.env')
      : '';
    if (bundled && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(bundled, dest);
    }
  } catch {
    /* ignore */
  }
}

function applyEnvFile(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

export function loadEnvFile() {
  seedUserDataEnv();
  for (const file of candidateEnvPaths()) {
    try {
      if (fs.existsSync(file)) applyEnvFile(file);
    } catch {
      /* ignore unreadable env files */
    }
  }
}

export function getGeminiApiKeys() {
  loadEnvFile();
  const keys = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GEMINI_API_KEY')) continue;
    const trimmed = String(value || '').trim();
    if (trimmed) keys.push(trimmed);
  }
  return keys;
}

loadEnvFile();
