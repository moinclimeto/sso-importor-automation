import { normalizeEntityType, normalizeRegistrationType } from './entityRegistrationTypes.js';

export const PIBO_DROPDOWN_ENTITY_TYPES = ['Producer', 'Brand Owner', 'Importer'];

/** Shown when GST/master says Registered but CPCB PIBO sync has no match. */
export const PIBO_NOT_FOUND_WARNING =
  'Not found in synced CPCB PIBO records. This is separate from GST/Master "Registered" status — verify on the CPCB portal if EPR registration is required.';

export function isPiboSearchEligible(registrationType, entityType) {
  return normalizeRegistrationType(registrationType) === 'Registered'
    && PIBO_DROPDOWN_ENTITY_TYPES.includes(normalizeEntityType(entityType));
}

/** Climeto API expects lowercase slug-style entity types (e.g. `brand owner`). */
export function toPiboApiEntityType(entityType) {
  const normalized = normalizeEntityType(entityType);
  const map = {
    Producer: 'producer',
    'Brand Owner': 'brand owner',
    Importer: 'importer',
  };
  return map[normalized] || String(entityType || '').trim().toLowerCase();
}

export function sortPiboEntitiesByHierarchy(entities, searchTerm = '') {
  const list = Array.isArray(entities) ? [...entities] : [];
  const q = String(searchTerm || '').trim().toLowerCase();
  if (!q) {
    return list.sort((a, b) => {
      const nameA = String(a.entity_name || a.trade_name || '').toLowerCase();
      const nameB = String(b.entity_name || b.trade_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  const rank = (entity) => {
    const name = String(entity.entity_name || entity.trade_name || '').toLowerCase();
    const gst = String(entity.gst || '').toLowerCase();
    const reg = String(entity.registration_number || entity.epr_registration_number || '').toLowerCase();
    if (name === q || gst === q || reg === q) return 0;
    if (name.startsWith(q) || gst.startsWith(q) || reg.startsWith(q)) return 1;
    if (name.includes(q) || gst.includes(q) || reg.includes(q)) return 2;
    return 3;
  };

  return list.sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const nameA = String(a.entity_name || a.trade_name || '').toLowerCase();
    const nameB = String(b.entity_name || b.trade_name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function formatPiboEntitySummary(entity) {
  const parts = [
    entity.entity_name || entity.trade_name,
    entity.registration_number || entity.epr_registration_number ? `Reg ${entity.registration_number || entity.epr_registration_number}` : '',
    entity.gst ? `GST ${entity.gst}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Map a PIBO API / IPC entity row into supplier master form fields. */
export function normalizePiboEntityForForm(entity) {
  if (!entity) return {};
  return {
    trade_name: String(entity.trade_name || entity.entity_name || entity.name || '').trim(),
    gst_number: String(entity.gst || entity.gstin || '').trim(),
    address: String(entity.address || '').trim(),
    mobile: String(entity.mobile ?? entity.mobileNo ?? entity.mobile_number ?? entity.phone ?? '').trim(),
    registration_number: String(
      entity.registration_number ?? entity.epr_registration_number ?? entity.registrationNumber ?? '',
    ).trim(),
    state: String(entity.state || '').trim(),
    pan: String(entity.pan || entity.panNo || '').trim(),
    entity_type: normalizeEntityType(entity.entity_type || entity.entityType || ''),
  };
}
