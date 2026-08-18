import path from 'path';
import { app } from 'electron';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs'; // Import fs
import { fileURLToPath } from 'url';

const currentModuleUrl = import.meta.url;
const __dirname = fileURLToPath(new URL('.', currentModuleUrl));

let db = null;
let dbFilePath = '';
export let dbJsonPath = '';

// Path to the database file
function getDbFilePath() {
  return path.join(__dirname, '..', 'sso_importer.db');
}

// Initialize main application database connection
export async function initDatabase(onDbReadyCallback) {
  dbFilePath = getDbFilePath();
  dbJsonPath = path.join(path.dirname(dbFilePath), 'db.json');
  db = await open({
    filename: dbFilePath,
    driver: sqlite3.Database,
  });

  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');

  // Run migrations for the main app.db
  await runMigrations();

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
      const migration = await import('file:///' + path.join(migrationsDir, file));
      console.log(`Applying migration: ${file}`);
      if (typeof migration.up === 'function') {
        await migration.up(db);
      } else {
        await db.exec(migration.up);
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
