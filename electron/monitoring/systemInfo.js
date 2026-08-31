import os from 'os';
import { execFileSync } from 'child_process';
import { app } from 'electron';
import { ELECTRON_MIN_WIN_BUILD } from './config.js';

const WINDOWS_RELEASE_MAP = [
  { min: 26200, name: 'Windows 11 25H2+' },
  { min: 26100, name: 'Windows 11 24H2' },
  { min: 22631, name: 'Windows 11 23H2' },
  { min: 22621, name: 'Windows 11 22H2' },
  { min: 22000, name: 'Windows 11 21H2' },
  { min: 19045, name: 'Windows 10 22H2' },
  { min: 19044, name: 'Windows 10 21H2' },
  { min: 19043, name: 'Windows 10 21H1' },
  { min: 19042, name: 'Windows 10 20H2' },
  { min: 19041, name: 'Windows 10 2004' },
  { min: 18363, name: 'Windows 10 1909' },
  { min: 18362, name: 'Windows 10 1903' },
  { min: 17763, name: 'Windows 10 1809' },
  { min: 17134, name: 'Windows 10 1803' },
  { min: 16299, name: 'Windows 10 1709' },
  { min: 15063, name: 'Windows 10 1703' },
  { min: 14393, name: 'Windows 10 1607' },
  { min: 10586, name: 'Windows 10 1511' },
  { min: 10240, name: 'Windows 10 1507' },
];

function parseWinBuild(release) {
  const parts = String(release || '').split('.');
  if (parts[0] === '10' && parts[1] === '0') {
    return Number.parseInt(parts[2], 10) || 0;
  }
  return 0;
}

function windowsNameFromRelease(release) {
  const rel = String(release || '');
  if (rel.startsWith('6.1')) return 'Windows 7';
  if (rel.startsWith('6.2')) return 'Windows 8';
  if (rel.startsWith('6.3')) return 'Windows 8.1';
  if (rel.startsWith('5.1') || rel.startsWith('5.2')) return 'Windows XP';
  if (rel.startsWith('6.0')) return 'Windows Vista';
  const build = parseWinBuild(rel);
  if (!build) return `Windows (${rel})`;
  const match = WINDOWS_RELEASE_MAP.find((row) => build >= row.min);
  return match ? match.name : `Windows 10/11 (build ${build})`;
}

function readWindowsCaption() {
  if (process.platform !== 'win32') return '';
  const attempts = [
    () => execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_OperatingSystem).Caption'],
      { timeout: 3500, windowsHide: true, encoding: 'utf8' },
    ),
    () => execFileSync(
      'wmic',
      ['os', 'get', 'Caption', '/value'],
      { timeout: 3500, windowsHide: true, encoding: 'utf8' },
    ),
  ];
  for (const run of attempts) {
    try {
      const raw = String(run() || '');
      const caption = raw.replace(/Caption=/i, '').replace(/\r/g, '').trim();
      if (caption) return caption.split('\n').filter(Boolean).pop() || '';
    } catch {
      /* older shells / disabled WMI */
    }
  }
  return '';
}

export function collectSystemInfo() {
  const release = os.release();
  const platform = process.platform;
  const arch = os.arch();
  const build = platform === 'win32' ? parseWinBuild(release) : 0;
  const osName = platform === 'win32' ? windowsNameFromRelease(release) : `${os.type()} ${release}`;
  const isWin7or8 = platform === 'win32' && /^6\.[123]/.test(release);
  const isOldWin10 = platform === 'win32' && build > 0 && build < ELECTRON_MIN_WIN_BUILD;
  const isUnsupportedOs = platform === 'win32' && (isWin7or8 || isOldWin10 || /^5\./.test(release) || release.startsWith('6.0'));
  const isOldWindows = isUnsupportedOs || (platform === 'win32' && build > 0 && build < 19041);
  const totalMemGb = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
  const freeMemGb = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
  const cpus = os.cpus() || [];

  let appVersion = 'unknown';
  let packaged = false;
  try {
    appVersion = app.getVersion();
    packaged = app.isPackaged;
  } catch {
    /* before ready */
  }

  const supportNote = isUnsupportedOs
    ? `This Windows build is older than Electron requires (Windows 10 1809 / build ${ELECTRON_MIN_WIN_BUILD}+). Crashes and missing APIs are likely.`
    : isOldWindows
      ? 'This is an older Windows 10 release. GPU/driver issues are more common.'
      : totalMemGb < 4
        ? 'Low RAM (under 4 GB). Renderer/OCR crashes are more likely.'
        : '';

  return {
    machineName: os.hostname(),
    platform,
    arch,
    osRelease: release,
    osName,
    windowsBuild: build || null,
    windowsCaption: '',
    isOldWindows,
    isUnsupportedOs,
    supportNote,
    cpuModel: cpus[0]?.model?.trim() || 'unknown',
    cpuCores: cpus.length,
    totalMemGb,
    freeMemGb,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    electronVersion: process.versions.electron || '',
    chromeVersion: process.versions.chrome || '',
    nodeVersion: process.versions.node || '',
    appVersion,
    packaged,
    pid: process.pid,
  };
}

let cachedInfo = null;

export function getSystemInfo() {
  if (cachedInfo) {
    cachedInfo.freeMemGb = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
    return cachedInfo;
  }
  cachedInfo = collectSystemInfo();
  return cachedInfo;
}

export function enrichWindowsCaption(info = cachedInfo) {
  if (!info || info.platform !== 'win32' || info.windowsCaption) return info;
  setImmediate(() => {
    try {
      const caption = readWindowsCaption();
      if (!caption) return;
      info.windowsCaption = caption;
      if (!/Windows 1[01]/.test(info.osName)) {
        info.osName = `${caption} (${info.osName})`;
      }
    } catch {
      /* older shells / disabled WMI */
    }
  });
  return info;
}

export function shouldDisableGpu(info = getSystemInfo()) {
  if (process.env.PWP_DISABLE_GPU === '1' || process.env.PWP_DISABLE_GPU === 'true') return true;
  if (process.env.PWP_FORCE_GPU === '1') return false;
  return Boolean(info.isUnsupportedOs || info.totalMemGb < 3.5);
}
