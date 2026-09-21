import axios from 'axios';
import { app } from 'electron';
import { buildClimetoApiUrl, getClimetoApiBase, resolveClimetoToken } from '../climetoApiConfig.js';
import { getMachineId } from '../monitoring/crashStore.js';
import { getSystemInfo } from '../monitoring/systemInfo.js';

const FLUSH_INTERVAL_MS = Number(process.env.TELEMETRY_FLUSH_INTERVAL_MS || 30_000);
const MAX_QUEUE = Number(process.env.TELEMETRY_MAX_QUEUE || 200);

let dbRef = null;
let queue = [];
let flushTimer = null;
let sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
let sessionUser = null;

export function setTelemetryDatabase(db) {
  dbRef = db;
}

export function setTelemetryUser(user) {
  sessionUser = user
    ? {
        id: user.id ?? user.userId ?? null,
        email: user.email ?? null,
        companyName: user.companyName ?? user.company_name ?? null,
      }
    : null;
}

function telemetryEnabled() {
  if (process.env.TELEMETRY_DISABLED === '1' || process.env.TELEMETRY_DISABLED === 'true') {
    return false;
  }
  return true;
}

function buildBasePayload() {
  const info = getSystemInfo();
  return {
    app: 'climeto-pwp',
    appVersion: app.getVersion(),
    sessionId,
    machineId: getMachineId(),
    platform: process.platform,
    arch: process.arch,
    osName: info.osName,
    osRelease: info.osRelease,
    packaged: app.isPackaged,
    user: sessionUser,
    sentAt: new Date().toISOString(),
  };
}

export async function trackTelemetry(event, properties = {}) {
  if (!telemetryEnabled()) return { queued: false };

  queue.push({
    event: String(event || 'unknown'),
    properties: properties && typeof properties === 'object' ? properties : {},
    ...buildBasePayload(),
  });

  if (queue.length > MAX_QUEUE) {
    queue = queue.slice(queue.length - MAX_QUEUE);
  }

  if (queue.length >= 20) {
    flushTelemetryQueue().catch(() => {});
  }

  return { queued: true };
}

async function postEvents(events) {
  if (!events.length) return;

  const baseUrl = await getClimetoApiBase(dbRef);
  const token = await resolveClimetoToken(dbRef);
  const customUrl = String(process.env.TELEMETRY_URL || '').trim();
  const url = customUrl || buildClimetoApiUrl(baseUrl, 'pwp/telemetry');

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  await axios.post(url, { events }, {
    headers,
    timeout: 12_000,
    validateStatus: (status) => status >= 200 && status < 500,
  });
}

export async function flushTelemetryQueue() {
  if (!queue.length) return { flushed: 0 };
  const batch = queue.splice(0, 50);
  try {
    await postEvents(batch);
    return { flushed: batch.length };
  } catch (err) {
    queue = [...batch, ...queue].slice(-MAX_QUEUE);
    console.warn('[telemetry] flush failed:', err?.message || err);
    return { flushed: 0, error: err?.message || String(err) };
  }
}

export function startTelemetry() {
  if (flushTimer) return;
  trackTelemetry('app_session_start').catch(() => {});
  flushTimer = setInterval(() => {
    flushTelemetryQueue().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

export async function stopTelemetry() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await trackTelemetry('app_session_end');
  return flushTelemetryQueue();
}
