import { app, BrowserWindow, nativeImage } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { initDatabase } from './db/database.js';
import { registerIpcHandlers } from './ipc/ipcHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ICON_PATH = path.join(__dirname, 'icon.png');

function createWindow() {
  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    titleBarStyle: 'default',
    show: false,
    title: 'SSO Importer',
  });

  win.once('ready-to-show', () => win.show());

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5180');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  // Windows taskbar grouping / custom icon
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.climeto.pwp');
  }
  await initDatabase();
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
