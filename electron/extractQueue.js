/**
 * Sequential extract queue: page jobs, duplicate skip, progress + trackId.
 */
import path from 'path';
import pLimit from 'p-limit';
import { createLogger, createTrackId } from './logger.js';
import { getDb } from './database.js';
import { expandFilesToPageJobs } from './pdfPages.js';

function normName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getExistingInvoiceFileNames(type) {
  const db = getDb();
  const names = new Set();
  const rows = type === 'sale' ? db.sales || [] : db.purchases || [];
  for (const row of rows) {
    const n = normName(
      row.invoice_file_name || row.invoice_filename || row.invoice_no || ''
    );
    if (n) names.add(n);
  }
  return names;
}

/**
 * Filter page jobs: skip duplicate invoiceFileName in batch or already in DB.
 */
export function filterPageJobs(jobs, type, log) {
  const existing = getExistingInvoiceFileNames(type);
  const seenBatch = new Set();
  const accepted = [];
  const skipped = [];

  for (const job of jobs) {
    const key = normName(job.invoiceFileName || job.displayName);
    if (!key) {
      skipped.push({ ...job, reason: 'invalid_name' });
      log.warn('Skip invalid page job', { job });
      continue;
    }
    if (seenBatch.has(key)) {
      skipped.push({ ...job, reason: 'duplicate_in_batch' });
      log.warn('Skip duplicate page in batch', { invoiceFileName: job.invoiceFileName });
      continue;
    }
    if (existing.has(key)) {
      skipped.push({ ...job, reason: 'already_extracted' });
      log.warn('Skip already extracted page', {
        invoiceFileName: job.invoiceFileName,
        type,
      });
      continue;
    }
    seenBatch.add(key);
    accepted.push(job);
  }

  return { accepted, skipped };
}

/**
 * Run extract over expanded page jobs (1 page = 1 invoice).
 */
export async function runExtractQueue({
  filePaths,
  type,
  financialYear,
  extractFn,
  onProgress,
  trackId: incomingTrackId,
}) {
  const trackId = incomingTrackId || createTrackId('batch');
  const log = createLogger(trackId);

  log.info('Queue started — expanding pages', {
    filesSelected: filePaths.length,
    type,
    financialYear,
  });

  const expanded = await expandFilesToPageJobs(filePaths);
  log.info('Pages expanded', {
    fileCount: expanded.fileCount,
    totalPages: expanded.totalPages,
    jobs: expanded.jobs.length,
  });

  const { accepted, skipped } = filterPageJobs(expanded.jobs, type, log);
  const total = accepted.length;
  const results = [];
  let successCount = 0;
  let failedCount = 0;
  const skippedCount = skipped.length;

  const emit = (partial) => {
    const payload = {
      trackId,
      stage: partial.stage || 'processing',
      total,
      selectedTotal: filePaths.length,
      totalPages: expanded.totalPages,
      fileCount: expanded.fileCount,
      processed: partial.processed ?? 0,
      current: partial.current ?? 0,
      successCount,
      failedCount,
      skippedCount,
      message: partial.message || '',
      currentFile: partial.currentFile || '',
      fileStatus: partial.fileStatus || null,
      pageInfo: partial.pageInfo || null,
    };
    try {
      onProgress?.(payload);
    } catch {
      /* ignore */
    }
  };

  for (const s of skipped) {
    results.push({
      ok: false,
      skipped: true,
      fileName: s.displayName || s.invoiceFileName,
      invoiceFileName: s.invoiceFileName,
      filePath: s.filePath,
      pageNumber: s.pageNumber,
      pageCount: s.pageCount,
      message:
        s.reason === 'duplicate_in_batch'
          ? 'Duplicate in this batch — skipped'
          : s.reason === 'already_extracted'
            ? 'Already extracted — skipped'
            : 'Skipped',
      reason: s.reason,
      trackId,
    });
    emit({
      stage: 'skipped',
      processed: 0,
      current: 0,
      message: `Skipped ${s.displayName || s.invoiceFileName}`,
      currentFile: s.displayName || s.invoiceFileName,
      fileStatus: {
        fileName: s.displayName || s.invoiceFileName,
        sourceFileName: s.sourceFileName,
        label:
          s.reason === 'already_extracted'
            ? 'Skipped · already extracted'
            : 'Skipped · duplicate',
        tone: 'skip',
        status: 'skipped',
      },
      pageInfo: { pageNumber: s.pageNumber, pageCount: s.pageCount },
    });
  }

  if (!total) {
    log.warn('Queue empty after filters', { skippedCount, totalPages: expanded.totalPages });
    emit({
      stage: 'complete',
      processed: 0,
      current: 0,
      message: `Nothing to extract · ${skippedCount} skipped · ${expanded.totalPages} pages scanned`,
      currentFile: '',
    });
    return {
      success: true,
      trackId,
      results,
      successCount: 0,
      failedCount: 0,
      skippedCount,
      total: 0,
      totalPages: expanded.totalPages,
      fileCount: expanded.fileCount,
      selectedTotal: filePaths.length,
      files: expanded.files,
    };
  }

  emit({
    stage: 'start',
    processed: 0,
    current: 0,
    message: `Queued ${total} page(s) from ${expanded.fileCount} file(s)` +
      (skippedCount ? ` · ${skippedCount} skipped` : ''),
    currentFile: '',
  });

  const limit = pLimit(Number(process.env.GEMINI_MAX_CONCURRENT || process.env.CONCURRENCY_LIMIT || 20)); // Super fast concurrent batch processing
  let processedCount = 0;

  await Promise.all(accepted.map((job, i) => limit(async () => {
    const job = accepted[i];
    const current = i + 1;
    const fileTrack = `${trackId}#${current}`;
    const label = job.displayName;

    log.info('Extracting page job', {
      label,
      pageNumber: job.pageNumber,
      pageCount: job.pageCount,
      current,
      total,
      fileTrack,
    });

    emit({
      stage: 'processing',
      processed: processedCount,
      current,
      message: `Extracting ${current}/${total}`,
      currentFile: label,
      fileStatus: {
        fileName: label,
        sourceFileName: job.sourceFileName,
        label: `Extracting page ${job.pageNumber}/${job.pageCount}…`,
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
        sNo: successCount + 1,
        trackId: fileTrack,
        log,
      });

      if (one?.success) {
        successCount += 1;
        processedCount += 1;
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
          processed: processedCount,
          current,
          message: `Extracting ${current}/${total}`,
          currentFile: label,
          fileStatus: {
            fileName: label,
            sourceFileName: job.sourceFileName,
            label: one.qr?.priorityApplied
              ? `Success · QR+OCR · ${lines} lines`
              : `Success · ${lines} lines`,
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
        processedCount += 1;
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
          processed: processedCount,
          current,
          message: `Extracting ${current}/${total}`,
          currentFile: label,
          fileStatus: {
            fileName: label,
            sourceFileName: job.sourceFileName,
            label: `Failed · ${message}`,
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
      failedCount += 1;
        processedCount += 1;
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
        processed: processedCount,
        current,
        message: `Extracting ${current}/${total}`,
        currentFile: label,
        fileStatus: {
          fileName: label,
          sourceFileName: job.sourceFileName,
          label: `Failed · ${message}`,
          tone: 'fail',
          status: 'failed',
        },
      });
    }
  })));

  log.info('Queue complete', {
    successCount,
    failedCount,
    skippedCount,
    total,
    totalPages: expanded.totalPages,
  });

  emit({
    stage: 'complete',
    processed: total,
    current: total,
    message: `Done · ${successCount} success · ${failedCount} failed · ${skippedCount} skipped · ${expanded.totalPages} pages`,
    currentFile: '',
  });

  return {
    success: true,
    trackId,
    results,
    successCount,
    failedCount,
    skippedCount,
    total,
    totalPages: expanded.totalPages,
    fileCount: expanded.fileCount,
    selectedTotal: filePaths.length,
    files: expanded.files,
  };
}

// keep old name used nowhere else for files — export path helper
export function baseName(filePath) {
  return path.basename(filePath || '') || '';
}
