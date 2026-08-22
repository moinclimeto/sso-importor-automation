export const up = async (db) => {
  const columnsToAdd = [
    { name: 'plastic_type', type: 'TEXT' },
    { name: 'recycled_plastic_percent', type: 'REAL' },
    { name: 'country', type: 'TEXT' },
    { name: 'registration_type', type: 'TEXT' },
    { name: 'entity_type', type: 'TEXT' },
    { name: 'financial_year', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
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
};

export const down = `
`;
