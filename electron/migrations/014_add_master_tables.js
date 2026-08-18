export const up = `
  CREATE TABLE IF NOT EXISTS supplier_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    gst_number TEXT NOT NULL,
    trade_name TEXT,
    address TEXT,
    mobile TEXT,
    entity_type TEXT,
    registration_type TEXT,
    source TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_master_company_gst 
  ON supplier_master(company_id, gst_number);

  CREATE TABLE IF NOT EXISTS packaging_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    list_type TEXT NOT NULL,
    product_description TEXT,
    product_match_key TEXT NOT NULL,
    hsn TEXT,
    uom TEXT,
    supplier_gst TEXT,
    supplier_name TEXT,
    plastic_category TEXT,
    plastic_material TEXT,
    other_plastic_material TEXT,
    cat1 TEXT,
    recycled_percent TEXT,
    conversion_factor_id INTEGER,
    cf_base_source TEXT,
    conversion_factor REAL,
    cf_date_from TEXT,
    cf_date_to TEXT,
    total_quantity TEXT,
    value_in_mt REAL,
    match_type TEXT,
    source TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_packaging_master_company_match_key 
  ON packaging_master(company_id, list_type, product_match_key);
`;

export const down = `
  DROP TABLE IF EXISTS packaging_master;
  DROP TABLE IF EXISTS supplier_master;
`;
