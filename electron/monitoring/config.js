import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import { PACKAGED_SENTRY_DSN } from './dsn.js';
import { loadEnvFile } from '../loadEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnvFile();

const ELECTRON_MIN_WIN_BUILD = 17763;

function readOptionalDsnFile() {
  const candidates = [
    path.join(__dirname, 'sentry-dsn.txt'),
    path.join(__dirname, '../../sentry-dsn.txt'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value && !value.startsWith('#')) return value;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function getSentryDsn() {
  return String(
    process.env.SENTRY_DSN
      || process.env.VITE_SENTRY_DSN
      || PACKAGED_SENTRY_DSN
      || readOptionalDsnFile()
      || '',
  ).trim();
}

export function getCrashReportUrl() {
  return String(process.env.CRASH_REPORT_URL || '').trim();
}

export function getAppRelease() {
  let version = '1.0.0';
  try {
    version = app.getVersion();
  } catch {
    /* app not ready */
  }
  return `climeto-pwp@${version}`;
}

export function getMonitoringEnvironment() {
  return process.env.SENTRY_ENVIRONMENT
    || process.env.NODE_ENV
    || (app.isPackaged ? 'production' : 'development');
}

export function isMonitoringEnabledInDev() {
  return process.env.SENTRY_DEV === '1' || process.env.SENTRY_DEV === 'true';
}

export function shouldEnableRemoteMonitoring() {
  const hasSink = Boolean(getSentryDsn() || getCrashReportUrl());
  if (!hasSink) return false;
  if (app.isPackaged) return true;
  return isMonitoringEnabledInDev() || Boolean(getSentryDsn());
}

export { ELECTRON_MIN_WIN_BUILD };
