import { BrowserWindow } from 'electron';

let payuWin = null;

export function openPayuInAppWindow(url, { title = 'CPCB Payment — PayU' } = {}) {
  const target = String(url || '').trim();
  if (!target || !/^https?:\/\//i.test(target)) return null;

  if (payuWin && !payuWin.isDestroyed()) {
    payuWin.setTitle(title);
    payuWin.loadURL(target).catch(() => {});
    payuWin.show();
    payuWin.focus();
    return payuWin;
  }

  payuWin = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  payuWin.on('closed', () => {
    payuWin = null;
  });

  payuWin.loadURL(target).catch(() => {});
  return payuWin;
}
