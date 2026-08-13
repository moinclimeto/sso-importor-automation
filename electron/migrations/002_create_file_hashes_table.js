export const up = `
  CREATE TABLE IF NOT EXISTS file_hashes (
    hash TEXT PRIMARY KEY NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;
