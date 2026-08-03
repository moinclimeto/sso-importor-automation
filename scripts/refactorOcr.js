import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const ocrPath = path.join(rootDir, 'electron', 'ocrHandlers.js');
let ocrContent = fs.readFileSync(ocrPath, 'utf8');

// Replace API Key fetching logic with Pool
const apiKeyReplace = `
  let apiKeys = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GEMINI_API_KEY') && value) {
      apiKeys.push(value.trim());
    }
  }
  if (apiKeys.length === 0) {
    log.error('GEMINI_API_KEY missing');
    return {
      success: false,
      message: 'GEMINI_API_KEY not found. Add it to project root .env file and restart.',
      trackId: log.trackId,
    };
  }
  
  // Round robin key selection based on sNo or random
  const apiKey = apiKeys[(sNo || Math.floor(Math.random() * 100)) % apiKeys.length];
  log.info('Using Gemini Key pool', { poolSize: apiKeys.length, keyPrefix: apiKey.substring(0, 5) });
`;

ocrContent = ocrContent.replace(/const apiKey = process\.env\.GEMINI_API_KEY;[\s\S]*?trackId: log\.trackId,\n\s+\};\n\s+\}/m, apiKeyReplace);

// Replace tempPng logic with Persistent Local Storage
const persistentImageReplace = `
      const imagesDir = path.join(app.getPath('userData'), 'pwp-images');
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      
      const safeName = sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const timestamp = Date.now();
      const targetPngName = \`\${safeName}_p\${pageNo}_\${timestamp}.png\`;
      const targetPngPath = path.join(imagesDir, targetPngName);
      
      fs.writeFileSync(targetPngPath, pngBuf);
      log.info('Saved PDF page to local folder', { targetPngPath });
      
      base64 = pngBuf.toString('base64');
      mimeType = 'image/png';
      tempPng = targetPngPath;
      qrTargetPath = targetPngPath;
`;
ocrContent = ocrContent.replace(/const pngBuf = await renderPdfPageToPng\(filePath, pageNo, 2\.2\);[\s\S]*?qrTargetPath = tempPng;/m, persistentImageReplace);

if(!ocrContent.includes('import { app, ipcMain, dialog }')) {
  ocrContent = ocrContent.replace(/import { ipcMain, dialog } from 'electron';/, "import { app, ipcMain, dialog } from 'electron';");
}

fs.writeFileSync(ocrPath, ocrContent);
console.log('ocrHandlers.js refactored with Key Pooling and Local Saving');
