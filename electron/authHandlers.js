import { ipcMain } from 'electron';
import { getDb } from './db/database.js';
import { setClimetoSessionToken } from './climetoApiConfig.js';
import {
  getClimetoSession,
  loginClimeto,
  logoutClimeto,
  restoreClimetoSession,
} from './authService.js';
import { setTelemetryUser, trackTelemetry } from './telemetry/telemetry.js';

let authHandlersRegistered = false;

export function registerAuthHandlers() {
  if (authHandlersRegistered) return;
  authHandlersRegistered = true;

  ipcMain.handle('auth:login', async (_, payload = {}) => {
    try {
      const db = getDb();
      const result = await loginClimeto(db, payload);
      if (result?.success && result?.user) {
        setTelemetryUser(result.user);
        trackTelemetry('user_login', { userId: result.user.id, email: result.user.email }).catch(() => {});
      }
      return result;
    } catch (err) {
      console.error('auth:login error', err);
      return { success: false, error: err.message || 'Login failed.' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      const db = getDb();
      trackTelemetry('user_logout').catch(() => {});
      setTelemetryUser(null);
      return await logoutClimeto(db);
    } catch (err) {
      console.error('auth:logout error', err);
      return { success: false, error: err.message || 'Logout failed.' };
    }
  });

  ipcMain.handle('auth:getSession', async () => {
    try {
      const db = getDb();
      return await getClimetoSession(db);
    } catch (err) {
      console.error('auth:getSession error', err);
      return { success: false, token: null, user: null };
    }
  });

  ipcMain.handle('auth:syncToken', async (_, token) => {
    try {
      setClimetoSessionToken(token);
      return { success: true };
    } catch (err) {
      console.error('auth:syncToken error', err);
      return { success: false, error: err.message || 'Token sync failed.' };
    }
  });

  try {
    restoreClimetoSession(getDb()).then((session) => {
      if (session?.success && session?.user) {
        setTelemetryUser(session.user);
      }
    }).catch((err) => {
      console.warn('Failed to restore Climeto session on startup', err.message);
    });
  } catch (err) {
    console.warn('Failed to restore Climeto session on startup', err.message);
  }

  console.log('[auth] IPC handlers registered (auth:login, auth:logout, auth:getSession, auth:syncToken)');
}
