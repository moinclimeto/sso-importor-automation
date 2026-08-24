export const up = async (db) => {
  const purchaseCols = [
    { name: 'procurement_source', type: 'TEXT' },
  ];
  for (const col of purchaseCols) {
    try {
      await db.exec(`ALTER TABLE purchases ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to purchases`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`Column ${col.name} already exists on purchases, skipping...`);
      } else {
        throw err;
      }
    }
  }

  const packagingCols = [
    { name: 'linked_match_keys', type: 'TEXT' },
  ];
  for (const col of packagingCols) {
    try {
      await db.exec(`ALTER TABLE packaging_master ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to packaging_master`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`Column ${col.name} already exists on packaging_master, skipping...`);
      } else {
        throw err;
      }
    }
  }

  const regCols = [
    { name: 'importer_3a_json', type: 'TEXT' },
    { name: 'importer_3a_status', type: 'TEXT' },
    { name: 'importer_3b_json', type: 'TEXT' },
  ];
  for (const col of regCols) {
    try {
      await db.exec(`ALTER TABLE registration_details ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to registration_details`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`Column ${col.name} already exists on registration_details, skipping...`);
      } else {
        throw err;
      }
    }
  }
};

export const down = ``;
