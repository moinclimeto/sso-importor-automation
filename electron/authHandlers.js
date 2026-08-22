import { ipcMain } from 'electron';
import { getDb } from './database.js';
import { setClimetoSessionToken } from './climetoApiConfig.js';
import {
  getClimetoSession,
  loginClimeto,
  logoutClimeto,
  restoreClimetoSession,
} from './authService.js';

let authHandlersRegistered = false;

export function registerAuthHandlers() {
  if (authHandlersRegistered) return;
  authHandlersRegistered = true;

  ipcMain.handle('auth:login', async (_, payload = {}) => {
    try {
      const db = getDb();
      return await loginClimeto(db, payload);
    } catch (err) {
      console.error('auth:login error', err);
      return { success: false, error: err.message || 'Login failed.' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      const db = getDb();
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

  restoreClimetoSession(getDb()).catch((err) => {
    console.warn('Failed to restore Climeto session on startup', err.message);
  });

  console.log('[auth] IPC handlers registered (auth:login, auth:logout, auth:getSession, auth:syncToken)');
}
