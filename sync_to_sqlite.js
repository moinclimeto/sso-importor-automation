import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(__dirname, 'pwp.db');

// Map JSON types to SQLite types
function getSqliteType(value) {
    if (value === null || value === undefined) return 'TEXT';
    if (typeof value === 'boolean') return 'INTEGER'; // SQLite stores booleans as 0 or 1
    if (typeof value === 'number') return 'REAL';
    if (typeof value === 'string') return 'TEXT';
    return 'TEXT'; // For arrays or nested objects (we store as JSON string)
}

let createdTables = new Set();

async function createTableFromObject(db, tableName, sampleObj) {
    if (createdTables.has(tableName)) {
        return; // Already created during this sync run
    }

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

    // We no longer drop the table to prevent deleting existing data
    const createQuery = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columns.join(',\n  ')}\n);`;
    await db.exec(createQuery);
    createdTables.add(tableName);
    console.log(`[Schema] Table '${tableName}' created successfully!`);
}

async function insertData(db, tableName, dataArray, sourceFile) {
    if (!dataArray || dataArray.length === 0) return;
    
    console.log(`[Data] Inserting ${dataArray.length} rows into '${tableName}'...`);
    
    // Collect all possible keys across all objects in dataArray to ensure no columns are missing
    const allKeysSet = new Set();
    for (const obj of dataArray) {
        for (const key of Object.keys(obj)) {
            allKeysSet.add(key);
        }
    }
    const allKeys = Array.from(allKeysSet);
    const safeKeys = allKeys.map(k => `"${k.toLowerCase().replace(/[^a-z0-9_]/g, '_')}"`);
    const placeholders = allKeys.map(() => '?').join(', ');
    
    // Dynamically ensure all columns exist
    for (const safeKey of safeKeys) {
        await db.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${safeKey} TEXT;`).catch(() => {});
    }
    
    const insertQuery = `INSERT INTO "${tableName}" (${safeKeys.join(', ')}) VALUES (${placeholders})`;
    
    // Use transaction for massive speed boost
    await db.exec('BEGIN TRANSACTION;');
    
    try {
        if (sourceFile) {
            // Delete only records that came from this specific file to prevent duplicating data
            await db.run(`DELETE FROM "${tableName}" WHERE file_source = ?`, sourceFile).catch(() => {});
        }

        const stmt = await db.prepare(insertQuery);
        for (const obj of dataArray) {
            const rowValues = allKeys.map(key => {
                const val = obj[key];
                if (val === undefined || val === null) return null;
                if (typeof val === 'object') return JSON.stringify(val);
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

async function syncToSqlite(memoryDataMap = null) {
    console.log("🚀 Starting SQLite Sync Process...");
    
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    console.log(`✅ Connected to SQLite database at ${DB_PATH}`);

    let fileList = [];
    if (memoryDataMap) {
        fileList = Object.keys(memoryDataMap);
    } else {
        if (!fs.existsSync(DATA_DIR)) {
            console.error("❌ No data directory found!");
            process.exit(1);
        }
        fileList = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    }

    for (const file of fileList) {
        console.log(`\n📄 Processing file: ${file}`);
        
        let jsonData;
        if (memoryDataMap) {
            jsonData = memoryDataMap[file];
        } else {
            const rawData = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
            try {
                jsonData = JSON.parse(rawData);
            } catch (e) {
                console.error(`⚠️ Skipping ${file} (Invalid JSON)`);
                continue;
            }
        }

        // Strategy to extract the actual array of data based on known API structures
        let tablesToProcess = []; // Array of { tableName, targetData }
        let targetData = [];
        let tableName = file.replace('.json', '');

        // Extract year from filename if present (e.g. sales_2025.json -> 2025)
        const yearMatch = file.match(/_(\d{4})\.json$/);
        const dataYear = yearMatch ? yearMatch[1] : null;

        // Recursive function to flatten deeply nested JSON objects
        function flattenObject(ob) {
            var toReturn = {};
            for (var i in ob) {
                if (!ob.hasOwnProperty(i)) continue;
                if ((typeof ob[i]) == 'object' && ob[i] !== null && !Array.isArray(ob[i])) {
                    var flatObject = flattenObject(ob[i]);
                    for (var x in flatObject) {
                        if (!flatObject.hasOwnProperty(x)) continue;
                        toReturn[i + '_' + x] = flatObject[x];
                    }
                } else {
                    toReturn[i] = ob[i];
                }
            }
            return toReturn;
        }

        // 1. Procurement APIs (purchase_2026.json)
        if (file.startsWith('purchase_')) {
            if (jsonData.data && jsonData.data.list) {
                targetData = jsonData.data.list;
            } else if (jsonData.data && !Array.isArray(jsonData.data) && jsonData.data.procurementDetails) {
                targetData = jsonData.data.procurementDetails;
            } else if (jsonData.data && Array.isArray(jsonData.data)) {
                targetData = jsonData.data;
            } else if (Array.isArray(jsonData)) {
                targetData = jsonData;
            }
            tableName = `procurement_details`;
        }
        // 2. Production APIs
        else if (file.startsWith('production_')) {
            if (jsonData.data) {
                if (Array.isArray(jsonData.data)) targetData = jsonData.data;
                else if (jsonData.data.productionDetails) targetData = jsonData.data.productionDetails;
                else if (jsonData.data.tableData) targetData = jsonData.data.tableData;
                else targetData = [jsonData.data]; 
            } else if (Array.isArray(jsonData)) {
                targetData = jsonData;
            }
            tableName = `production_details`;
        }
        // 3. Sales APIs
        else if (file.startsWith('sales_')) {
            if (jsonData.data) {
                if (Array.isArray(jsonData.data)) targetData = jsonData.data;
                else if (jsonData.data.salesDetails) targetData = jsonData.data.salesDetails;
                else if (jsonData.data.data && Array.isArray(jsonData.data.data)) targetData = jsonData.data.data;
                else targetData = [jsonData.data];
            } else if (Array.isArray(jsonData)) {
                targetData = jsonData;
            }
            tableName = `sales_details`;
            
            // For Sales, productionId is a dictionary keyed by ID. We need to expand it into an array of rows.
            let expandedSales = [];
            targetData.forEach(row => {
                let mappedRow = { ...row };
                if (mappedRow.registerType === 2) {
                    mappedRow.registration_type_mapped = 'Un-Registered';
                    mappedRow.entity_type_mapped = '-';
                } else if (mappedRow.registerType === 1) {
                    mappedRow.registration_type_mapped = 'Registered';
                    mappedRow.entity_type_mapped = 'Producer';
                }

                if (mappedRow.productionId && typeof mappedRow.productionId === 'object' && !Array.isArray(mappedRow.productionId)) {
                    for (const key in mappedRow.productionId) {
                        let newRow = { ...mappedRow, productionId: mappedRow.productionId[key] };
                        expandedSales.push(newRow);
                    }
                } else {
                    expandedSales.push(mappedRow);
                }
            });
            targetData = expandedSales;
        }
        
        // Final pass: Left intentionally blank, files remain in their original schema
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
        // 5. EPR Dashboard
        else if (file === 'epr_dashboard.json') {
            let parsed = { file_source: file };
            
            if (jsonData.cards) {
                for (const card of jsonData.cards) {
                    const lines = card.split('\n').map(l => l.trim()).filter(l => l && l !== '!' && l !== 'View Details');
                    const title = lines[0];

                    if (title === 'Annual Filings') {
                        for (let i = 1; i < lines.length; i++) {
                            if (lines[i] === 'AR Window Status') parsed.ar_window_status = lines[i+1];
                            if (lines[i] === 'Due Date') parsed.ar_due_date = lines[i+1];
                            if (lines[i] === 'AR Filing Status') parsed.ar_filing_status = lines[i+1];
                        }
                    }
                    else if (title === 'Wallet') {
                        for (let i = 1; i < lines.length; i++) {
                            if (lines[i] === 'Total Available Potential (in MT)') parsed.wallet_available_potential_mt = parseFloat(lines[i+1]) || 0;
                            if (lines[i] === 'Consolidated Certificates Value (in MT)') parsed.wallet_consolidated_certificates_mt = parseFloat(lines[i+1]) || 0;
                        }
                    }
                    else if (title === 'Trade') {
                        for (let i = 1; i < lines.length; i++) {
                            if (lines[i] === 'Total certificates available for trade') parsed.trade_available_certificates = parseFloat(lines[i+1]) || 0;
                            if (lines[i] === 'Total certificate value hold for trading (MT)') parsed.trade_hold_certificates_mt = parseFloat(lines[i+1]) || 0;
                        }
                    }
                    else if (title === 'Environment Compensation') {
                        for (let i = 1; i < lines.length; i++) {
                            if (lines[i] === 'Total Environment Composition Levied') parsed.ec_levied = lines[i+1];
                            if (lines[i] === 'Paid') parsed.ec_paid = lines[i+1];
                            if (lines[i] === 'Pending') parsed.ec_pending = lines[i+1];
                        }
                    }
                    else if (title === 'Grievance Raised') {
                        for (let i = 1; i < lines.length; i++) {
                            if (lines[i] === 'Total Grievance Raised (in Number)') parsed.grievance_raised = parseInt(lines[i+1]) || 0;
                            if (lines[i] === 'Pending') parsed.grievance_pending = parseInt(lines[i+1]) || 0;
                            if (lines[i] === 'Resolved') parsed.grievance_resolved = parseInt(lines[i+1]) || 0;
                        }
                    }
                }
            }

            if (jsonData.rawText) {
                const lines = jsonData.rawText.split('\n').map(l => l.trim()).filter(l => l);
                const cpcbIdx = lines.findIndex(l => l.includes('Central Pollution Control Board'));
                if (cpcbIdx !== -1 && lines.length > cpcbIdx + 1) {
                    parsed.company_name = lines[cpcbIdx + 1];
                }
            }
            
            // Keep the tables_dump just in case we still want the Category Potentials table
            parsed.tables_dump = JSON.stringify(jsonData.tables_dump || jsonData.tables || []);
            
            targetData = [parsed];
        }
        // 5.5 EPR Profile (Sync into companies table)
        else if (file === 'epr_profile.json') {
            if (jsonData.company_name && jsonData.gstin) {
                targetData = [jsonData];
                tableName = 'companies'; // Explicitly set table name to companies
                
                // For companies, we want to UPSERT based on gstin
                const existingCompany = await db.get('SELECT id FROM companies WHERE gstin = ?', jsonData.gstin);
                if (existingCompany) {
                    await db.run('UPDATE companies SET name = ? WHERE gstin = ?', jsonData.company_name, jsonData.gstin);
                    console.log(`[Data] Updated existing company: ${jsonData.company_name}`);
                } else {
                    await db.run('INSERT INTO companies (name, gstin) VALUES (?, ?)', jsonData.company_name, jsonData.gstin);
                    console.log(`[Data] Inserted new company: ${jsonData.company_name}`);
                }
                
                console.log(`[Data] Successfully processed ${file}.`);
                continue; // Skip the generic table creation for this file since we manually handled it
            }
        }
        // 5.6 Conversion Factor
        else if (file === 'conversion_factor.json') {
            if (Array.isArray(jsonData)) {
                targetData = jsonData;
            }
        }
        // 5.7 Inventory
        else if (file === 'inventory.json') {
            if (Array.isArray(jsonData)) {
                targetData = jsonData;
            }
        }
        // 5.8 New Application
        else if (file === 'epr_new_application.json') {
            const parts = {
                'part_a': jsonData.part_a || {},
                'part_b': jsonData.part_b || {},
                'part_c': jsonData.part_c || {}
            };
            
            for (const [partName, partData] of Object.entries(parts)) {
                if (Object.keys(partData).length === 0) continue;
                
                let partObj = { ...partData };
                
                // Extract any arrays into separate tables
                for (const key of Object.keys(partObj)) {
                    let val = partObj[key];
                    try {
                        if (typeof val === 'string' && val.startsWith('[')) {
                            val = JSON.parse(val);
                        }
                    } catch(e) {}
                    
                    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
                        // Queue it as a separate SQLite table with part prefix
                        tablesToProcess.push({
                            tableName: `new_app_${partName}_${key.replace(/[^a-z0-9_]/g, '_').substring(0, 30)}`,
                            targetData: val
                        });
                        // Remove from main table to keep it clean
                        delete partObj[key];
                    }
                }

                if (Object.keys(partObj).length > 0) {
                    tablesToProcess.push({
                        tableName: `new_application_${partName}`,
                        targetData: [partObj]
                    });
                }
            }
            
            // We manually queued the tables, so we skip the default logic for this file
            targetData = null;
        }
        // 6. Generic Fallback for standard tables (e.g. epr_payment, epr_application)
        else if (jsonData.tables && jsonData.tables.length > 0 && jsonData.tables[0].length > 1) {
            const headers = jsonData.tables[0][0].map(h => {
                // Convert header string to valid sqlite column name
                return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            });
            
            const rows = jsonData.tables[0].slice(1);
            targetData = rows.map(row => {
                let obj = { file_source: file };
                headers.forEach((header, i) => {
                    if (header && header !== 'action') {
                        obj[header] = row[i] || "";
                    }
                });
                return obj;
            });
        }
        
        // Push the primary table for this file
        if (targetData && targetData.length > 0) {
            tablesToProcess.push({ tableName, targetData });
        }
        
        if (tablesToProcess.length === 0) {
            console.log(`⚠️ No structured data found to insert for ${file}`);
            continue;
        }

        for (let tableObj of tablesToProcess) {
            let tName = tableObj.tableName.replace(/-/g, '_');
            let tData = tableObj.targetData;

            // Ensure every row has a file_source to allow precise deletion later
            tData = tData.map(row => {
                if (typeof row === 'object' && row !== null) {
                    return { file_source: file, ...row };
                }
                return row;
            });

            const sampleObj = tData[0];

            try {
                await createTableFromObject(db, tName, sampleObj);
                await insertData(db, tName, tData, file);
            } catch (err) {
                console.error(`❌ Failed processing table ${tName}:`, err.message);
            }
        }
    }

    await db.close();
    console.log("\n🎉 All done! Data synced to SQLite pwp.db file.");
}

export default syncToSqlite;

if (import.meta.url === `file://${process.argv[1]}`) {
    syncToSqlite().catch(console.error);
}
