import { app, BrowserWindow } from 'electron';

let mainWindowRef = null;

export function registerMainWindow(win) {
  mainWindowRef = win;
}

export function focusMainWindow() {
  const win = mainWindowRef && !mainWindowRef.isDestroyed()
    ? mainWindowRef
    : BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

  if (!win) return false;

  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  return true;
}

/**
 * Ensures only one app instance runs per machine (protects local SQLite).
 * Call before app.whenReady().
 */
export function enforceSingleInstance() {
  const gotLock = app.requestSingleInstanceLock();

  if (!gotLock) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    focusMainWindow();
  });

  return true;
}
