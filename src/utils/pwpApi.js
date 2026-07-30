/**
 * Browser fallback when Electron preload (window.pwp) is unavailable.
 * Uses localStorage so Company Profile works in Vite browser too.
 */
const KEY = 'pwp_browser_db';

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
        const item = { id: db.nextId++, ...data, created_at: new Date().toISOString() };
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
    },
  };
}
