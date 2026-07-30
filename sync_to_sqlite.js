import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(__dirname, 'database.sqlite');

// Map JSON types to SQLite types
function getSqliteType(value) {
    if (value === null || value === undefined) return 'TEXT';
    if (typeof value === 'boolean') return 'INTEGER'; // SQLite stores booleans as 0 or 1
    if (typeof value === 'number') return 'REAL';
    if (typeof value === 'string') return 'TEXT';
    return 'TEXT'; // For arrays or nested objects (we store as JSON string)
}

async function createTableFromObject(db, tableName, sampleObj) {
    console.log(`[Schema] Generating table schema for '${tableName}'...`);
    const columns = [];
    
    // Auto-incrementing primary key
    columns.push(`_internal_id INTEGER PRIMARY KEY AUTOINCREMENT`);
    
    for (const [key, value] of Object.entries(sampleObj)) {
        // Sanitize column names (lowercase, replace spaces/hyphens with underscores)
        const safeKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const sqliteType = getSqliteType(value);
        columns.push(`"${safeKey}" ${sqliteType}`);
    }

    // Drop table if it exists so we can run this cleanly multiple times
    await db.exec(`DROP TABLE IF EXISTS "${tableName}";`);
    
    const createQuery = `CREATE TABLE "${tableName}" (\n  ${columns.join(',\n  ')}\n);`;
    await db.exec(createQuery);
    console.log(`[Schema] Table '${tableName}' created successfully!`);
}

async function insertData(db, tableName, dataArray) {
    if (!dataArray || dataArray.length === 0) return;
    
    console.log(`[Data] Inserting ${dataArray.length} rows into '${tableName}'...`);
    
    const keys = Object.keys(dataArray[0]);
    const safeKeys = keys.map(k => `"${k.toLowerCase().replace(/[^a-z0-9_]/g, '_')}"`);
    const placeholders = keys.map(() => '?').join(', ');
    
    const insertQuery = `INSERT INTO "${tableName}" (${safeKeys.join(', ')}) VALUES (${placeholders})`;
    
    // Use transaction for massive speed boost
    await db.exec('BEGIN TRANSACTION;');
    
    try {
        const stmt = await db.prepare(insertQuery);
        for (const obj of dataArray) {
            const rowValues = keys.map(key => {
                let val = obj[key];
                if (typeof val === 'boolean') return val ? 1 : 0;
                if (typeof val === 'object' && val !== null) {
                    return JSON.stringify(val); // Convert nested objects/arrays to JSON string
                }
                return val;
            });
            await stmt.run(rowValues);
        }
        await stmt.finalize();
        await db.exec('COMMIT;');
        console.log(`[Data] Successfully inserted into '${tableName}'.`);
    } catch (err) {
        await db.exec('ROLLBACK;');
        console.error(`[Error] Failed to insert into '${tableName}':`, err.message);
    }
}

async function syncToSqlite() {
    console.log("🚀 Starting SQLite Sync Process...");
    
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    console.log(`✅ Connected to SQLite database at ${DB_PATH}`);

    if (!fs.existsSync(DATA_DIR)) {
        console.error("❌ No data directory found!");
        process.exit(1);
    }

    const files = fs.readdirSync(DATA_DIR);

    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        console.log(`\n📄 Processing file: ${file}`);
        const rawData = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
        let jsonData;
        
        try {
            jsonData = JSON.parse(rawData);
        } catch (e) {
            console.error(`⚠️ Skipping ${file} (Invalid JSON)`);
            continue;
        }

        // Strategy to extract the actual array of data based on known API structures
        let targetData = [];
        let tableName = file.replace('.json', '');

        // 1. Procurement APIs (purchase_2026.json)
        if (file.startsWith('purchase_') && jsonData.data && jsonData.data.procurementDetails) {
            targetData = jsonData.data.procurementDetails;
            tableName = `procurement_${file.split('_')[1].split('.')[0]}`; // e.g. procurement_2026
        }
        // 2. Production APIs
        else if (file.startsWith('production_') && jsonData.data) {
            if (Array.isArray(jsonData.data)) targetData = jsonData.data;
            else if (jsonData.data.productionDetails) targetData = jsonData.data.productionDetails;
            else targetData = [jsonData.data]; 
        }
        // 3. Sales APIs
        else if (file.startsWith('sales_') && jsonData.data) {
            if (Array.isArray(jsonData.data)) targetData = jsonData.data;
            else if (jsonData.data.salesDetails) targetData = jsonData.data.salesDetails;
            else targetData = [jsonData.data];
        }
        // 4. Wallet APIs (e.g. wallet_certificate-transaction.json)
        else if (file.startsWith('wallet_') && file !== 'epr_wallet.json') {
            if (jsonData.data) {
                targetData = Array.isArray(jsonData.data) ? jsonData.data : [jsonData.data];
            } else if (Array.isArray(jsonData)) {
                targetData = jsonData;
            } else {
                targetData = [jsonData]; // Dump as single row
            }
        } 
        // 5. Generic Fallback for standard tables
        else if (jsonData.tables && jsonData.tables.length > 0) {
            targetData = [{
                file_source: file,
                raw_text: jsonData.rawText || "",
                tables_dump: JSON.stringify(jsonData.tables)
            }];
        }
        
        if (targetData.length === 0) {
            console.log(`⚠️ No structured data found to insert for ${file}`);
            continue;
        }

        const sampleObj = targetData[0];
        // Clean up the table name (remove dashes)
        tableName = tableName.replace(/-/g, '_');

        try {
            await createTableFromObject(db, tableName, sampleObj);
            await insertData(db, tableName, targetData);
        } catch (err) {
            console.error(`❌ Failed processing table ${tableName}:`, err.message);
        }
    }

    await db.close();
    console.log("\n🎉 All done! Data synced to SQLite database.sqlite file.");
}

syncToSqlite().catch(console.error);
