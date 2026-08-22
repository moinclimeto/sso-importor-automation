import { ipcMain } from 'electron';
import { getDb } from './db/database.js';
import {
  probeInvoicePartiesFromFiles,
  verifyGstForCompanyProfile,
} from './invoicePartyProbe.js';
import { lookupRegisteredEntities, applySelectedMasterEntity } from './entityRegistrationVerify.js';
import { searchPiboEntities } from './piboEntitiesService.js';

export function registerGstVerifyHandlers() {
  ipcMain.handle('gst:probe-parties', async (_, payload = {}) => {
    try {
      const db = getDb();
      const filePaths = Array.isArray(payload.filePaths) ? payload.filePaths : [];
      return await probeInvoicePartiesFromFiles(db, filePaths);
    } catch (err) {
      console.error('gst:probe-parties error', err);
      return { success: false, error: err.message || 'Party probe failed.', files: [] };
    }
  });

  ipcMain.handle('gst:verify-complete', async (_, payload = {}) => {
    try {
      const db = getDb();
      return await verifyGstForCompanyProfile(db, payload.gst);
    } catch (err) {
      console.error('gst:verify-complete error', err);
      return { success: false, error: err.message || 'GST verification failed.' };
    }
  });

  ipcMain.handle('entityVerify:lookupByGst', async (_, payload = {}) => {
    try {
      const db = getDb();
      return await lookupRegisteredEntities(db, {
        gst: payload.gst,
        companyId: payload.companyId,
        forceApi: payload.forceApi === true,
      });
    } catch (err) {
      console.error('entityVerify:lookupByGst error', err);
      return { success: false, error: err.message || 'Entity verification failed.', entities: [], bestEntity: null };
    }
  });

  ipcMain.handle('entityVerify:applySelection', async (_, payload = {}) => {
    try {
      const db = getDb();
      return await applySelectedMasterEntity(db, payload.companyId, payload.entity);
    } catch (err) {
      console.error('entityVerify:applySelection error', err);
      return { success: false, error: err.message || 'Failed to save selected entity.' };
    }
  });

  ipcMain.handle('pibo:search', async (_, payload = {}) => {
    try {
      const db = getDb();
      return await searchPiboEntities(db, payload);
    } catch (err) {
      console.error('pibo:search error', err);
      return { success: false, error: err.message || 'PIBO search failed.', entities: [] };
    }
  });
}
