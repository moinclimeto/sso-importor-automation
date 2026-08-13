export const up = `
  ALTER TABLE company_documents ADD COLUMN industry_category TEXT;
  ALTER TABLE company_documents ADD COLUMN allowed_capacity TEXT;
  ALTER TABLE company_documents ADD COLUMN validity_date TEXT;
`;
