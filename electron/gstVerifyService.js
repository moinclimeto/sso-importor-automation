import axios from 'axios';
import {
  mapGstDetailsToEntity,
  normalizeEntityType,
  normalizeGstin,
  normalizeRegistrationType,
} from '../shared/entityRegistrationTypes.js';
import { buildClimetoApiUrl, getClimetoApiBase, getClimetoAuthHeaders } from './climetoApiConfig.js';
import { panFromGstin } from './gstPartyUtils.js';

const CPCB_GST_URL = 'https://epr.cpcb.gov.in/cpcbadmin/api/v1/gst/details';
const CLIMETO_VERIFY_TIMEOUT_MS = 20000;

export { getClimetoApiBase };

function isActiveGstStatus(status) {
  const s = String(status || '').trim();
  if (!s) return true;
  return !/cancelled|canceled|inactive|suspended|invalid|revoked/i.test(s);
}

function dedupeMasterRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      row.id,
      row.gst,
      row.epr_registration_number,
      row.trade_name,
      row.entity_type,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Map one Climeto master-data registration row from gst/verify/complete. */
export function mapMasterDataMatchRow(row, gstin, idx = 0) {
  if (!row || typeof row !== 'object') return null;
  const normalizedGst = normalizeGstin(row.gstin || row.gst || row.gstNo || row.gst_number || gstin);
  return {
    id: row.id != null ? `master-${row.id}` : `master-${normalizedGst}-${idx}`,
    gst: normalizedGst,
    trade_name:
      row.tradeName
      || row.trade_name
      || row.entityName
      || row.entity_name
      || row.company_name
      || row.companyName
      || row.name
      || '',
    legal_name: row.legalName || row.legal_name || '',
    address: row.address || row.registeredAddress || row.primary_address || '',
    mobile: row.mobile || row.mobileNumber || row.mobile_number || '',
    registration_type: 'Registered',
    entity_type: normalizeEntityType(
      row.entityType || row.entity_type || row.applicantType || row.applicant_type || row.companyType,
    ),
    epr_registration_number:
      row.eprRegistrationNumber
      || row.eprNo
      || row.epr_registration_number
      || row.registrationNumber
      || row.registration_number
      || '',
    source: 'climeto_master_data',
    confidence: row.confidence ?? row.matchScore ?? null,
    raw: row,
  };
}

export function mapMasterDataMatchesFromPayload(payload, gstin) {
  const raw = [];
  if (Array.isArray(payload?.masterDataMatches)) raw.push(...payload.masterDataMatches);
  if (Array.isArray(payload?.allMasterDataMatches)) raw.push(...payload.allMasterDataMatches);
  if (payload?.masterDataMatch && typeof payload.masterDataMatch === 'object') {
    raw.push(payload.masterDataMatch);
  }
  return dedupeMasterRows(
    raw
      .map((row, idx) => mapMasterDataMatchRow(row, gstin, idx))
      .filter(Boolean),
  );
}

/** Map Climeto POST /gst/verify/complete response (gstZenResponse + master data). */
export function mapClimetoGstVerifyResponse(payload) {
  if (!payload || payload.success === false) return null;

  const gstin = normalizeGstin(payload.gstin || payload.gst);
  const zen = payload.gstZenResponse || {};
  const statusLabel = zen.company_status || zen.status || '';
  const active = zen.valid !== false && isActiveGstStatus(statusLabel);
  const masterDataMatches = mapMasterDataMatchesFromPayload(payload, gstin);
  const hasMasterMatches = masterDataMatches.length > 0;
  const requiresUserSelection =
    payload.requiresUserSelection === true || masterDataMatches.length > 1;

  return {
    success: true,
    gst: gstin,
    legalName: zen.legal_name || zen.legalName || '',
    tradeName: zen.trade_name || zen.tradeName || zen.legal_name || '',
    address: zen.primary_address || zen.address || '',
    pan: payload.panNumber || zen.pan || panFromGstin(gstin) || '',
    status: statusLabel || (active ? 'Active' : 'Inactive'),
    state: zen.state || '',
    registration_type: hasMasterMatches ? 'Registered' : 'Unregistered',
    entity_type: masterDataMatches.length === 1 ? masterDataMatches[0].entity_type : '',
    masterDataMatches,
    requiresUserSelection,
    totalMatches: payload.totalMatches ?? masterDataMatches.length,
    source: 'climeto_gst',
    message: payload.message || '',
    raw: payload,
  };
}

function mapCpcbVerifyResponse(payload) {
  const data = payload?.data || payload || {};
  const mapped = mapGstDetailsToEntity({ data });
  return {
    success: true,
    gst: normalizeGstin(data.gstNo || data.gstin || data.gst),
    legalName: mapped.legal_name,
    tradeName: mapped.trade_name,
    address: mapped.address || '',
    pan: mapped.pan || panFromGstin(data.gstNo || data.gstin) || '',
    status: mapped.gst_status || '',
    registration_type: mapped.registration_type,
    entity_type: mapped.entity_type,
    source: 'cpcb_gst',
    raw: data,
  };
}

async function verifyViaClimeto(db, baseUrl, gst) {
  const normalized = normalizeGstin(gst);
  try {
    const url = buildClimetoApiUrl(baseUrl, 'gst/verify/complete');
    const res = await axios.post(
      url,
      { gstin: normalized },
      {
        headers: await getClimetoAuthHeaders(db),
        timeout: CLIMETO_VERIFY_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );

    if (res.status === 401) {
      return {
        success: false,
        error: 'Climeto API auth failed — please sign in again from the login page.',
        gst: normalized,
      };
    }

    if (res.status >= 400 || !res.data) return null;
    return mapClimetoGstVerifyResponse(res.data);
  } catch {
    return null;
  }
}

async function verifyViaCpcb(gst) {
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
    return mapCpcbVerifyResponse(res.data);
  } catch {
    return null;
  }
}

export async function verifyGstComplete(db, gst) {
  const normalized = normalizeGstin(gst);
  if (normalized.length !== 15) {
    return { success: false, error: 'Enter a valid 15-character GST number.' };
  }

  const baseUrl = await getClimetoApiBase(db);
  const climeto = await verifyViaClimeto(db, baseUrl, normalized);
  if (climeto?.success) return climeto;
  if (climeto?.success === false && climeto.error) {
    return climeto;
  }

  const cpcb = await verifyViaCpcb(normalized);
  if (cpcb) return cpcb;

  return {
    success: false,
    error: 'GST verification failed — Climeto API and CPCB both unavailable.',
    gst: normalized,
  };
}
