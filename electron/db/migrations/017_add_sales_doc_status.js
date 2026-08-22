export const up = async (db) => {
  try {
    await db.exec(`ALTER TABLE sales ADD COLUMN doc_status TEXT DEFAULT 'inbox'`);
    console.log('Added column doc_status to sales');
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('Column doc_status already exists on sales, skipping...');
    } else {
      throw err;
    }
  }
  await db.exec(`UPDATE sales SET doc_status = 'inbox' WHERE doc_status IS NULL OR doc_status = ''`);
};

export const down = ``;
