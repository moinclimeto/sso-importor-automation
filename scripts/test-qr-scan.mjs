/**

 * CLI: node scripts/test-qr-scan.mjs "C:\path\to\invoice.pdf"

 * Local only (Docker / Python / Node ZBar) — no Gemini.

 */

import { scanQrFromDocument } from '../electron/qrScan.js';



const filePath = process.argv[2];

if (!filePath) {

  console.error('Usage: node scripts/test-qr-scan.mjs <file-path>');

  process.exit(1);

}



const result = await scanQrFromDocument(filePath);



if (!result.success) {

  console.log(JSON.stringify(result, null, 2));

  process.exit(1);

}



// Primary: decoded e-invoice JSON (JWT payload.data)

console.log(JSON.stringify(result.data, null, 2));

console.error(

  `OK | ${result.meta?.decoder || '?'} | ${result.meta?.durationMs ?? '?'}ms | type=${result.meta?.qr_type || '?'}`

);

if (process.env.QR_SHOW_RAW === '1') {

  console.error('--- raw JWT ---');

  console.error(result.payload);

}


