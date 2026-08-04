export const up = `
  ALTER TABLE local_productions ADD COLUMN conversion_factor REAL;
  ALTER TABLE local_productions ADD COLUMN calorific_value REAL;
  ALTER TABLE local_productions ADD COLUMN plastic_percent REAL;
`;
