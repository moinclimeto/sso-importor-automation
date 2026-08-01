import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const qPath = path.join(rootDir, 'electron', 'extractQueue.js');
let qContent = fs.readFileSync(qPath, 'utf8');

const importReplace = `import path from 'path';
import pLimit from 'p-limit';`;
qContent = qContent.replace(/import path from 'path';/, importReplace);

const loopReplace = `  emit({
    stage: 'start',
    processed: 0,
    current: 0,
    message: \`Queued \${total} page(s) from \${expanded.fileCount} file(s)\` +
      (skippedCount ? \` · \${skippedCount} skipped\` : ''),
    currentFile: '',
  });

  const limit = pLimit(5); // Run 5 concurrent extractions
  let completed = 0;

  const promises = accepted.map((job, i) => limit(async () => {
    const current = i + 1;
    const fileTrack = \`\${trackId}#\${current}\`;
    const label = job.displayName;

    log.info('Extracting page job (Concurrent)', {
      label,
      pageNumber: job.pageNumber,
      pageCount: job.pageCount,
      current,
      total,
      fileTrack,
    });

    emit({
      stage: 'processing',
      processed: completed,
      current,
      message: \`Extracting \${current}/\${total} (Concurrent)\`,
      currentFile: label,
      fileStatus: {
        fileName: label,
        sourceFileName: job.sourceFileName,
        label: \`Extracting page \${job.pageNumber}/\${job.pageCount}…\`,
        tone: 'run',
        status: 'running',
      },
      pageInfo: {
        pageNumber: job.pageNumber,
        pageCount: job.pageCount,
        sourceFileName: job.sourceFileName,
      },
    });

    try {
      const one = await extractFn({
        filePath: job.filePath,
        pageNumber: job.pageNumber,
        pageCount: job.pageCount,
        invoiceFileName: job.invoiceFileName,
        displayName: job.displayName,
        type,
        financialYear,
        sNo: i + 1,
        trackId: fileTrack,
        log,
      });

      completed++;

      if (one?.success) {
        successCount += 1;
        const lines = Array.isArray(one.data?.lineItems) ? one.data.lineItems.length : 0;
        log.success('Page extracted', {
          label,
          pageNumber: job.pageNumber,
          lines,
          qrUsed: Boolean(one.meta?.qrUsed),
        });
        results.push({
          ok: true,
          skipped: false,
          fileName: label,
          invoiceFileName: job.invoiceFileName,
          filePath: job.filePath,
          pageNumber: job.pageNumber,
          pageCount: job.pageCount,
          data: one.data,
          qr: one.qr,
          meta: { ...one.meta, trackId: fileTrack },
          trackId: fileTrack,
        });
        emit({
          stage: 'processing',
          processed: completed,
          current: completed,
          message: \`Extracted \${completed}/\${total}\`,
          currentFile: label,
          fileStatus: {
            fileName: label,
            sourceFileName: job.sourceFileName,
            label: one.qr?.priorityApplied
              ? \`Success · QR+OCR · \${lines} lines\`
              : \`Success · \${lines} lines\`,
            tone: 'ok',
            status: 'success',
          },
          pageInfo: {
            pageNumber: job.pageNumber,
            pageCount: job.pageCount,
            sourceFileName: job.sourceFileName,
          },
        });
      } else {
        failedCount += 1;
        const message = one?.message || 'Extraction failed';
        log.error('Page extract failed', { label, message });
        results.push({
          ok: false,
          skipped: false,
          fileName: label,
          invoiceFileName: job.invoiceFileName,
          filePath: job.filePath,
          pageNumber: job.pageNumber,
          pageCount: job.pageCount,
          message,
          trackId: fileTrack,
        });
        emit({
          stage: 'processing',
          processed: completed,
          current: completed,
          message: \`Extracted \${completed}/\${total}\`,
          currentFile: label,
          fileStatus: {
            fileName: label,
            sourceFileName: job.sourceFileName,
            label: \`Failed · \${message}\`,
            tone: 'fail',
            status: 'failed',
          },
          pageInfo: {
            pageNumber: job.pageNumber,
            pageCount: job.pageCount,
            sourceFileName: job.sourceFileName,
          },
        });
      }
    } catch (err) {
      completed++;
      failedCount += 1;
      const message = err?.message || 'Extraction failed';
      log.error('Page extract threw', { label, message });
      results.push({
        ok: false,
        skipped: false,
        fileName: label,
        invoiceFileName: job.invoiceFileName,
        filePath: job.filePath,
        pageNumber: job.pageNumber,
        pageCount: job.pageCount,
        message,
        trackId: fileTrack,
      });
      emit({
        stage: 'processing',
        processed: completed,
        current: completed,
        message: \`Extracted \${completed}/\${total}\`,
        currentFile: label,
        fileStatus: {
          fileName: label,
          sourceFileName: job.sourceFileName,
          label: \`Failed · \${message}\`,
          tone: 'fail',
          status: 'failed',
        },
      });
    }
  }));

  await Promise.all(promises);`;

qContent = qContent.replace(/emit\(\{\n\s+stage: 'start',[\s\S]*?\}\n\s+\}\n\s+\}/m, loopReplace);
fs.writeFileSync(qPath, qContent);
console.log('extractQueue.js refactored for Concurrency');
