import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getUserDataDir() {
  try {
    return app.getPath('userData');
  } catch {
    return process.cwd();
  }
}

export function isPackagedApp() {
  try {
    return Boolean(app.isPackaged);
  } catch {
    return false;
  }
}

/** Writable SQLite path. Packaged builds cannot write inside app.asar. */
export function getAppDbPath() {
  if (isPackagedApp()) {
    return path.join(getUserDataDir(), 'sso_importer.db');
  }
  return path.join(__dirname, '..', 'sso_importer.db');
}

export function getAppLogDir() {
  if (isPackagedApp()) {
    return path.join(getUserDataDir(), 'logs');
  }
  return path.join(__dirname, 'logs');
}

export function getRendererIndexHtml() {
  return path.join(__dirname, '../dist/index.html');
}

export function appendStartupLog(message) {
  try {
    const file = path.join(getUserDataDir(), 'startup.log');
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}
