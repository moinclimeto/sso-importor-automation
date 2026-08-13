const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pwp.db');
db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'new_app%';", [], (err, tables) => {
        if(tables.length === 0) console.log("No tables found.");
        tables.forEach(t => {
            db.all("SELECT * FROM " + t.name, [], (err, rows) => {
                console.log('\n--- Table:', t.name, '---');
                if (rows.length > 0) {
                    const row = rows[0];
                    for (const [key, val] of Object.entries(row)) {
                        console.log(`${key}: ${val === null ? 'NULL' : val}`);
                    }
                }
            });
        });
    });
});
