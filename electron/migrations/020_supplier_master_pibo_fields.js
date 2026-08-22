export const up = `
  ALTER TABLE supplier_master ADD COLUMN registration_number TEXT;
  ALTER TABLE supplier_master ADD COLUMN state TEXT;
  ALTER TABLE supplier_master ADD COLUMN pan TEXT;
`;

export const down = `
  ALTER TABLE supplier_master DROP COLUMN pan;
  ALTER TABLE supplier_master DROP COLUMN state;
  ALTER TABLE supplier_master DROP COLUMN registration_number;
`;
