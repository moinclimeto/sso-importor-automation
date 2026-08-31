import { app } from 'electron';
import {
  findBundledChromiumExecutable,
  getPlaywrightBrowsersPath,
} from './playwrightEnv.js';
import { chromium } from 'playwright';

export { chromium };

export function withPlaywrightLaunchOptions(opts = {}) {
  const executablePath = opts.executablePath || findBundledChromiumExecutable();
  if (executablePath) {
    const { channel: _channel, ...rest } = opts;
    return { ...rest, executablePath };
  }

  try {
    if (app.isPackaged) {
      console.warn(
        '[playwright] Bundled Chromium not found in the installer. Falling back to system Chrome if installed.',
      );
    }
  } catch {
    /* ignore */
  }
  return opts;
}

export function getPlaywrightRuntimeInfo() {
  const browsersPath = getPlaywrightBrowsersPath();
  const executablePath = findBundledChromiumExecutable(browsersPath);
  return {
    browsersPath,
    executablePath,
    bundled: Boolean(executablePath),
  };
}
