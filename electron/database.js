import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db = null;
let dbPath = '';

export function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'pwp-db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbPath = path.join(dbDir, 'db.json');
  if (!fs.existsSync(dbPath)) {
    db = { companies: [], purchases: [], sales: [], nextId: 1 };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } else {
    try {
      const raw = fs.readFileSync(dbPath, 'utf8').replace(/^\uFEFF/, '');
      db = JSON.parse(raw);
      if (!Array.isArray(db.companies)) db.companies = [];
      if (!Array.isArray(db.purchases)) db.purchases = [];
      if (!Array.isArray(db.sales)) db.sales = [];
      if (!db.nextId) db.nextId = 1;
    } catch (e) {
      console.error('Failed to read db.json, starting empty:', e?.message);
      db = { companies: [], purchases: [], sales: [], nextId: 1 };
    }
  }
  return db;
}

export function getDb() {
  return db;
}

export function saveDb() {
  if (db && dbPath) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }
}
