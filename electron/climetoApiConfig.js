import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CLIMETO_API = 'https://api.climeto.in/api';
export const CLIMETO_SESSION_KEY = 'climeto_user_session';

function loadEnvFile() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function readEnvBaseUrl() {
  loadEnvFile();
  return normalizeBaseUrl(
    process.env.Climeto_Api_BASE_URL
      || process.env.CLIMETO_API_BASE_URL
      || process.env.climeto_api_base_url
      || '',
  );
}

let runtimeSessionToken = '';

export function setClimetoSessionToken(token) {
  runtimeSessionToken = String(token || '').trim();
}

export function clearClimetoSessionToken() {
  runtimeSessionToken = '';
}

function readEnvTokenSync() {
  if (runtimeSessionToken) return runtimeSessionToken;
  loadEnvFile();
  return String(
    process.env.Climeto_Api_TOKEN
      || process.env.CLIMETO_API_TOKEN
      || process.env.Climeto_Api_KEY
      || process.env.CLIMETO_API_KEY
      || '',
  ).trim();
}

/** Resolve login/env token for main-process Climeto API calls. */
export async function resolveClimetoToken(db) {
  const cached = readEnvTokenSync();
  if (cached) return cached;

  if (!db?.get) return '';

  try {
    const row = await db.get(`SELECT value FROM app_settings WHERE key = ?`, CLIMETO_SESSION_KEY);
    if (!row?.value) return '';
    const session = JSON.parse(row.value);
    const token = String(session?.token || '').trim();
    if (token) {
      runtimeSessionToken = token;
      return token;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function buildAuthHeaders(token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  return headers;
}

/** Prefer this for GST / PIBO / entity lookup — loads token from login session when needed. */
export async function getClimetoAuthHeaders(db) {
  const token = await resolveClimetoToken(db);
  return buildAuthHeaders(token);
}

/** Sync helper when db is unavailable (env/runtime token only). */
export function getClimetoAuthHeadersSync() {
  return buildAuthHeaders(readEnvTokenSync());
}

export async function getClimetoApiBase(db) {
  const fromEnv = readEnvBaseUrl();
  if (fromEnv) return fromEnv;

  try {
    const row = await db?.get?.(`SELECT value FROM app_settings WHERE key = ?`, 'climeto_api_base_url');
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      const normalized = normalizeBaseUrl(parsed);
      if (normalized) return normalized;
    }
  } catch {
    /* default */
  }

  return DEFAULT_CLIMETO_API;
}

export function buildClimetoApiUrl(baseUrl, routePath, query = '') {
  const base = normalizeBaseUrl(baseUrl || DEFAULT_CLIMETO_API);
  const route = String(routePath || '').replace(/^\/+/, '');
  const qs = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${base}/${route}${qs}`;
}
