export const up = async (db) => {
  const columnsToAdd = [
    { name: 'entity_type', type: 'TEXT' },
    { name: 'financial_year', type: 'TEXT' },
    { name: 'mobile_number', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    try {
      await db.exec(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to sales`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`Column ${col.name} already exists on sales, skipping...`);
      } else {
        throw err;
      }
    }
  }
};

export const down = ``;
