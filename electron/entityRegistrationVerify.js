import {
  normalizeEntityType,
  normalizeGstin,
  normalizeRegistrationType,
} from '../shared/entityRegistrationTypes.js';
import { verifyGstComplete } from './gstVerifyService.js';
import { PIBO_NOT_FOUND_WARNING } from '../shared/piboEntityMasterData.js';
import { searchPiboEntities } from './piboEntitiesService.js';
import {
  supplierMasterCacheComplete,
  upsertSupplierFromEntity,
} from './supplierMasterService.js';

function mapLookupRow(row, source, idPrefix) {
  return {
    id: row.id != null ? `${idPrefix}-${row.id}` : `${idPrefix}-${normalizeGstin(row.gst || row.gst_number)}`,
    gst: normalizeGstin(row.gst || row.gstin || row.gstNo || row.gst_number),
    trade_name: row.tradeName || row.trade_name || row.name || row.entityName || '',
    legal_name: row.legalName || row.legal_name || '',
    address: row.address || '',
    mobile: row.mobile || row.mobileNumber || row.mobile_number || '',
    registration_type: normalizeRegistrationType(row.registrationType || row.registration_type) || 'Unregistered',
    entity_type: normalizeEntityType(row.entityType || row.entity_type || row.applicantType) || '',
    epr_registration_number: row.eprRegistrationNumber || row.eprNo || row.epr_registration_number || '',
    source,
  };
}

function mapGstProfileEntity(verified) {
  if (!verified?.success) return null;
  return {
    id: `climeto-gst-${verified.gst}`,
    gst: verified.gst,
    trade_name: verified.tradeName || verified.legalName || '',
    legal_name: verified.legalName || verified.tradeName || '',
    address: verified.address || '',
    mobile: '',
    registration_type: verified.registration_type || 'Unregistered',
    entity_type: verified.entity_type || '',
    gst_status: verified.status || '',
    source: 'climeto_gst',
  };
}

async function lookupSupplierMaster(db, gst, companyId) {
  const normalized = normalizeGstin(gst);
  if (!normalized) return [];

  let query = `SELECT * FROM supplier_master WHERE gst_number = ? AND is_active = 1`;
  const params = [normalized];
  if (companyId) {
    query += ` AND company_id = ?`;
    params.push(companyId);
  }
  query += ` ORDER BY updated_at DESC`;

  const rows = await db.all(query, params);
  return rows.map((row) => mapLookupRow(row, 'supplier_master', 'supplier'));
}

export function pickBestRegisteredEntity(entities = []) {
  if (!entities.length) return null;
  const score = (entity) => {
    if (entity.source === 'supplier_master') return 40;
    if (entity.source === 'climeto_master_data') return 35;
    if (entity.source === 'climeto_api') return 30;
    if (entity.source === 'climeto_gst') return 20;
    if (entity.source === 'cpcb_gst') return 15;
    if (entity.source === 'fallback') return 0;
    return 10;
  };
  const ranked = [...entities].sort((a, b) => score(b) - score(a));
  return ranked.find((entity) => entity.source !== 'fallback') || ranked[0];
}

let batchEntityCache = null;
let batchSupplierPersisted = null;

export function beginEntityVerifyBatch() {
  batchEntityCache = new Map();
  batchSupplierPersisted = new Set();
}

export function endEntityVerifyBatch() {
  batchEntityCache = null;
  batchSupplierPersisted = null;
}

async function lookupCached(db, gst, companyId) {
  const key = `${companyId || 'all'}:${normalizeGstin(gst)}`;
  if (batchEntityCache?.has(key)) return batchEntityCache.get(key);
  const lookup = await lookupRegisteredEntities(db, { gst, companyId });
  batchEntityCache?.set(key, lookup);
  return lookup;
}

async function persistCounterparty(db, companyId, entity, verified, { force = false } = {}) {
  if (!companyId || !entity?.gst) return;
  const key = `${companyId}:${normalizeGstin(entity.gst)}`;
  if (!force && batchSupplierPersisted?.has(key)) return;
  await upsertSupplierFromEntity(db, companyId, entity, { verified });
  batchSupplierPersisted?.add(key);
}

export function applyVerifiedEntityToExtractedRow(row, entity, invoiceType) {
  if (!row || !entity) return row;
  const out = { ...row };
  if (!out._source_fields || typeof out._source_fields !== 'object') out._source_fields = {};

  const setField = (key, value, { force = false } = {}) => {
    if (value == null || value === '') return;
    if (!out[key] || force) {
      out[key] = value;
      out._source_fields[key] = 'gst_api';
    }
  };

  const trusted = [
    'supplier_master',
    'climeto_api',
    'climeto_master_data',
    'climeto_gst',
  ].includes(entity.source);

  setField('registration_type', entity.registration_type, { force: trusted });
  setField('entity_type', entity.entity_type, { force: trusted && entity.entity_type });

  const displayName = entity.trade_name || entity.legal_name || '';

  if (invoiceType === 'purchase') {
    setField('supplier_name', displayName);
    setField('vendor_name', displayName);
    setField('address_line_1', entity.address);
    setField('supplier_mobile_number', entity.mobile);
    setField('supplier_gst_number', entity.gst);
    setField('vendor_gstin', entity.gst);
    out.is_supplier_gst_available = entity.registration_type === 'Registered';
    out._source_fields.is_supplier_gst_available = 'gst_api';
  } else if (invoiceType === 'sale') {
    setField('entity_name', displayName);
    setField('customer_name', displayName);
    setField('address', entity.address);
    setField('mobile_number', entity.mobile);
    setField('customer_gstin', entity.gst);
  }

  out._entity_verify = {
    gst: entity.gst,
    source: entity.source,
    registration_type: entity.registration_type,
    entity_type: entity.entity_type,
    legal_name: entity.legal_name || '',
    trade_name: entity.trade_name || '',
    gst_status: entity.gst_status || null,
    verified_at: new Date().toISOString(),
  };
  return out;
}

function counterpartyGstFromRow(row, invoiceType) {
  if (invoiceType === 'sale') {
    return normalizeGstin(row.customer_gstin || row.buyer_gst || row._qr?.BuyerGstin);
  }
  return normalizeGstin(
    row.supplier_gst_number || row.vendor_gstin || row.seller_gst || row._qr?.SellerGstin,
  );
}

export async function enrichExtractedRowWithEntityVerify(db, row, invoiceType, companyId = null) {
  if (!row || invoiceType === 'company_document') return row;
  const gst = counterpartyGstFromRow(row, invoiceType);
  if (gst.length !== 15) return row;
  const lookup = await lookupCached(db, gst, companyId);
  const entity = lookup?.bestEntity || lookup?.gstProfile;
  if (!entity) return row;
  return applyVerifiedEntityToExtractedRow(row, entity, invoiceType);
}

function dedupeEntities(entities = []) {
  const seen = new Set();
  return entities.filter((entity) => {
    const key = [entity.gst, entity.trade_name, entity.entity_type, entity.source, entity.epr_registration_number].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectableEntities(entities = []) {
  return entities.filter((entity) => entity.source !== 'climeto_gst' && entity.source !== 'fallback');
}

async function resolvePiboWarning(db, entity) {
  if (!entity || entity.registration_type !== 'Registered' || !entity.entity_type) {
    return null;
  }

  const gst = normalizeGstin(entity.gst);
  const entityType = entity.entity_type;
  const state = String(entity.state || '').trim();

  if (gst.length === 15) {
    const byGst = await searchPiboEntities(db, { search: gst, entityType, state, limit: 5 });
    if (byGst.success && byGst.entities?.length) return null;
  }

  const name = String(entity.trade_name || entity.entity_name || '').trim();
  if (name) {
    const byName = await searchPiboEntities(db, { search: name, entityType, state, limit: 5 });
    if (byName.success && !byName.entities?.length) {
      return PIBO_NOT_FOUND_WARNING;
    }
    return null;
  }

  if (gst.length === 15) {
    return PIBO_NOT_FOUND_WARNING;
  }

  return null;
}

export async function lookupRegisteredEntities(db, { gst, companyId, forceApi = false } = {}) {
  const normalized = normalizeGstin(gst);
  if (normalized.length !== 15) {
    return {
      success: false,
      error: 'Enter a valid 15-character GST number.',
      entities: [],
      bestEntity: null,
      requiresUserSelection: false,
    };
  }

  const supplierRows = await lookupSupplierMaster(db, normalized, companyId);

  if (!forceApi && companyId && supplierRows.length === 1) {
    const cachedRow = await db.get(
      `SELECT * FROM supplier_master WHERE company_id = ? AND gst_number = ? AND is_active = 1`,
      [companyId, normalized],
    );
    if (supplierMasterCacheComplete(cachedRow)) {
      const entity = mapLookupRow(cachedRow, 'supplier_master', 'supplier');
      const piboWarning = await resolvePiboWarning(db, entity);
      return {
        success: true,
        entities: [entity],
        selectableEntities: [],
        bestEntity: entity,
        requiresUserSelection: false,
        fromSupplierMaster: true,
        gstVerified: null,
        piboWarning,
        message: 'Applied from Supplier/Customer Master (previously verified via GST API).',
      };
    }
  }

  const verified = await verifyGstComplete(db, normalized);
  const gstProfile = mapGstProfileEntity(verified);
  const masterRows = verified?.masterDataMatches || [];

  let registrationEntities = dedupeEntities([
    ...supplierRows,
    ...masterRows,
  ]);

  const requiresUserSelection =
    verified?.requiresUserSelection === true
    || selectableEntities(registrationEntities).length > 1;

  let bestEntity = null;
  let message = verified?.message || '';

  if (!masterRows.length && !supplierRows.length) {
    bestEntity = gstProfile || {
      id: 'unregistered-fallback',
      gst: normalized,
      trade_name: '',
      legal_name: '',
      registration_type: 'Unregistered',
      entity_type: '',
      source: 'fallback',
    };
    message = message || 'GST verified — not registered in master/PIBO records (Unregistered).';
    if (companyId && bestEntity?.gst) {
      await persistCounterparty(db, companyId, bestEntity, verified);
    }
    return {
      success: true,
      entities: gstProfile ? [gstProfile] : [bestEntity],
      selectableEntities: [],
      bestEntity,
      requiresUserSelection: false,
      gstVerified: verified,
      piboWarning: null,
      message,
    };
  }

  if (requiresUserSelection) {
    message = `Found ${registrationEntities.length} registration match(es) — select one.`;
    if (companyId && gstProfile) {
      await persistCounterparty(db, companyId, gstProfile, verified);
    }
  } else if (registrationEntities.length === 1) {
    bestEntity = registrationEntities[0];
    message = 'Registration matched — Registered entity applied.';
    if (companyId && bestEntity) {
      await persistCounterparty(db, companyId, bestEntity, verified);
    }
  } else {
    bestEntity = pickBestRegisteredEntity(registrationEntities);
    message = `Found ${registrationEntities.length} registered entity match(es).`;
    if (companyId && bestEntity) {
      await persistCounterparty(db, companyId, bestEntity, verified);
    }
  }

  const piboWarning = bestEntity?.registration_type === 'Registered'
    ? await resolvePiboWarning(db, bestEntity)
    : null;

  return {
    success: true,
    entities: registrationEntities,
    selectableEntities: selectableEntities(registrationEntities),
    gstProfile,
    bestEntity: requiresUserSelection ? null : bestEntity,
    requiresUserSelection,
    gstVerified: verified,
    piboWarning,
    message,
  };
}

/** Called from review when user picks one of multiple masterDataMatches. */
export async function applySelectedMasterEntity(db, companyId, entity) {
  if (!entity?.gst || !companyId) return { success: false };
  await persistCounterparty(db, companyId, entity, null, { force: true });
  return { success: true, entity };
}
