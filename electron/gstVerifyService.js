import axios from 'axios';
import { mapGstDetailsToEntity, normalizeGstin } from '../shared/entityRegistrationTypes.js';
import { buildClimetoApiUrl, getClimetoApiBase } from './climetoApiConfig.js';
import { panFromGstin } from './gstPartyUtils.js';

const CPCB_GST_URL = 'https://epr.cpcb.gov.in/cpcbadmin/api/v1/gst/details';

export { getClimetoApiBase };

function mapVerifyResponse(payload, source) {
  const data = payload?.data || payload || {};
  const mapped = mapGstDetailsToEntity({ data });
  return {
    success: true,
    gst: normalizeGstin(data.gstNo || data.gstin || data.gst || mapped.gst),
    legalName: data.legalName || data.legal_name || mapped.legal_name || '',
    tradeName: data.tradeName || data.trade_name || mapped.trade_name || '',
    address: data.address || data.principalPlaceOfBusiness || mapped.address || '',
    pan: data.pan || data.panNo || panFromGstin(data.gstNo || data.gstin) || mapped.pan || '',
    status: data.status || mapped.gst_status || '',
    registration_type: mapped.registration_type,
    entity_type: mapped.entity_type,
    source,
    raw: data,
  };
}

async function verifyViaClimeto(baseUrl, gst) {
  const normalized = normalizeGstin(gst);
  const queryVariants = [
    `gst=${encodeURIComponent(normalized)}`,
    `gstin=${encodeURIComponent(normalized)}`,
  ];

  for (const query of queryVariants) {
    try {
      const url = buildClimetoApiUrl(baseUrl, 'gst/verify/complete', query);
      const res = await axios.get(url, { timeout: 12000, validateStatus: () => true });
      if (res.status >= 400 || !res.data) continue;
      if (res.data.success === false) continue;
      return mapVerifyResponse(res.data, 'climeto_gst');
    } catch {
      /* next */
    }
  }
  return null;
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
    return mapVerifyResponse(res.data, 'cpcb_gst');
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
  const climeto = await verifyViaClimeto(baseUrl, normalized);
  if (climeto) return climeto;

  const cpcb = await verifyViaCpcb(normalized);
  if (cpcb) return cpcb;

  return {
    success: false,
    error: 'GST verification failed — Climeto API and CPCB both unavailable.',
    gst: normalized,
  };
}
