import axios from 'axios';
import { mapGstDetailsToEntity, normalizeGstin } from '../shared/entityRegistrationTypes.js';
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

/** Map Climeto POST /gst/verify/complete response (gstZenResponse). */
export function mapClimetoGstVerifyResponse(payload) {
  if (!payload || payload.success === false) return null;

  const gstin = normalizeGstin(payload.gstin || payload.gst);
  const zen = payload.gstZenResponse || {};
  const statusLabel = zen.company_status || zen.status || '';
  const active = zen.valid !== false && isActiveGstStatus(statusLabel);

  return {
    success: true,
    gst: gstin,
    legalName: zen.legal_name || zen.legalName || '',
    tradeName: zen.trade_name || zen.tradeName || zen.legal_name || '',
    address: zen.primary_address || zen.address || '',
    pan: payload.panNumber || zen.pan || panFromGstin(gstin) || '',
    status: statusLabel || (active ? 'Active' : 'Inactive'),
    state: zen.state || '',
    registration_type: active ? 'Registered' : 'Unregistered',
    entity_type: '',
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
