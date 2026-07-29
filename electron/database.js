import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db = null;

export function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'pwp-db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'pwp.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createTables();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gstin TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      phone TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      invoice_no TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      vendor_gstin TEXT,
      item_name TEXT NOT NULL,
      hsn_code TEXT,
      quantity REAL NOT NULL,
      unit TEXT DEFAULT 'PCS',
      rate REAL NOT NULL,
      taxable_amount REAL NOT NULL,
      cgst_rate REAL DEFAULT 0,
      sgst_rate REAL DEFAULT 0,
      igst_rate REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      invoice_no TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_gstin TEXT,
      item_name TEXT NOT NULL,
      hsn_code TEXT,
      quantity REAL NOT NULL,
      unit TEXT DEFAULT 'PCS',
      rate REAL NOT NULL,
      taxable_amount REAL NOT NULL,
      cgst_rate REAL DEFAULT 0,
      sgst_rate REAL DEFAULT 0,
      igst_rate REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
  `);
}

export function getDb() {
  return db;
}
