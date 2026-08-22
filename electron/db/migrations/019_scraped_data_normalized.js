/** Normalized scraped-data tables with stable column names. */

export async function up(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_new_application (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legal_name TEXT,
      trade_name TEXT,
      type_of_business TEXT,
      registered_address TEXT,
      plant_unit_address TEXT,
      company_pan TEXT,
      unit_gst TEXT,
      type_of_company TEXT,
      iec TEXT,
      contact_name TEXT,
      designation TEXT,
      mobile TEXT,
      email TEXT,
      contact_pan TEXT,
      operating_states TEXT,
      has_production_facility TEXT,
      capital_invested_crores TEXT,
      year_of_commencement TEXT,
      products_details_file TEXT,
      packaging_picture_file TEXT,
      pwm_compliance TEXT,
      packaging_thickness_microns TEXT,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scraped_plastic_consumed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_gst TEXT,
      financial_year TEXT NOT NULL,
      rigid_plastic_cat_i_mt REAL,
      flexible_plastic_cat_ii_mt REAL,
      mlp_plastic_cat_iii_mt REAL,
      compostable_plastic_cat_iv_mt REAL,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scraped_procurement_fy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      financial_year TEXT NOT NULL,
      entity_type TEXT,
      category_id TEXT,
      total_quantity_mt REAL,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scraped_sales_fy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      financial_year TEXT NOT NULL,
      entity_type TEXT,
      category_id TEXT,
      total_quantity_mt REAL,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scraped_wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sr_no INTEGER,
      tx_id TEXT,
      amount_mt REAL,
      owner_name TEXT,
      from_user TEXT,
      category TEXT,
      processing_type TEXT,
      transaction_direction TEXT,
      status TEXT,
      generated_at TEXT,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scraped_road_making (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_key TEXT NOT NULL,
      status_code INTEGER,
      table_row_count INTEGER,
      graph_point_count INTEGER,
      scraped_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scraped_plastic_consumed_fy
      ON scraped_plastic_consumed (unit_gst, financial_year);
    CREATE INDEX IF NOT EXISTS idx_scraped_procurement_fy
      ON scraped_procurement_fy (financial_year);
    CREATE INDEX IF NOT EXISTS idx_scraped_wallet_tx_id
      ON scraped_wallet_transactions (tx_id);
  `);
}
