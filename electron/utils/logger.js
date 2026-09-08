/**
 * Structured logger with trackId for OCR / extract monitoring.
 * Levels: info | warn | error | success
 */
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { captureException } from '../monitoring/capture.js';
import { getAppLogDir } from '../appPaths.js';

function getLogDir() {
  return getAppLogDir();
}

function ensureLogDir() {
  try {
    const dir = getLogDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

export function createTrackId(prefix = 'ocr') {
  const ts = Date.now().toString(36);
  const rnd = randomBytes(4).toString('hex');
  return `${prefix}_${ts}_${rnd}`;
}

function writeLine(entry) {
  ensureLogDir();
  const line = JSON.stringify(entry);
  try {
    fs.appendFileSync(path.join(getLogDir(), 'extract.log'), `${line}\n`, 'utf8');
  } catch {
    /* ignore disk errors */
  }
  const tag = `[${entry.level.toUpperCase()}][${entry.trackId}]`;
  const msg = entry.message || '';
  const extra = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  if (entry.level === 'error') console.error(tag, msg, extra);
  else if (entry.level === 'warn') console.warn(tag, msg, extra);
  else if (entry.level === 'success') console.log(tag, msg, extra);
  else console.log(tag, msg, extra);
}

export function createLogger(trackId, fileName = 'extract.log') {
  const id = trackId || createTrackId();
  const logFile = path.join(getLogDir(), fileName);

  const log = (level, message, meta = {}) => {
    const entry = {
      ts: new Date().toISOString(),
      level,
      trackId: id,
      message: String(message || ''),
      meta: meta && typeof meta === 'object' ? meta : { value: meta },
    };
    ensureLogDir();
    try {
      fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      /* ignore disk errors */
    }
    writeLine(entry);
    if (level === 'error') {
      try {
        captureException(new Error(entry.message), {
          type: 'logger-error',
          process: 'main',
          extra: entry.meta,
          tags: { trackId: id, logger: fileName },
        });
      } catch {
        /* never let monitoring break logging */
      }
    }
    return entry;
  };

  return {
    trackId: id,
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
    success: (message, meta) => log('success', message, meta),
  };
}

