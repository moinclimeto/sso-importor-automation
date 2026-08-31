import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { getAppDbPath } from '../appPaths.js';

const currentModuleUrl = import.meta.url;
const __dirname = fileURLToPath(new URL('.', currentModuleUrl));

let db = null;
let dbFilePath = '';
let initPromise = null;
export let dbJsonPath = '';

export function getDbFilePath() {
  return dbFilePath || getAppDbPath();
}

export async function initDatabase(onDbReadyCallback) {
  if (db) {
    if (onDbReadyCallback) await onDbReadyCallback(db);
    return db;
  }
  if (initPromise) {
    await initPromise;
    if (onDbReadyCallback) await onDbReadyCallback(db);
    return db;
  }

  initPromise = openAndMigrate(onDbReadyCallback);
  try {
    await initPromise;
    return db;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

async function openAndMigrate(onDbReadyCallback) {
  dbFilePath = getAppDbPath();
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  dbJsonPath = path.join(path.dirname(dbFilePath), 'db.json');
  db = await open({
    filename: dbFilePath,
    driver: sqlite3.Database,
  });

  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec('PRAGMA journal_mode = WAL;');

  // Run migrations for the main app.db
  await runMigrations();
  await ensureCompanyDocumentColumns();

  if (onDbReadyCallback) {
    await onDbReadyCallback(db);
  }

  // Auto-create scraper tables to prevent UI crashes if data isn't synced yet
  await db.exec(`
    CREATE TABLE IF NOT EXISTS epr_dashboard (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT, raw_text TEXT, tables_dump TEXT);
    CREATE TABLE IF NOT EXISTS epr_profile (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT, company_name TEXT, gstin TEXT);
    CREATE TABLE IF NOT EXISTS epr_payment (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE IF NOT EXISTS wallet_wallet_potentials (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE IF NOT EXISTS wallet_certificate_transaction (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE IF NOT EXISTS procurement_details (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, source_year INTEGER);
    CREATE TABLE IF NOT EXISTS sales_details (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER);
    CREATE TABLE IF NOT EXISTS production_details (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER);
    CREATE TABLE IF NOT EXISTS conversion_factor (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE IF NOT EXISTS new_application (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE IF NOT EXISTS registration_details (_internal_id INTEGER PRIMARY KEY AUTOINCREMENT, applicant_type TEXT, sub_applicant_type TEXT, cepr_id TEXT, success_screenshot_path TEXT);
    CREATE TABLE IF NOT EXISTS extractor_data (id INTEGER PRIMARY KEY AUTOINCREMENT, company_name TEXT, gst TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);
}

async function ensureCompanyDocumentColumns() {
  if (!db) return;
  const cols = await db.all('PRAGMA table_info(company_documents)').catch(() => []);
  if (!cols.length) return;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('file_hash')) {
    await db.exec('ALTER TABLE company_documents ADD COLUMN file_hash TEXT');
  }
}

// Get main application database instance
export function getDb() {
  if (!db) {
    throw new Error('Main application database not initialized. Call initDatabase() first.');
  }
  return db;
}

// --- Migrations System ---
const migrationsDir = path.join(__dirname, 'migrations'); // Assuming migrations are in electron/migrations

async function runMigrations() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedMigrations = new Set(
    (await db.all('SELECT name FROM _migrations')).map((row) => row.name)
  );

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  for (const file of migrationFiles) {
    if (!appliedMigrations.has(file)) {
      const migration = await import(pathToFileURL(path.join(migrationsDir, file)).href);
      console.log(`Applying migration: ${file}`);
      if (typeof migration.up === 'function') {
        await migration.up(db);
      } else if (typeof migration.up === 'string') {
        await db.exec(migration.up);
      } else {
        console.warn(`Migration ${file} has no 'up' export. Skipping execution.`);
      }
      await db.run('INSERT INTO _migrations (name) VALUES (?)', file);
    }
  }
}

// Placeholder for saveDb
export async function saveDb() {
  // In a SQLite context, changes are saved via explicit INSERT/UPDATE/DELETE. No global saveDb needed.
  // This function might be removed or adapted depending on final data access patterns.
  // For now, let's keep a placeholder if it's called elsewhere and expects to exist.
}
