export const up = async (db) => {
  const columns = [
    { name: 'doc_status', type: "TEXT DEFAULT 'inbox'" },
    { name: 'irn_no', type: 'TEXT' },
    { name: 'account_number', type: 'TEXT' },
    { name: 'ifsc_code', type: 'TEXT' },
    { name: 'conversion_factor', type: 'REAL' },
  ];

  for (const col of columns) {
    try {
      await db.exec(`ALTER TABLE purchases ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to purchases`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`Column ${col.name} already exists, skipping...`);
      } else {
        throw err;
      }
    }
  }

  await db.exec(`UPDATE purchases SET doc_status = 'inbox' WHERE doc_status IS NULL OR doc_status = ''`);
};

export const down = ``;
