export const up = `
  CREATE TABLE IF NOT EXISTS local_productions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    from_date TEXT,
    to_date TEXT,
    clinker_production REAL,
    energy_percentage REAL,
    energy_contribution_mj REAL,
    qualifying_feed_mt REAL,
    cat_i REAL,
    cat_ii REAL,
    cat_iii REAL,
    cat_iv REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
  );
`;
