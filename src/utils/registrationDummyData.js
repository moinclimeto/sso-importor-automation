/**
 * Test / dev fallback data for PWP registration automation.
 * Used when no documents are uploaded in DB (real OCR data takes priority when present).
 */
export const REGISTRATION_USE_DUMMY_FALLBACK = true;

export const REGISTRATION_DUMMY_DATA = {
  gstin: '23AAHCB2620B1ZI',
  companyPan: 'AAHCB2620B',
  companyName: 'test company pvt ltd',
  legalName: 'test company pvt ltd',
  dateOfEstablishment: '2010-04-01',
  authPan: 'ABCPV1234A',
  authName: 'SUNIL KUMAR',
  authDob: '1985-06-13',
  constitutionOfBusiness: 'Private Limited Company',
  registeredAddress: 'test company pvt ltd, Satna Road, Maihar, Madhya Pradesh 485771',
  registeredAddressLine1: 'test company pvt ltd, Satna Road, Maihar, Madhya Pradesh 485771',
  registeredAddressLine2: '',
  district: 'Maihar',
  stateUt: 'MADHYA PRADESH',
  cin: 'L26943MP1946PLC000369',
  typeOfBusiness: 'Pvt. Ltd.',
  typeOfCompany: 'Large',
  authDesignation: 'Director',
  ctoNumber: 'CTO/MP/2020/12345',
  ctoValidity: '2028-03-31',
  dateOfCommencement: '2010-06-01',
  industryCategory: 'Orange',
  allowedCapacity: 'Cement Manufacturing',
  enterpriseType: 'Large',
  password: '',
  confirmPassword: '',
};

/** Fallback login credentials when DB has no saved contact (dev / first-time after registration). */
export const REGISTRATION_LOGIN_DUMMY = {
  email: 'amreen.climeto@gmail.com',
  mobile: '9109424392',
  password: 'Pass@321',
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

/** Prefer uploaded document data; fill gaps from dummy when fallback is enabled. */
export function resolveRegistrationData(docData = {}) {
  const merged = pickNonEmpty(REGISTRATION_DUMMY_DATA, docData);

  if (hasCompleteRegistrationData(docData)) {
    return { data: docData, isDummy: false, source: 'documents' };
  }

  if (REGISTRATION_USE_DUMMY_FALLBACK) {
    return { data: merged, isDummy: true, source: 'dummy' };
  }

  return { data: merged, isDummy: false, source: 'partial' };
}

export function isRegistrationReadyWithFallback(docs = [], docData = {}) {
  if (hasCompleteRegistrationData(docData)) {
    return { ready: true, isDummy: false, missing: [] };
  }
  if (REGISTRATION_USE_DUMMY_FALLBACK) {
    return { ready: true, isDummy: true, missing: [] };
  }
  const types = new Set((docs || []).map((d) => d.doc_type));
  const missing = ['gst', 'person_pan', 'company_pan', 'cto'].filter((t) => !types.has(t));
  return { ready: false, isDummy: false, missing };
}
