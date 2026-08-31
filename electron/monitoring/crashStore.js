import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import { getSystemInfo } from './systemInfo.js';
import { sanitizeValue } from './sanitize.js';

const MAX_EVENTS = 400;
const FLUSH_BATCH = 20;

let machineIdCache = '';
let currentUser = null;

function reportsDir() {
  return path.join(app.getPath('userData'), 'crash-reports');
}

function eventsFile() {
  return path.join(reportsDir(), 'events.jsonl');
}

function queueFile() {
  return path.join(reportsDir(), 'pending-upload.jsonl');
}

function machineIdFile() {
  return path.join(app.getPath('userData'), 'machine-id');
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

export function getMachineId() {
  if (machineIdCache) return machineIdCache;
  try {
    const file = machineIdFile();
    if (fs.existsSync(file)) {
      machineIdCache = fs.readFileSync(file, 'utf8').trim();
    }
    if (!machineIdCache) {
      machineIdCache = randomUUID();
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, machineIdCache, 'utf8');
    }
  } catch {
    machineIdCache = machineIdCache || randomUUID();
  }
  return machineIdCache;
}

export function setMonitoringUser(user) {
  if (!user) {
    currentUser = null;
    return;
  }
  currentUser = {
    id: user.id || user.userId || undefined,
    email: user.email || undefined,
    companyName: user.companyName || user.name || undefined,
    userType: user.userType || user.role || undefined,
  };
}

export function getMonitoringUser() {
  return currentUser;
}

function rotateIfNeeded(file) {
  try {
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    if (lines.length <= MAX_EVENTS) return;
    fs.writeFileSync(file, `${lines.slice(-MAX_EVENTS).join('\n')}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

function appendJsonl(file, event) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  rotateIfNeeded(file);
}

export function buildEvent(partial = {}) {
  const info = getSystemInfo();
  return {
    id: randomUUID(),
    ts: new Date().toISOString(),
    type: partial.type || 'error',
    level: partial.level || 'error',
    message: String(partial.message || 'Unknown error'),
    process: partial.process || 'main',
    machineId: getMachineId(),
    user: currentUser,
    system: sanitizeValue(info),
    error: partial.error ? sanitizeValue(partial.error) : undefined,
    extra: partial.extra ? sanitizeValue(partial.extra) : undefined,
    tags: partial.tags || undefined,
  };
}

export function persistEvent(event, { queueRemote = true } = {}) {
  try {
    appendJsonl(eventsFile(), event);
    if (queueRemote) appendJsonl(queueFile(), event);
  } catch (err) {
    console.error('[monitoring] failed to persist event', err?.message);
  }
  return event;
}

export function readRecentEvents(limit = 50) {
  try {
    const file = eventsFile();
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { message: line };
      }
    }).reverse();
  } catch {
    return [];
  }
}

export function takeQueuedEvents(limit = FLUSH_BATCH) {
  try {
    const file = queueFile();
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const batch = lines.slice(0, limit).map((line) => JSON.parse(line));
    const rest = lines.slice(limit);
    fs.writeFileSync(file, rest.length ? `${rest.join('\n')}\n` : '', 'utf8');
    return batch;
  } catch {
    return [];
  }
}

export function requeueEvents(events) {
  if (!events?.length) return;
  try {
    ensureDir(reportsDir());
    const payload = events.map((event) => JSON.stringify(event)).join('\n');
    fs.appendFileSync(queueFile(), `${payload}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

export function pendingCount() {
  try {
    const file = queueFile();
    if (!fs.existsSync(file)) return 0;
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function getCrashDumpDir() {
  try {
    return app.getPath('crashDumps');
  } catch {
    return path.join(app.getPath('userData'), 'Crashpad');
  }
}

export function listLocalDumpFiles() {
  const dir = getCrashDumpDir();
  const out = [];
  const walk = (current, depth = 0) => {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (/\.(dmp|txt)$/i.test(entry.name)) {
        try {
          const stat = fs.statSync(full);
          out.push({ path: full, name: entry.name, size: stat.size, mtime: stat.mtime.toISOString() });
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime))).slice(0, 20);
}
