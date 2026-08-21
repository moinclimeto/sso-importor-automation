const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const MIGRATION_019 = `
    CREATE TABLE IF NOT EXISTS scraped_new_application (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legal_name TEXT, trade_name TEXT, type_of_business TEXT,
      registered_address TEXT, plant_unit_address TEXT, company_pan TEXT,
      unit_gst TEXT, type_of_company TEXT, iec TEXT, contact_name TEXT,
      designation TEXT, mobile TEXT, email TEXT, contact_pan TEXT,
      operating_states TEXT, has_production_facility TEXT,
      capital_invested_crores TEXT, year_of_commencement TEXT,
      products_details_file TEXT, packaging_picture_file TEXT,
      pwm_compliance TEXT, packaging_thickness_microns TEXT,
      scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scraped_plastic_consumed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_gst TEXT, financial_year TEXT NOT NULL,
      rigid_plastic_cat_i_mt REAL, flexible_plastic_cat_ii_mt REAL,
      mlp_plastic_cat_iii_mt REAL, compostable_plastic_cat_iv_mt REAL,
      scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scraped_procurement_fy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      financial_year TEXT NOT NULL, entity_type TEXT, category_id TEXT,
      total_quantity_mt REAL, scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scraped_sales_fy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      financial_year TEXT NOT NULL, entity_type TEXT, category_id TEXT,
      total_quantity_mt REAL, scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scraped_wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sr_no INTEGER, tx_id TEXT, amount_mt REAL, owner_name TEXT,
      from_user TEXT, category TEXT, processing_type TEXT,
      transaction_direction TEXT, status TEXT, generated_at TEXT,
      scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scraped_road_making (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_key TEXT NOT NULL, status_code INTEGER,
      table_row_count INTEGER, graph_point_count INTEGER,
      scraped_at TEXT NOT NULL
    );
`;

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @deprecated Legacy one-time import from old JSON files on disk. */
function loadPlaywrightDataDir(dir) {
  const names = [
    'new_application_data.json',
    'procurement_api_data.json',
    'sales_api_data.json',
    'wallet_api_data.json',
    'road_making_api_data.json',
  ];
  const files = {};
  for (const name of names) {
    const data = readJsonIfExists(path.join(dir, name));
    if (data) files[name.replace('.json', '')] = data;
  }
  if (files.new_application_data) return files;
  const legacy = readJsonIfExists(path.join(dir, '..', 'data', 'epr_new_application.json'));
  if (legacy?.newApplication) files.new_application_data = legacy.newApplication;
  return files;
}

function resolveRawFiles(options = {}) {
  if (options.data) {
    const d = options.data;
    return {
      new_application_data: d.new_application_data ?? d.newApplication ?? null,
      procurement_api_data: d.procurement_api_data ?? null,
      sales_api_data: d.sales_api_data ?? null,
      wallet_api_data: d.wallet_api_data ?? null,
      road_making_api_data: d.road_making_api_data ?? null,
    };
  }

  const rootDir = options.rootDir || process.cwd();
  const dataDir = options.dataDir || path.join(rootDir, 'playwright_data');
  return loadPlaywrightDataDir(dataDir);
}

async function openAppDatabase(rootDir) {
  const dbPath = path.join(rootDir, 'sso_importer.db');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec(MIGRATION_019);
  return db;
}

async function insertRows(db, table, columns, rows) {
  if (!rows.length) return 0;
  const cols = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = await db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`);
  for (const row of rows) {
    await stmt.run(columns.map((c) => row[c] ?? null));
  }
  await stmt.finalize();
  return rows.length;
}

/**
 * Normalize in-memory scraped payload and persist directly to SQLite.
 * Does not write any JSON files to the project.
 */
async function persistScrapedData(options = {}) {
  const rootDir = options.rootDir || process.cwd();

  const { normalizeAllScrapedFiles } = await import(
    path.join(rootDir, 'shared', 'scrapedDataNormalize.js').replace(/\\/g, '/').replace(/^/, 'file:///')
  );

  const rawFiles = resolveRawFiles(options);
  const hasAnyData = Object.values(rawFiles).some(Boolean);
  if (!hasAnyData) {
    console.warn('⚠️ No scraped data to persist (empty payload).');
    return { normalized: null };
  }

  const normalized = normalizeAllScrapedFiles({
    new_application_data: rawFiles.new_application_data,
    procurement_api_data: rawFiles.procurement_api_data,
    sales_api_data: rawFiles.sales_api_data,
    wallet_api_data: rawFiles.wallet_api_data,
    road_making_api_data: rawFiles.road_making_api_data,
  });

  const db = await openAppDatabase(rootDir);
  const scrapedAt = normalized.scraped_at;

  try {
    await db.run('DELETE FROM scraped_new_application');
    await db.run('DELETE FROM scraped_plastic_consumed');
    await db.run('DELETE FROM scraped_procurement_fy');
    await db.run('DELETE FROM scraped_sales_fy');
    await db.run('DELETE FROM scraped_wallet_transactions');
    await db.run('DELETE FROM scraped_road_making');

    const app = normalized.new_application.application;
    if (app && Object.values(app).some(Boolean)) {
      await insertRows(db, 'scraped_new_application', [...Object.keys(app)], [app]);
    }

    const plastic = normalized.new_application.plasticConsumed || [];
    if (plastic.length) {
      await insertRows(db, 'scraped_plastic_consumed', [...Object.keys(plastic[0])], plastic);
    }

    if (normalized.procurement_summary.length) {
      const procCols = ['financial_year', 'entity_type', 'category_id', 'total_quantity_mt', 'scraped_at'];
      await insertRows(
        db,
        'scraped_procurement_fy',
        procCols,
        normalized.procurement_summary.map((r) => ({ ...r, scraped_at: scrapedAt })),
      );
    }

    if (normalized.sales_summary.length) {
      const salesCols = ['financial_year', 'entity_type', 'category_id', 'total_quantity_mt', 'scraped_at'];
      await insertRows(
        db,
        'scraped_sales_fy',
        salesCols,
        normalized.sales_summary.map((r) => ({ ...r, scraped_at: scrapedAt })),
      );
    }

    if (normalized.wallet_transactions.length) {
      const wCols = [
        'sr_no', 'tx_id', 'amount_mt', 'owner_name', 'from_user', 'category',
        'processing_type', 'transaction_direction', 'status', 'generated_at', 'scraped_at',
      ];
      await insertRows(
        db,
        'scraped_wallet_transactions',
        wCols,
        normalized.wallet_transactions.map((r) => ({ ...r, scraped_at: scrapedAt })),
      );
    }

    if (normalized.road_making.length) {
      const rCols = ['period_key', 'status_code', 'table_row_count', 'graph_point_count', 'scraped_at'];
      await insertRows(
        db,
        'scraped_road_making',
        rCols,
        normalized.road_making.map((r) => ({ ...r, scraped_at: scrapedAt })),
      );
    }

    console.log('✅ Scraped data saved directly to SQLite (sso_importer.db)');
    return { normalized };
  } finally {
    await db.close();
  }
}

module.exports = { persistScrapedData, loadPlaywrightDataDir };
