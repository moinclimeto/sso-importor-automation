import fs from 'fs';

const rawData = fs.readFileSync('data/epr_payment.json', 'utf8');
const jsonData = JSON.parse(rawData);

let targetData = [];

if (jsonData.tables && jsonData.tables.length > 0 && jsonData.tables[0].length > 1) {
    const headers = jsonData.tables[0][0].map(h => {
        return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    });
    
    const rows = jsonData.tables[0].slice(1);
    targetData = rows.map(row => {
        let obj = { file_source: 'epr_payment.json' };
        headers.forEach((header, i) => {
            if (header && header !== 'action') {
                obj[header] = row[i] || "";
            }
        });
        return obj;
    });
}

console.log(targetData);
