export const up = `
  CREATE TABLE IF NOT EXISTS company_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type TEXT,
    document_number TEXT,
    entity_name TEXT,
    issue_date TEXT,
    file_path TEXT,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;
