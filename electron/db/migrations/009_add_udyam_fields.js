export const up = `
  ALTER TABLE company_documents ADD COLUMN enterprise_type TEXT;
  ALTER TABLE company_documents ADD COLUMN social_category TEXT;
  ALTER TABLE company_documents ADD COLUMN date_of_incorporation TEXT;
  ALTER TABLE company_documents ADD COLUMN date_of_commencement TEXT;
`;
