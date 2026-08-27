/**
 * Browser fallback when Electron preload (window.pwp) is unavailable.
 * Uses localStorage so Company Profile works in Vite browser too.
 */
const KEY = 'pwp_browser_db';
const SETTINGS_KEY = 'pwp_browser_settings';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { companies: [], purchases: [], sales: [], nextId: 1 };
    const db = JSON.parse(raw);
    return {
      companies: Array.isArray(db.companies) ? db.companies : [],
      purchases: Array.isArray(db.purchases) ? db.purchases : [],
      sales: Array.isArray(db.sales) ? db.sales : [],
      nextId: db.nextId || 1,
    };
  } catch {
    return { companies: [], purchases: [], sales: [], nextId: 1 };
  }
}

function write(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getApi() {
  if (typeof window !== 'undefined' && window.pwp) return window.pwp;

  return {
    companies: {
      getAll: async () => {
        const db = read();
        return [...db.companies].sort((a, b) => a.name.localeCompare(b.name));
      },
      add: async (data) => {
        const db = read();
        const item = { id: db.nextId++, ...data, created_at: new Date().toISOString() };
        db.companies.push(item);
        write(db);
        return item;
      },
      update: async (data) => {
        const db = read();
        const idx = db.companies.findIndex((c) => c.id === data.id);
        if (idx !== -1) {
          db.companies[idx] = { ...db.companies[idx], ...data };
          write(db);
        }
        return { success: true };
      },
      delete: async (id) => {
        const db = read();
        db.companies = db.companies.filter((c) => c.id !== id);
        write(db);
        return { success: true };
      },
    },
    purchases: {
      getAll: async () => read().purchases,
      add: async (data) => {
        const db = read();
        const item = { id: db.nextId++, ...data, created_at: new Date().toISOString() };
        db.purchases.push(item);
        write(db);
        return item;
      },
      update: async () => ({ success: true }),
      delete: async (id) => {
        const db = read();
        db.purchases = db.purchases.filter((p) => p.id !== id);
        write(db);
        return { success: true };
      },
      getSummary: async () => ({ total_records: 0 }),
    },
    sales: {
      getAll: async () => read().sales,
      add: async (data) => {
        const db = read();
        const globalBank = readSettings().global_bank_details || {};
        const item = {
          id: db.nextId++,
          ...data,
          account_number: data.account_number || globalBank.account_number || '',
          ifsc_code: data.ifsc_code || globalBank.ifsc_code || '',
          created_at: new Date().toISOString(),
        };
        db.sales.push(item);
        write(db);
        return item;
      },
      update: async () => ({ success: true }),
      delete: async (id) => {
        const db = read();
        db.sales = db.sales.filter((s) => s.id !== id);
        write(db);
        return { success: true };
      },
      getSummary: async () => ({ total_records: 0 }),
      applyBankDetailsToAll: async ({ account_number, ifsc_code } = {}) => {
        const db = read();
        let updated = 0;
        db.sales = db.sales.map((row) => {
          updated += 1;
          return { ...row, account_number, ifsc_code };
        });
        write(db);
        return { success: true, updated };
      },
    },
    settings: {
      get: async (key) => readSettings()[key] ?? null,
      set: async (key, value) => {
        const settings = readSettings();
        settings[key] = value;
        writeSettings(settings);
        return true;
      },
    },
    scraper: {
      runEpr: async () => ({ success: false, error: 'Not available in browser' }),
      getProfile: async () => null,
      getDashboardCards: async () => null,
      getPayments: async () => [],
      getWallet: async () => [],
      getWalletHistory: async () => [],
      getProcurement: async () => [],
      getSales: async () => [],
      getProduction: async () => [],
    }
  };
}
