export const up = `
  ALTER TABLE company_documents ADD COLUMN constitution_of_business TEXT;
  ALTER TABLE company_documents ADD COLUMN address TEXT;
  ALTER TABLE company_documents ADD COLUMN date_of_liability TEXT;
`;
