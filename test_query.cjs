const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pwp.db');

async function testQuery() {
    return new Promise((resolve) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'new_app%');", [], async (err, tables) => {
            const result = {};
            let pending = tables.length;
            if (pending === 0) return resolve(result);
            
            for (const t of tables) {
                db.all(`SELECT * FROM ${t.name}`, [], (err, rows) => {
                    const cleanRows = rows.map(row => {
                        const { _internal_id, file_source, ...rest } = row;
                        return rest;
                    });
                    
                    if (t.name === 'new_application_part_a' || t.name === 'new_application_part_b' || t.name === 'new_application_part_c') {
                        result[t.name] = cleanRows.length > 0 ? cleanRows[0] : null;
                    } else {
                        result[t.name] = cleanRows;
                    }
                    
                    pending--;
                    if (pending === 0) resolve(result);
                });
            }
        });
    });
}

testQuery().then(res => console.log(JSON.stringify(res, null, 2)));
