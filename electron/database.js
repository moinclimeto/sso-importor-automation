import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let sqliteDb = null;

export async function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'pwp-db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'pwp.sqlite');
  db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

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
  // no-op, handled by SQLite
}

export function getSqliteDb() {
  return sqliteDb;
}
