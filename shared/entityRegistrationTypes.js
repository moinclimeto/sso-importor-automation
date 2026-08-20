export const REGISTRATION_TYPE_OPTIONS = ['Registered', 'Unregistered'];

export const ENTITY_TYPE_OPTIONS = [
  'PWPs',
  'Producers',
  'Brand Owners',
  'PIBOs',
  'Importers',
];

export function normalizeGstin(gst) {
  return String(gst || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

export function normalizeRegistrationType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('unregistered') || v === 'no' || v === 'false') return 'Unregistered';
  if (v.includes('registered') || v === 'yes' || v === 'true') return 'Registered';
  return REGISTRATION_TYPE_OPTIONS.find((o) => o.toLowerCase() === v) || '';
}

const ENTITY_ALIASES = {
  pwp: 'PWPs',
  pwps: 'PWPs',
  producer: 'Producers',
  producers: 'Producers',
  'brand owner': 'Brand Owners',
  'brand owners': 'Brand Owners',
  pibo: 'PIBOs',
  pibos: 'PIBOs',
  importer: 'Importers',
  importers: 'Importers',
};

export function normalizeEntityType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (ENTITY_ALIASES[v]) return ENTITY_ALIASES[v];
  return ENTITY_TYPE_OPTIONS.find((o) => o.toLowerCase() === v) || '';
}

export function mapGstDetailsToEntity(gstBody) {
  const data = gstBody?.data || gstBody || {};
  const gstStatus = String(data.status || data.gstStatus || '').trim();
  const isActive = gstStatus && !/cancelled|canceled|inactive|suspended|invalid|revoked/i.test(gstStatus);

  return {
    registration_type: isActive ? 'Registered' : 'Unregistered',
    entity_type: normalizeEntityType(
      data.applicantType || data.entityType || data.entity_type || data.companyBusinessType,
    ),
    trade_name: data.tradeName || data.trade_name || data.legalName || data.legal_name || '',
    legal_name: data.legalName || data.legal_name || '',
    address: data.address || data.principalPlaceOfBusiness || data.registeredAddress || '',
    pan: data.pan || data.panNo || '',
    gst_status: gstStatus,
    source: 'cpcb_gst',
  };
}

export function entityOptionLabel(entity) {
  const parts = [
    entity.trade_name || entity.legal_name || entity.gst,
    entity.entity_type,
    entity.registration_type,
  ].filter(Boolean);
  return parts.join(' · ');
}
