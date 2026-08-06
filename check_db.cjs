const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pwp.db');
db.all("PRAGMA table_info('procurement_details')", (err, rows) => {
    console.log("Columns:", rows);
});
db.all("SELECT _internal_id, file_source, year FROM procurement_details LIMIT 5", (err, rows) => {
    console.log("Rows:", rows);
});
