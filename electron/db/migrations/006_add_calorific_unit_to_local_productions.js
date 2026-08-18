export const up = `
  ALTER TABLE local_productions ADD COLUMN calorific_unit TEXT DEFAULT 'KJ/Kg';
`;
