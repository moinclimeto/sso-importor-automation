import { ipcMain } from 'electron';
import {
  checkForUpdatesNow,
  downloadUpdateNow,
  getUpdateStatus,
  quitAndInstallUpdate,
} from './autoUpdater.js';

export function registerUpdaterHandlers() {
  ipcMain.handle('app:getVersion', () => getUpdateStatus());

  ipcMain.handle('app:checkForUpdates', async () => checkForUpdatesNow());

  ipcMain.handle('app:downloadUpdate', async () => downloadUpdateNow());

  ipcMain.handle('app:installUpdate', async () => quitAndInstallUpdate());
}
