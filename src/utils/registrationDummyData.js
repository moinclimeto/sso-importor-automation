/**
 * Helper utilities for PWP registration automation data resolution.
 * All dummy fallback data has been removed. Users must supply actual data or use OCR.
 */

/** Fallback login credentials if none provided. */
export const REGISTRATION_LOGIN_DUMMY = {
  email: '',
  mobile: '',
  password: '',
};

export function resolveRegistrationLoginCredentials(data = {}) {
  return {
    email: String(data.email || REGISTRATION_LOGIN_DUMMY.email).trim(),
    mobile: String(data.mobile || REGISTRATION_LOGIN_DUMMY.mobile).trim(),
    password: String(data.password || REGISTRATION_LOGIN_DUMMY.password),
  };
}

function pickNonEmpty(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      out[key] = value;
    }
  }
  return out;
}

export function hasCompleteRegistrationData(data) {
  return Boolean(
    data?.gstin &&
    data?.authPan &&
    data?.authName &&
    data?.authDob &&
    data?.companyName &&
    data?.dateOfEstablishment
  );
}

/** Resolves registration data strictly from provided docData. No dummy fallback. */
export function resolveRegistrationData(docData = {}) {
  const data = pickNonEmpty({}, docData);

  if (hasCompleteRegistrationData(docData)) {
    return { data, isDummy: false, source: 'documents' };
  }

  return { data, isDummy: false, source: 'partial' };
}

export function isRegistrationReadyWithFallback(docs = [], docData = {}) {
  if (hasCompleteRegistrationData(docData)) {
    return { ready: true, isDummy: false, missing: [] };
  }
  
  const types = new Set((docs || []).map((d) => d.doc_type));
  const missing = ['gst', 'person_pan', 'company_pan'].filter((t) => !types.has(t));
  return { ready: false, isDummy: false, missing };
}
