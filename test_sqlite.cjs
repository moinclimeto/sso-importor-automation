const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  console.log("Tables:", rows);
});
db.all("SELECT * FROM epr_dashboard LIMIT 1", (err, rows) => {
  console.log("Dashboard:", rows, "Error:", err);
});
