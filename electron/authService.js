import axios from 'axios';
import {
  buildClimetoApiUrl,
  getClimetoApiBase,
  setClimetoSessionToken,
  clearClimetoSessionToken,
  CLIMETO_SESSION_KEY,
} from './climetoApiConfig.js';

const SESSION_KEY = CLIMETO_SESSION_KEY;
const LOGIN_TIMEOUT_MS = 20000;

function mapApiUser(apiUser = {}) {
  return {
    id: apiUser.id,
    email: apiUser.email,
    userType: apiUser.user_type,
    companyName: apiUser.company_name,
    storageMode: apiUser.storage_mode,
    entityType: apiUser.entity_type,
    permissions: apiUser.permissions ?? null,
    name: apiUser.company_name || apiUser.email || '',
    role: apiUser.user_type || '',
  };
}

async function readSession(db) {
  const row = await db.get(`SELECT value FROM app_settings WHERE key = ?`, SESSION_KEY);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function writeSession(db, session) {
  await db.run(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    SESSION_KEY,
    JSON.stringify(session),
  );
  setClimetoSessionToken(session.token);
}

async function deleteSession(db) {
  await db.run(`DELETE FROM app_settings WHERE key = ?`, SESSION_KEY);
  clearClimetoSessionToken();
}

export async function restoreClimetoSession(db) {
  const session = await readSession(db);
  if (!session?.token) {
    clearClimetoSessionToken();
    return { success: false };
  }
  setClimetoSessionToken(session.token);
  return {
    success: true,
    token: session.token,
    user: session.user || null,
  };
}

export async function getClimetoSession(db) {
  const session = await readSession(db);
  if (!session?.token) return { success: false, token: null, user: null };
  setClimetoSessionToken(session.token);
  return {
    success: true,
    token: session.token,
    user: session.user || null,
  };
}

export async function loginClimeto(db, { email, password, force = false } = {}) {
  const trimmedEmail = String(email || '').trim();
  const pwd = String(password || '');
  if (!trimmedEmail || !pwd) {
    return { success: false, error: 'Email and password are required.' };
  }

  const baseUrl = await getClimetoApiBase(db);
  const url = buildClimetoApiUrl(baseUrl, 'auth/login');
  const body = { email: trimmedEmail, password: pwd };
  if (force) body.force = true;

  try {
    const res = await axios.post(url, body, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: LOGIN_TIMEOUT_MS,
      validateStatus: () => true,
    });

    if (res.status === 409 && res.data?.requiresConfirmation) {
      return {
        success: false,
        requiresConfirmation: true,
        message:
          res.data?.msg
          || res.data?.message
          || 'Already logged in elsewhere. Log out from that device and continue here?',
      };
    }

    if (res.status >= 400 || !res.data?.token) {
      return {
        success: false,
        error:
          res.data?.msg
          || res.data?.message
          || res.data?.error
          || `Login failed (${res.status})`,
      };
    }

    const user = mapApiUser(res.data.user);
    const session = {
      token: res.data.token,
      user,
      loggedInAt: new Date().toISOString(),
    };
    await writeSession(db, session);

    return {
      success: true,
      token: session.token,
      user,
      message: res.data.msg || 'User Logged In Successfully',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Login request failed.',
    };
  }
}

export async function logoutClimeto(db) {
  await deleteSession(db);
  return { success: true };
}
