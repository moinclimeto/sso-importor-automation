import { normalizeGstin } from '../shared/entityRegistrationTypes.js';
import { shouldApplyEntityTypeFromVerify } from '../shared/entityVerifyBadges.js';

export function supplierMasterCacheComplete(row) {
  if (!row) return false;
  const gst = normalizeGstin(row.gst_number);
  if (gst.length !== 15) return false;
  if (!row.registration_type) return false;
  return Boolean(String(row.trade_name || row.legal_name || '').trim());
}

export async function upsertSupplierFromEntity(db, companyId, entity, { verified = null, source = 'gst_api' } = {}) {
  if (!db || !companyId || !entity?.gst) return null;

  const gstNumber = normalizeGstin(entity.gst);
  if (gstNumber.length !== 15) return null;

  const now = new Date().toISOString();
  const tradeName = String(
    entity.trade_name
    || entity.tradeName
    || verified?.tradeName
    || '',
  ).trim();
  const legalName = String(
    entity.legal_name
    || entity.legalName
    || verified?.legalName
    || '',
  ).trim();
  const address = String(entity.address || verified?.address || '').trim();
  const mobile = String(entity.mobile || '').trim();
  const canApplyEntityType = shouldApplyEntityTypeFromVerify(verified, entity);
  const entityType = canApplyEntityType
    ? String(entity.entity_type || verified?.entity_type || '').trim()
    : '';
  const registrationType = String(
    entity.registration_type || verified?.registration_type || 'Unregistered',
  ).trim();

  const existing = await db.get(
    `SELECT * FROM supplier_master WHERE company_id = ? AND gst_number = ?`,
    [companyId, gstNumber],
  );

  if (existing) {
    await db.run(
      `UPDATE supplier_master SET
        trade_name = ?,
        legal_name = ?,
        address = ?,
        mobile = ?,
        entity_type = ?,
        registration_type = ?,
        source = ?,
        is_active = 1,
        updated_at = ?
      WHERE id = ?`,
      [
        tradeName || existing.trade_name || '',
        legalName || existing.legal_name || '',
        address || existing.address || '',
        mobile || existing.mobile || '',
        canApplyEntityType ? entityType : '',
        registrationType || existing.registration_type || 'Unregistered',
        source || existing.source || 'gst_api',
        now,
        existing.id,
      ],
    );
    return existing.id;
  }

  const result = await db.run(
    `INSERT INTO supplier_master (
      company_id, gst_number, trade_name, legal_name, address, mobile,
      entity_type, registration_type, source, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      companyId,
      gstNumber,
      tradeName,
      legalName,
      address,
      mobile,
      entityType,
      registrationType,
      source,
      now,
      now,
    ],
  );
  return result.lastID;
}

export async function upsertSupplierMasterRow(db, data, { cascadeFn = null, fromImport = false } = {}) {
  if (!db || !data?.company_id || !data?.gst_number) {
    throw new Error('company_id and gst_number are required');
  }

  const gstNumber = normalizeGstin(data.gst_number);
  if (gstNumber.length !== 15) {
    throw new Error('GST Number must be 15 characters');
  }

  const now = new Date().toISOString();
  const tradeName = String(data.trade_name || '').trim();
  const legalName = String(data.legal_name || '').trim();
  const address = String(data.address || '').trim();
  const mobile = String(data.mobile || '').trim();
  const registrationNumber = String(data.registration_number || '').trim();
  const state = String(data.state || '').trim();
  const pan = String(data.pan || '').trim();
  const entityType = String(data.entity_type || '').trim();
  const registrationType = String(data.registration_type || 'Unregistered').trim();
  const source = String(data.source || 'excel_import').trim();

  const existing = await db.get(
    `SELECT * FROM supplier_master WHERE company_id = ? AND gst_number = ?`,
    [data.company_id, gstNumber],
  );

  if (existing) {
    const oldGstNumber = existing.gst_number;
    const nextTradeName = fromImport ? tradeName : (tradeName || existing.trade_name || '');
    const nextLegalName = fromImport ? legalName : (legalName || existing.legal_name || '');
    const nextAddress = fromImport ? address : (address || existing.address || '');
    const nextMobile = fromImport ? mobile : (mobile || existing.mobile || '');
    const nextEntityType = fromImport ? entityType : (entityType || existing.entity_type || '');
    const nextRegistrationType = fromImport
      ? (registrationType || 'Unregistered')
      : (registrationType || existing.registration_type || 'Unregistered');
    const nextRegistrationNumber = fromImport
      ? registrationNumber
      : (registrationNumber || existing.registration_number || '');
    const nextState = fromImport ? state : (state || existing.state || '');
    const nextPan = fromImport ? pan : (pan || existing.pan || '');

    await db.run(
      `UPDATE supplier_master SET
        trade_name = ?,
        legal_name = ?,
        address = ?,
        mobile = ?,
        entity_type = ?,
        registration_type = ?,
        registration_number = ?,
        state = ?,
        pan = ?,
        source = ?,
        is_active = 1,
        updated_at = ?
      WHERE id = ?`,
      [
        nextTradeName,
        nextLegalName,
        nextAddress,
        nextMobile,
        nextEntityType,
        nextRegistrationType,
        nextRegistrationNumber,
        nextState,
        nextPan,
        source || existing.source || 'excel_import',
        now,
        existing.id,
      ],
    );
    const updatedRecord = await db.get('SELECT * FROM supplier_master WHERE id = ?', [existing.id]);
    if (cascadeFn && updatedRecord) {
      await cascadeFn(db, updatedRecord.company_id, oldGstNumber, updatedRecord);
    }
    return { action: 'updated', id: existing.id };
  }

  const result = await db.run(
    `INSERT INTO supplier_master (
      company_id, gst_number, trade_name, legal_name, address, mobile,
      entity_type, registration_type, registration_number, state, pan,
      source, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      data.company_id,
      gstNumber,
      tradeName,
      legalName,
      address,
      mobile,
      entityType,
      registrationType,
      registrationNumber,
      state,
      pan,
      source,
      now,
      now,
    ],
  );
  return { action: 'added', id: result.lastID };
}
