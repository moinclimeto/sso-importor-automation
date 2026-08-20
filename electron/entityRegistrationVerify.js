import axios from 'axios';
import {
  mapGstDetailsToEntity,
  normalizeEntityType,
  normalizeGstin,
  normalizeRegistrationType,
} from '../shared/entityRegistrationTypes.js';
import { getClimetoApiBase } from './gstVerifyService.js';
import { buildClimetoApiUrl } from './climetoApiConfig.js';
import { searchPiboEntities } from './piboEntitiesService.js';

const CPCB_GST_URL = 'https://epr.cpcb.gov.in/cpcbadmin/api/v1/gst/details';

function mapLookupRow(row, source, idPrefix) {
  return {
    id: row.id != null ? `${idPrefix}-${row.id}` : `${idPrefix}-${normalizeGstin(row.gst || row.gst_number)}`,
    gst: normalizeGstin(row.gst || row.gstin || row.gstNo || row.gst_number),
    trade_name: row.tradeName || row.trade_name || row.name || row.entityName || '',
    legal_name: row.legalName || row.legal_name || '',
    address: row.address || '',
    mobile: row.mobile || row.mobileNumber || row.mobile_number || '',
    registration_type: normalizeRegistrationType(row.registrationType || row.registration_type) || 'Registered',
    entity_type: normalizeEntityType(row.entityType || row.entity_type || row.applicantType) || '',
    epr_registration_number: row.eprRegistrationNumber || row.eprNo || row.epr_registration_number || '',
    source,
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

async function lookupClimetoApi(baseUrl, gst) {
  const normalized = normalizeGstin(gst);
  if (!normalized) return [];

  const paths = [
    buildClimetoApiUrl(baseUrl, 'epr/registered-entities', `gst=${encodeURIComponent(normalized)}`),
    buildClimetoApiUrl(baseUrl, 'registered-entities', `gst=${encodeURIComponent(normalized)}`),
    buildClimetoApiUrl(baseUrl, 'pibo/registered', `gst=${encodeURIComponent(normalized)}`),
    buildClimetoApiUrl(baseUrl, 'gst/details', `gst=${encodeURIComponent(normalized)}`),
  ];

  for (const url of paths) {
    try {
      const res = await axios.get(url, { timeout: 8000, validateStatus: () => true });
      if (res.status >= 400) continue;
      const payload = res.data;
      const list = payload?.entities
        || payload?.data
        || payload?.results
        || (Array.isArray(payload) ? payload : []);
      if (!Array.isArray(list) || !list.length) continue;
      return list.map((item, idx) => mapLookupRow(item, 'climeto_api', `climeto-${idx}`));
    } catch {
      /* next */
    }
  }
  return [];
}

async function lookupCpcbGst(gst) {
  const normalized = normalizeGstin(gst);
  if (normalized.length !== 15) return null;

  try {
    const res = await axios.post(
      CPCB_GST_URL,
      { gstNo: normalized },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://epr.cpcb.gov.in',
          Referer: 'https://epr.cpcb.gov.in/onboarding/',
        },
        timeout: 15000,
        validateStatus: () => true,
      },
    );
    if (res.status >= 400 || !res.data) return null;
    const mapped = mapGstDetailsToEntity(res.data);
    return {
      id: `cpcb-gst-${normalized}`,
      gst: normalizeGstin(res.data?.data?.gstNo || normalized),
      trade_name: mapped.trade_name,
      legal_name: mapped.legal_name,
      address: mapped.address || '',
      mobile: '',
      registration_type: mapped.registration_type,
      entity_type: mapped.entity_type,
      gst_status: mapped.gst_status,
      source: mapped.source,
    };
  } catch {
    return null;
  }
}

export function pickBestRegisteredEntity(entities = []) {
  if (!entities.length) return null;
  const score = (entity) => {
    if (entity.source === 'supplier_master') return 40;
    if (entity.source === 'climeto_api') return 30;
    if (entity.source === 'cpcb_gst') return 20;
    if (entity.source === 'fallback') return 0;
    return 10;
  };
  const ranked = [...entities].sort((a, b) => score(b) - score(a));
  return ranked.find((entity) => entity.source !== 'fallback') || ranked[0];
}

let batchEntityCache = null;

export function beginEntityVerifyBatch() {
  batchEntityCache = new Map();
}

export function endEntityVerifyBatch() {
  batchEntityCache = null;
}

async function lookupCached(db, gst, companyId) {
  const key = `${companyId || 'all'}:${normalizeGstin(gst)}`;
  if (batchEntityCache?.has(key)) return batchEntityCache.get(key);
  const lookup = await lookupRegisteredEntities(db, { gst, companyId });
  batchEntityCache?.set(key, lookup);
  return lookup;
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

  const trusted = entity.source === 'supplier_master' || entity.source === 'climeto_api';
  setField('registration_type', entity.registration_type, { force: trusted });
  setField('entity_type', entity.entity_type, { force: trusted });

  if (invoiceType === 'purchase') {
    setField('supplier_name', entity.trade_name);
    setField('vendor_name', entity.trade_name);
    setField('address_line_1', entity.address);
    setField('supplier_mobile_number', entity.mobile);
    setField('supplier_gst_number', entity.gst);
    setField('vendor_gstin', entity.gst);
    if (entity.registration_type === 'Registered') {
      out.is_supplier_gst_available = true;
      out._source_fields.is_supplier_gst_available = 'gst_api';
    }
  } else if (invoiceType === 'sale') {
    setField('entity_name', entity.trade_name);
    setField('customer_name', entity.trade_name);
    setField('address', entity.address);
    setField('mobile_number', entity.mobile);
    setField('customer_gstin', entity.gst);
  }

  out._entity_verify = {
    gst: entity.gst,
    source: entity.source,
    registration_type: entity.registration_type,
    entity_type: entity.entity_type,
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
  if (!lookup?.bestEntity) return row;
  return applyVerifiedEntityToExtractedRow(row, lookup.bestEntity, invoiceType);
}

export async function lookupRegisteredEntities(db, { gst, companyId } = {}) {
  const normalized = normalizeGstin(gst);
  if (normalized.length !== 15) {
    return { success: false, error: 'Enter a valid 15-character GST number.', entities: [], bestEntity: null };
  }

  const climetoBase = await getClimetoApiBase(db);
  const supplierRows = await lookupSupplierMaster(db, normalized, companyId);
  const climetoRows = await lookupClimetoApi(climetoBase, normalized);
  const cpcbRow = await lookupCpcbGst(normalized);

  let entities = [
    ...supplierRows,
    ...climetoRows,
    ...(cpcbRow ? [cpcbRow] : []),
  ];

  const seen = new Set();
  entities = entities.filter((entity) => {
    const key = [entity.gst, entity.trade_name, entity.entity_type, entity.source].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!entities.length) {
    const fallback = [{
      id: 'unregistered-fallback',
      gst: normalized,
      trade_name: '',
      registration_type: 'Unregistered',
      entity_type: '',
      source: 'fallback',
    }];
    return {
      success: true,
      entities: fallback,
      bestEntity: fallback[0],
      piboWarning: null,
      message: 'No registered entity found — use Unregistered.',
    };
  }

  const bestEntity = pickBestRegisteredEntity(entities);
  let piboWarning = null;

  if (bestEntity?.registration_type === 'Registered' && bestEntity.entity_type) {
    const pibo = await searchPiboEntities(db, {
      search: bestEntity.trade_name || bestEntity.gst,
      entityType: bestEntity.entity_type,
    });
    if (pibo.success && !pibo.entities?.length) {
      piboWarning =
        'Selected company is not available in CPCB PIBO registered records.';
    }
  }

  return {
    success: true,
    entities,
    bestEntity,
    piboWarning,
    message: `Found ${entities.length} registered entity match(es).`,
  };
}
