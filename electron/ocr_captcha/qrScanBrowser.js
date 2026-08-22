import path from 'path';
import { fileURLToPath } from 'url';
import { BrowserWindow } from 'electron';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let scanWindow = null;
let scanReady = false;

function getScanWindow() {
  if (scanWindow && !scanWindow.isDestroyed()) return scanWindow;

  scanWindow = new BrowserWindow({
    show: false,
    width: 400,
    height: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  scanReady = false;
  scanWindow.loadFile(path.join(__dirname, 'qr-scan.html'));
  scanWindow.webContents.once('did-finish-load', () => {
    scanReady = true;
  });

  return scanWindow;
}

async function waitForReady(win, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (scanReady) {
      const ok = await win.webContents.executeJavaScript('Boolean(window.qrScanReady)');
      if (ok) return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('QR browser scanner not ready');
}

/**
 * Decode QR using ZBar in a hidden Chromium window (more reliable on scans).
 */
export async function scanQrWithBrowser(pngBuffer) {
  const win = getScanWindow();
  await waitForReady(win);

  for (const width of [2400]) {
    const scaled = await sharp(pngBuffer)
      .resize({ width, kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${scaled.toString('base64')}`;
    const values = await win.webContents.executeJavaScript(
      `window.scanQrDataUrl(${JSON.stringify(dataUrl)})`
    );
    const hit = values?.find((v) => typeof v === 'string' && v.length > 40);
    if (hit) return hit;
  }
  return null;
}
