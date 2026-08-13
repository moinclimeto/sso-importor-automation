export const up = `
  ALTER TABLE company_documents ADD COLUMN billing_month TEXT;
  ALTER TABLE company_documents ADD COLUMN amount REAL;
  ALTER TABLE company_documents ADD COLUMN units_consumed REAL;
  ALTER TABLE company_documents ADD COLUMN due_date TEXT;
  ALTER TABLE company_documents ADD COLUMN provider TEXT;
`;
