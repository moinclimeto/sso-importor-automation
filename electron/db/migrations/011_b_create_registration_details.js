export const up = `
  CREATE TABLE IF NOT EXISTS registration_details (
    _internal_id INTEGER PRIMARY KEY AUTOINCREMENT, 
    applicant_type TEXT, 
    sub_applicant_type TEXT
  );
`;
