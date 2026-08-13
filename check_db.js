const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pwp.db');

db.serialize(() => {
    console.log('--- TABLES IN DB ---');
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'new_app%';", [], (err, tables) => {
        if (err) return console.error(err);
        
        let pending = tables.length;
        if (pending === 0) console.log("No new_app tables found.");
        
        tables.forEach(t => {
            db.all("SELECT * FROM " + t.name, [], (err, rows) => {
                if (err) return console.error(err);
                console.log('\n--- Table:', t.name, '---');
                console.log('Rows:', rows.length);
                if (rows.length > 0) console.log(JSON.stringify(rows[0], null, 2));
                
                pending--;
                if (pending === 0) db.close();
            });
        });
    });
});
