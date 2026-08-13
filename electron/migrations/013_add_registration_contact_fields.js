export const up = `
  ALTER TABLE registration_details ADD COLUMN email TEXT;
  ALTER TABLE registration_details ADD COLUMN mobile TEXT;
  ALTER TABLE registration_details ADD COLUMN password TEXT;
  ALTER TABLE registration_details ADD COLUMN form_data_json TEXT;
`;
