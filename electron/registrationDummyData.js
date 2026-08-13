/** Backend fallback for registration automation when frontend sends incomplete payload. */
export const REGISTRATION_DUMMY_DATA = {
  gstin: '23AAHCB2620B1ZI',
  companyPan: 'AAHCB2620B',
  companyName: 'test company pvt ltd',
  legalName: 'test company pvt ltd',
  dateOfEstablishment: '2010-04-01',
  authPan: 'ABCPV1234A',
  authName: 'SUNIL KUMAR',
  authDob: '1985-06-15',
  constitutionOfBusiness: 'Public Limited Company',
  registeredAddress: 'test company pvt ltd, Satna Road, Maihar, Madhya Pradesh 485771',
  district: 'Maihar',
  stateUt: 'MADHYA PRADESH',
  typeOfBusiness: 'Public Ltd.',
  typeOfCompany: 'Large',
  authDesignation: 'Director',
  password: 'Test@1234',
  cin: 'L26943MP1946PLC000369',
  ctoNumber: 'CTO/MP/2020/12345',
  ctoValidity: '2028-03-31',
  dateOfCommencement: '2010-06-01',
  /** Dummy PAN upload for Supporting Documents step — resolved from ~/Downloads/pan.pdf */
  panDocumentPath: '',
};

export function withRegistrationDummyFallback(data = {}) {
  const out = { ...REGISTRATION_DUMMY_DATA };
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      out[key] = value;
    }
  }
  return out;
}
