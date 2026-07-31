import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let dbPath = '';
let sqliteDb = null;

export async function initDatabase() {
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

  // Connect to the scraped SQLite database
  const sqlitePath = path.join(__dirname, '..', 'database.sqlite');
  try {
    sqliteDb = await open({
      filename: sqlitePath,
      driver: sqlite3.Database
    });
    console.log("✅ Connected to SQLite database at", sqlitePath);
  } catch (error) {
    console.error("⚠️ Failed to connect to SQLite (it may not exist yet).", error.message);
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

export function getSqliteDb() {
  return sqliteDb;
}
