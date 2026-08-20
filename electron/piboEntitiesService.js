import axios from 'axios';
import { normalizeEntityType } from '../shared/entityRegistrationTypes.js';
import { buildClimetoApiUrl, getClimetoApiBase } from './climetoApiConfig.js';

function mapPiboRow(row, source, idx) {
  return {
    id: row.id != null ? `${source}-${row.id}` : `${source}-${idx}`,
    entity_name: row.entityName || row.entity_name || row.tradeName || row.trade_name || row.name || '',
    trade_name: row.tradeName || row.trade_name || row.entityName || row.entity_name || '',
    entity_type: normalizeEntityType(row.entityType || row.entity_type || row.applicantType),
    state: row.state || '',
    pan: row.pan || row.panNo || '',
    gst: row.gst || row.gstin || row.gstNo || '',
    epr_registration_number: row.eprRegistrationNumber || row.eprNo || row.epr_registration_number || '',
    source,
  };
}

export async function searchPiboEntities(db, { search = '', entityType = '', state = '' } = {}) {
  const baseUrl = await getClimetoApiBase(db);
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (entityType) params.set('entityType', entityType);
  if (state) params.set('state', state);

  try {
    const url = buildClimetoApiUrl(baseUrl, 'pibo-entities/search', params.toString());
    const res = await axios.get(url, { timeout: 12000, validateStatus: () => true });
    if (res.status < 400) {
      const list = res.data?.entities
        || res.data?.results
        || res.data?.data
        || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(list)) {
        return {
          success: true,
          entities: list.map((row, idx) => mapPiboRow(row, 'climeto_pibo', idx)),
          message: list.length ? `Found ${list.length} PIBO record(s).` : 'No PIBO records found.',
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
