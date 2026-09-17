export const REGISTRATION_TYPE_OPTIONS = ['Registered', 'Unregistered'];

export const APPLICANT_TYPES = ['PIBO', 'SIMP', 'PWP', 'ULB'];

export const SUB_APPLICANT_OPTIONS_MAP = {
  PIBO: ['Importer', 'Brand Owner'],
  SIMP: [
    'Importer of raw material',
    'Seller of raw material',
    'Producer (Small or Micro)',
    'Manufacturer of raw material',
  ],
  PWP: ['Recycler', 'Co-processor'],
  ULB: ['ULB'],
};

export function isSimpApplicant(applicantType = '') {
  return /simp/i.test(String(applicantType || ''));
}

/** SIMP → Importer of raw material only (not seller / manufacturer / producer). */
export function isSimpRawMaterial(applicantType = '', subApplicantType = '') {
  return (
    isSimpApplicant(applicantType) &&
    /importer\s+of\s+raw\s+material/i.test(String(subApplicantType || ''))
  );
}


export const PURCHASE_ENTITY_TYPES = [
  'Producer',
  'PWP',
  'Brand Owner',
  'Importer',
  'Manufacturer',
  'Other',
];

export const PURCHASE_ENTITY_TYPES_BO = [
  'Brand Owner',
  'Importer',
  'Recycler',
  'Seller of raw material',
  'Importer of raw material',
  'Manufacturer of raw material',
  'Producer (Small or Micro)',
];

export const ENTITY_TYPE_OPTIONS = PURCHASE_ENTITY_TYPES;
export const ENTITY_TYPE_OPTIONS_BO = PURCHASE_ENTITY_TYPES_BO;

export function getPurchaseEntityTypes(subApplicantType = '') {
  if (/brand\s*owner|raw\s*material|simp/i.test(subApplicantType)) {
    return PURCHASE_ENTITY_TYPES_BO;
  }
  return PURCHASE_ENTITY_TYPES;
}

export function normalizeGstin(gst) {
  return String(gst || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

/** GSTIN characters 3–12 are the PAN. CPCB Plant/Unit GST must match company PAN. */
export function panFromGstin(gstin = '') {
  const g = normalizeGstin(gstin);
  return g.length >= 12 ? g.slice(2, 12) : '';
}

export function unitGstMatchesCompanyPan(unitGst = '', companyPan = '', companyGstin = '') {
  const unitPan = panFromGstin(unitGst);
  const pan = String(companyPan || panFromGstin(companyGstin) || '').trim().toUpperCase();
  if (!unitPan || !pan) return true;
  return unitPan === pan;
}

export function normalizeRegistrationType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('unregistered') || v === 'no' || v === 'false') return 'Unregistered';
  if (v.includes('registered') || v === 'yes' || v === 'true') return 'Registered';
  return REGISTRATION_TYPE_OPTIONS.find((o) => o.toLowerCase() === v) || '';
}

const ENTITY_ALIASES = {
  pwp: 'PWP',
  pwps: 'PWP',
  recycler: 'Recycler',
  recyclers: 'Recycler',
  producer: 'Producer',
  producers: 'Producer',
  'producer (small or micro)': 'Producer (Small or Micro)',
  'brand owner': 'Brand Owner',
  'brand owners': 'Brand Owner',
  importer: 'Importer',
  importers: 'Importer',
  'importer of raw material': 'Importer of raw material',
  'importers of raw material': 'Importer of raw material',
  'seller of raw material': 'Seller of raw material',
  'sellers of raw material': 'Seller of raw material',
  manufacturer: 'Manufacturer',
  manufacturers: 'Manufacturer',
  'manufacturer of raw material': 'Manufacturer of raw material',
  'manufacturers of raw material': 'Manufacturer of raw material',
  other: 'Other',
  others: 'Other',
  pibo: 'Other',
  pibos: 'Other',
};

export function normalizeEntityType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (ENTITY_ALIASES[v]) return ENTITY_ALIASES[v];
  const allKnown = [...PURCHASE_ENTITY_TYPES, ...PURCHASE_ENTITY_TYPES_BO];
  return allKnown.find((o) => o.toLowerCase() === v) || '';
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
