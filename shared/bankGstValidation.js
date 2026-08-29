/** Indian GSTIN — 15 chars, e.g. 27AABCU9603R1ZM */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** IFSC — 11 chars, e.g. HDFC0001234 (4 bank letters + 0 + 6 branch) */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function normalizeGstin(value = '') {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

export function normalizeIfscCode(value = '') {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
}

export function validateGstin(value = '', { label = 'GST number' } = {}) {
  const gst = normalizeGstin(value);
  if (!gst) {
    return { valid: false, error: `${label} is required before publish` };
  }
  if (gst.length !== 15) {
    return { valid: false, error: `${label} must be 15 characters` };
  }
  if (!GSTIN_RE.test(gst)) {
    return { valid: false, error: `Invalid ${label} format — use 15-character GSTIN (e.g. 27AABCU9603R1ZM)` };
  }
  return { valid: true, value: gst };
}

export function validateIfscCode(value = '', { label = 'IFSC code' } = {}) {
  const ifsc = normalizeIfscCode(value);
  if (!ifsc) {
    return { valid: false, error: `${label} is required before publish` };
  }
  if (ifsc.length !== 11) {
    return { valid: false, error: `${label} must be 11 characters` };
  }
  if (!IFSC_RE.test(ifsc)) {
    return { valid: false, error: `Invalid ${label} format — e.g. HDFC0001234 (4 letters + 0 + 6 chars)` };
  }
  return { valid: true, value: ifsc };
}
