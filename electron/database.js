import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import Database from 'better-sqlite3';

let db = null;

export function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'pwp-db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'pwp.sqlite');
  
  db = new Database(dbPath, { verbose: null });
  
  // Enable WAL mode for high concurrency
  db.pragma('journal_mode = WAL');

  // Initialize tables
  db.exec(`
        CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gstin TEXT,
      state TEXT,
      address TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      invoice_no TEXT,
      invoice_date TEXT,
      data TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      invoice_no TEXT,
      invoice_date TEXT,
      data TEXT,
      created_at TEXT
    );
  `);

  return db;
}

export function getDb() {
  return db;
}

export function saveDb() {
  // no-op, handled by SQLite
}
