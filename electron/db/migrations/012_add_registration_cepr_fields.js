export const up = `
  ALTER TABLE registration_details ADD COLUMN cepr_id TEXT;
  ALTER TABLE registration_details ADD COLUMN success_screenshot_path TEXT;
`;
