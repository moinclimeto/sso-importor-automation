const fs = require('fs');
let c = fs.readFileSync('electron/extractQueue.js', 'utf8');
if (!c.includes('pLimit')) {
    c = c.replace(/import path from 'path';/g, "import path from 'path';\nimport pLimit from 'p-limit';");
    fs.writeFileSync('electron/extractQueue.js', c);
}
console.log('Added pLimit');
