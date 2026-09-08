import { createContext, useContext, useEffect, useState } from 'react';
import DataService from '../config/DataService.js';
import { Api } from '../config/apiEndpoints.js';
import { setRendererUser, captureRendererException } from '../monitoring/initRenderer.js';

const AuthContext = createContext(null);

function readStoredUser() {
  const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistSession(token, userData) {
  localStorage.setItem('token', token);
  localStorage.setItem('currentUser', JSON.stringify(userData));
  localStorage.removeItem('user');
  window.dispatchEvent(new CustomEvent('climeto:user-changed', { detail: { user: userData } }));
}

function clearPersistedSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('user');
  window.dispatchEvent(new CustomEvent('climeto:user-changed', { detail: { user: null } }));
}

async function syncTokenToMain(token, userData) {
  if (!token) return;

  if (window.pwp?.auth?.syncToken) {
    try {
      await window.pwp.auth.syncToken(token);
      return;
    } catch (err) {
      console.warn('auth:syncToken failed', err);
    }
  }

  if (window.pwp?.settings?.set && userData) {
    try {
      await window.pwp.settings.set('climeto_user_session', {
        token,
        user: userData,
        loggedInAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Failed to persist session via settings IPC', err);
    }
  }
}

async function loginViaElectron(payload) {
  if (!window.pwp?.auth?.login) return null;
  try {
    return await window.pwp.auth.login(payload);
  } catch (err) {
    if (/No handler registered/i.test(String(err?.message || err))) {
      console.warn('auth:login IPC unavailable — falling back to HTTP login. Restart Electron to enable IPC auth.');
      return null;
    }
    throw err;
  }
}

async function loginViaHttp(payload) {
  const body = {
    email: payload.email,
    password: payload.password,
  };
  if (payload.force) body.force = true;

  try {
    const res = await DataService.post(Api.LOGIN, body);
    return {
      success: true,
      token: res.data.token,
      user: mapHttpUser(res.data.user),
      message: res.data.msg,
    };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    if (status === 409 && data?.requiresConfirmation) {
      return {
        success: false,
        requiresConfirmation: true,
        message:
          data?.msg
          || data?.message
          || 'Already logged in elsewhere. Log out from that device and continue here?',
      };
    }
    return {
      success: false,
      error: data?.msg || data?.message || data?.error || err.message || 'Login failed.',
    };
  }
}

function mapHttpUser(apiUser = {}) {
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        if (window.pwp?.auth?.getSession) {
          let session = null;
          for (let attempt = 0; attempt < 20; attempt += 1) {
            try {
              session = await window.pwp.auth.getSession();
              break;
            } catch (err) {
              const waiting = /No handler registered/i.test(String(err?.message || err));
              if (!waiting || attempt === 19) throw err;
              await new Promise((resolve) => setTimeout(resolve, 150));
            }
          }
          if (!cancelled && session?.success && session.token && session.user) {
            persistSession(session.token, session.user);
            setUser(session.user);
            setRendererUser(session.user);
            return;
          }
        }

        const token = localStorage.getItem('token');
        const storedUser = readStoredUser();
        if (!cancelled && token && storedUser) {
          await syncTokenToMain(token, storedUser);
          setUser(storedUser);
          setRendererUser(storedUser);
        }
      } catch (err) {
        console.error('Failed to restore auth session', err);
        setRendererUser(null);
        captureRendererException(err, { type: 'auth-restore' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (token, userData) => {
    persistSession(token, userData);
    syncTokenToMain(token, userData);
    setUser(userData);
    setRendererUser(userData);
  };

  const loginWithCredentials = async ({ email, password, force = false } = {}) => {
    const payload = { email, password, force };
    const result = (await loginViaElectron(payload)) ?? (await loginViaHttp(payload));
    if (result?.success && result.token && result.user) {
      login(result.token, result.user);
    }
    return result;
  };

  const logout = async () => {
    try {
      await window.pwp?.auth?.logout?.();
    } catch (err) {
      console.warn('Logout IPC failed', err);
    }
    clearPersistedSession();
    setUser(null);
    setRendererUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginWithCredentials,
        logout,
        isLoggedIn: !!user,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
