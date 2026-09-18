import { ipcMain } from 'electron';
import { trackTelemetry } from './telemetry.js';

export function registerTelemetryHandlers() {
  ipcMain.handle('telemetry:track', async (_event, payload = {}) => {
    const event = payload?.event || payload?.name;
    const properties = payload?.properties || payload?.data || {};
    return trackTelemetry(event, properties);
  });
}
