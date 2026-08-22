import axios from 'axios';
import { normalizeEntityType } from '../shared/entityRegistrationTypes.js';
import { toPiboApiEntityType } from '../shared/piboEntityMasterData.js';
import { buildClimetoApiUrl, getClimetoApiBase, getClimetoAuthHeaders } from './climetoApiConfig.js';

function mapPiboRow(row, source, idx) {
  const name = String(row.name || row.entityName || row.entity_name || row.tradeName || row.trade_name || '').trim();
  const entityId = row.entity_id ?? row.id;
  const registrationNumber = String(
    row.registration_number ?? row.eprRegistrationNumber ?? row.eprNo ?? row.epr_registration_number ?? row.registrationNumber ?? '',
  ).trim();
  return {
    id: entityId != null ? `${source}-${entityId}` : `${source}-${idx}`,
    entity_id: entityId,
    entity_name: name,
    trade_name: name,
    entity_type: normalizeEntityType(row.entityType || row.entity_type || row.applicantType),
    state: String(row.state || '').trim(),
    address: String(row.address || row.registeredAddress || row.principalPlaceOfBusiness || row.registered_address || '').trim(),
    mobile: String(row.mobile ?? row.mobileNo ?? row.mobile_number ?? row.phone ?? row.contactNumber ?? '').trim(),
    pan: String(row.pan || row.panNo || '').trim(),
    gst: String(row.gst || row.gstin || row.gstNo || '').trim(),
    registration_number: registrationNumber,
    epr_registration_number: registrationNumber,
    source,
  };
}

export async function searchPiboEntities(db, { search = '', entityType = '', state = '', limit } = {}) {
  const baseUrl = await getClimetoApiBase(db);
  const params = new URLSearchParams();
  if (entityType) params.set('entityType', toPiboApiEntityType(entityType));
  if (String(search || '').trim()) params.set('search', String(search).trim());
  if (state) params.set('state', state);
  if (limit != null && limit !== '') {
    const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    params.set('limit', String(cappedLimit));
  }

  try {
    const url = buildClimetoApiUrl(baseUrl, 'pibo-entities/search', params.toString());
    const res = await axios.get(url, {
      headers: await getClimetoAuthHeaders(db),
      timeout: 12000,
      validateStatus: () => true,
    });
    if (res.status === 401) {
      return {
        success: false,
        entities: [],
        error: 'Climeto API auth failed — please sign in again from the login page.',
      };
    }
    if (res.status < 400) {
      const body = res.data || {};
      const list = body.data
        || body.entities
        || body.results
        || (Array.isArray(body) ? body : []);
      if (Array.isArray(list)) {
        return {
          success: body.status ? body.status === 'success' : true,
          entities: list.map((row, idx) => mapPiboRow(row, 'climeto_pibo', idx)),
          message: list.length ? `Found ${list.length} PIBO record(s).` : 'No PIBO records found.',
          meta: body.meta || null,
        };
      }
    }
  } catch {
    /* fall through */
  }

  return {
    success: true,
    entities: [],
    message: 'PIBO search unavailable — check Climeto_Api_BASE_URL in .env.',
  };
}
