export const up = `
  ALTER TABLE registration_details ADD COLUMN contact_name TEXT;
  ALTER TABLE registration_details ADD COLUMN contact_designation TEXT;
  ALTER TABLE registration_details ADD COLUMN contact_mobile TEXT;
  ALTER TABLE registration_details ADD COLUMN contact_email TEXT;
`;
