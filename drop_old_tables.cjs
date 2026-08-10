const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pwp.db');

db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'new_app%' OR name LIKE 'new_application%');", [], (err, tables) => {
        if(tables.length === 0) {
            console.log("No obsolete tables found to delete.");
            db.close();
            return;
        }
        
        let pending = tables.length;
        tables.forEach(t => {
            db.run(`DROP TABLE IF EXISTS "${t.name}"`, (err) => {
                if (err) console.error(`Error dropping ${t.name}:`, err);
                else console.log(`Deleted obsolete table: ${t.name}`);
                
                pending--;
                if (pending === 0) {
                    console.log("All old tables deleted successfully!");
                    db.close();
                }
            });
        });
    });
});
