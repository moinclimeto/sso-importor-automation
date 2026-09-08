import { app } from 'electron';
import {
  findBundledChromiumExecutable,
  formatPlaywrightBrowserError,
  getPlaywrightBrowsersPath,
} from './playwrightEnv.js';
import { chromium } from 'playwright';

export { chromium, formatPlaywrightBrowserError };

function isPackaged() {
  try {
    return Boolean(app?.isPackaged);
  } catch {
    return false;
  }
}

export function withPlaywrightLaunchOptions(opts = {}) {
  const browsersPath = getPlaywrightBrowsersPath();
  const executablePath = opts.executablePath || findBundledChromiumExecutable(browsersPath);
  if (executablePath) {
    const { channel: _channel, ...rest } = opts;
    return { ...rest, executablePath };
  }

  const hint = isPackaged()
    ? 'Bundled Chromium was not found in the installer.'
    : 'Run npm run setup:playwright from the project folder, then restart the app.';

  throw new Error(`Automation browser (Chromium) is not available. ${hint}`);
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

export function wrapPlaywrightError(err) {
  const message = formatPlaywrightBrowserError(err);
  const wrapped = new Error(message);
  wrapped.cause = err;
  return wrapped;
}
