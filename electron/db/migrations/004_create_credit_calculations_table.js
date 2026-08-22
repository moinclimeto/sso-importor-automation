export const up = `
  CREATE TABLE IF NOT EXISTS credit_calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    energy_contribution_percent REAL,
    energy_consumption_mj REAL,
    calorific_value_unit TEXT,
    calorific_value_input REAL,
    calorific_value_kj REAL,
    clinker_produced_tons REAL,
    energy_contribution_mj REAL,
    rdf_burnt_tons REAL,
    plastic_percent REAL,
    potential_tons REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;
