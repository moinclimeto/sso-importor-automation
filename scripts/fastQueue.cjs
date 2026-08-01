const fs = require('fs');
const content = fs.readFileSync('electron/extractQueue.js', 'utf8');
const lines = content.replace(/\r\n/g, '\n').split('\n');

const startIndex = lines.findIndex(l => l.includes('for (let i = 0; i < accepted.length; i += 1) {'));
const logInfoIndex = lines.findIndex(l => l.includes("log.info('Queue complete', {"));
let endIndex = logInfoIndex - 1;
while (endIndex > startIndex && !lines[endIndex].includes('}')) {
    endIndex--;
}

if (startIndex !== -1 && endIndex !== -1 && lines[endIndex].trim() === '}') {
    lines[startIndex] = `  const limit = pLimit(Number(process.env.CONCURRENCY_LIMIT || 10)); // Super fast concurrent batch processing
  let processedCount = 0;

  await Promise.all(accepted.map((job, i) => limit(async () => {`;
  
    lines[endIndex] = `  })));`;
    
    // Replace processed: i with processedCount
    for (let i = startIndex + 1; i < endIndex; i++) {
        if (lines[i].includes('processed: i,')) lines[i] = lines[i].replace('processed: i,', 'processed: processedCount,');
        if (lines[i].includes('processed: current,')) lines[i] = lines[i].replace('processed: current,', 'processed: processedCount,');
        if (lines[i].includes('successCount += 1;')) lines[i] = `        successCount += 1;\n        processedCount += 1;`;
        if (lines[i].includes('failedCount += 1;')) lines[i] = lines[i].replace('failedCount += 1;', 'failedCount += 1;\n        processedCount += 1;');
    }
    
    fs.writeFileSync('electron/extractQueue.js', lines.join('\n'));
    console.log('Successfully fixed syntax dynamically.');
} else {
    console.log('Could not find loop bounds.', startIndex, endIndex, lines[endIndex]);
}
