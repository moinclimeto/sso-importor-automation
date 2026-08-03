export const up = `
  ALTER TABLE companies ADD COLUMN account_number TEXT;
  ALTER TABLE companies ADD COLUMN ifsc_code TEXT;
`;
