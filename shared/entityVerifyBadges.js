/** Recycled / match % fields returned by Climeto GST verify / master-data APIs. */
export function extractRecycledPercentFromPayload(row = {}) {
  if (!row || typeof row !== 'object') return null;

  const candidates = [
    row.recycled_plastic_percent,
    row.recycledPlasticPercent,
    row.recycledPlasticPercentage,
    row.recycled_plastic_percentage,
    row.recycledPercent,
    row.percentage,
    row.percent,
    row.raw?.recycledPlasticPercentage,
    row.raw?.recycled_plastic_percentage,
    row.raw?.recycledPlasticPercent,
    row.raw?.recycled_plastic_percent,
    row.raw?.recycledPercent,
    row.raw?.percentage,
    row.raw?.percent,
  ];

  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue;
    const n = parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Normalize API match score (0–1 or 0–100) to display percent. */
export function formatMatchConfidence(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n <= 1) return Math.round(n * 100);
  if (n <= 100) return Math.round(n);
  return Math.round(n);
}

export function resolveEntityVerifyBadges(entity = {}) {
  return {
    recycledPercent: extractRecycledPercentFromPayload(entity),
    matchPercent: formatMatchConfidence(entity.confidence ?? entity.matchScore ?? entity.match_score),
  };
}

export function formatPercentBadge(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '';
  const rounded = Number.isInteger(n) ? n : Math.round(n * 10) / 10;
  return `${rounded}%`;
}

/** GST verify with PIBO/master registration (typically confidence ≥ 90). */
export const MASTER_REGISTRATION_CONFIDENCE = 90;

export function hasMasterRegistrationMatch(verified = {}) {
  if (!verified || typeof verified !== 'object') return false;
  const matches = verified.masterDataMatches ?? verified.raw?.masterDataMatches ?? [];
  if (Array.isArray(matches) && matches.length > 0) return true;
  if (verified.raw?.masterDataMatch) return true;
  return false;
}

export function resolveGstVerifyConfidence(verified = {}) {
  const n = parseFloat(
    verified.confidence
    ?? verified.raw?.confidence
    ?? verified.matchScore
    ?? verified.raw?.matchScore,
  );
  return Number.isFinite(n) ? n : null;
}

/** Entity type auto-fill only when master-data registration exists (not OCR guess @ 50% confidence). */
export function shouldApplyEntityTypeFromVerify(verified = {}, entity = {}) {
  if (entity?.source === 'climeto_master_data') {
    return Boolean(String(entity.entity_type || '').trim());
  }
  if (!hasMasterRegistrationMatch(verified)) return false;
  const confidence = resolveGstVerifyConfidence(verified);
  if (confidence != null && confidence < MASTER_REGISTRATION_CONFIDENCE) return false;
  return Boolean(String(entity?.entity_type || verified?.entity_type || '').trim());
}

export function sanitizeVerifiedEntity(entity = {}, verified = null) {
  if (!entity) return entity;
  if (shouldApplyEntityTypeFromVerify(verified, entity)) return entity;
  return { ...entity, entity_type: '' };
}
