export const up = `
  ALTER TABLE supplier_master ADD COLUMN legal_name TEXT;
`;

export const down = `
  ALTER TABLE supplier_master DROP COLUMN legal_name;
`;
