const fs = require('fs');
let code = fs.readFileSync('electron/ocrHandlers.js', 'utf8');

// Add pLimit import if missing
if (!code.includes("import pLimit from 'p-limit';")) {
    code = code.replace("import fs from 'fs';", "import fs from 'fs';\nimport pLimit from 'p-limit';");
}

// Add global renderLimit
if (!code.includes("const renderLimit = pLimit(")) {
    code = code.replace("const __dirname = path.dirname(__filename);", "const __dirname = path.dirname(__filename);\n\n// Prevent CPU hanging by strictly limiting concurrent PDF.js renders\nconst renderLimit = pLimit(2);\n");
}

// Wrap the renderPdfPageToPng call
const oldRender = "const pngBuf = await renderPdfPageToPng(filePath, pageNo, 2.2);";
const newRender = "const pngBuf = await renderLimit(() => renderPdfPageToPng(filePath, pageNo, 2.2));";

if (code.includes(oldRender)) {
    code = code.replace(oldRender, newRender);
    fs.writeFileSync('electron/ocrHandlers.js', code);
    console.log("Successfully added render limit.");
} else {
    console.log("Could not find the renderPdfPageToPng call.");
}
