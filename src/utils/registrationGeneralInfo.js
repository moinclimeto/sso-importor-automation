export const TYPE_OF_BUSINESS_OPTIONS = [
  'Pvt. Ltd.',
  'Public Ltd.',
  'Public Sector Undertaking (PSU)',
  'Partnership/Proprietorship',
  'Club/Society/Trust/AOP',
  'Limited Liability Partnership',
  'Others',
];

export const TYPE_OF_COMPANY_OPTIONS = ['Micro', 'Small', 'Medium', 'Large'];

export const INDIAN_STATES = [
  'ANDAMAN AND NICOBAR ISLANDS',
  'ANDHRA PRADESH',
  'ARUNACHAL PRADESH',
  'ASSAM',
  'BIHAR',
  'CHANDIGARH',
  'CHHATTISGARH',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  'DELHI',
  'GOA',
  'GUJARAT',
  'HARYANA',
  'HIMACHAL PRADESH',
  'JAMMU AND KASHMIR',
  'JHARKHAND',
  'KARNATAKA',
  'KERALA',
  'LADAKH',
  'LAKSHADWEEP',
  'MADHYA PRADESH',
  'MAHARASHTRA',
  'MANIPUR',
  'MEGHALAYA',
  'MIZORAM',
  'NAGALAND',
  'ODISHA',
  'PUDUCHERRY',
  'PUNJAB',
  'RAJASTHAN',
  'SIKKIM',
  'TAMIL NADU',
  'TELANGANA',
  'TRIPURA',
  'UTTAR PRADESH',
  'UTTARAKHAND',
  'WEST BENGAL',
];

export function mapConstitutionToTypeOfBusiness(constitution) {
  const c = String(constitution || '').toLowerCase();
  if (/public\s*limited|public ltd/.test(c)) return 'Public Ltd.';
  if (/private\s*limited|pvt/.test(c)) return 'Pvt. Ltd.';
  if (/partnership|proprietorship|proprietor|sole/.test(c)) return 'Partnership/Proprietorship';
  if (/llp|limited liability partnership/.test(c)) return 'Limited Liability Partnership';
  if (/trust|society|club|aop|association/.test(c)) return 'Club/Society/Trust/AOP';
  if (/psu|public sector/.test(c)) return 'Public Sector Undertaking (PSU)';
  return '';
}

export function mapEnterpriseToTypeOfCompany(enterpriseType) {
  const e = String(enterpriseType || '').toLowerCase();
  if (/micro/.test(e)) return 'Micro';
  if (/small/.test(e)) return 'Small';
  if (/medium/.test(e)) return 'Medium';
  if (/large/.test(e)) return 'Large';
  return '';
}

export function extractStateFromAddress(address) {
  const addr = String(address || '').toUpperCase();
  for (const state of INDIAN_STATES) {
    if (addr.includes(state)) return state;
  }
  return '';
}

export function buildGeneralInfoFromDocData(docData = {}) {
  return {
    typeOfBusiness: mapConstitutionToTypeOfBusiness(docData.constitutionOfBusiness),
    typeOfCompany: mapEnterpriseToTypeOfCompany(docData.enterpriseType),
    registeredAddressLine1: docData.registeredAddress || '',
    registeredAddressLine2: docData.registeredAddressLine2 || '',
    cin: docData.cin || '',
    stateUt: extractStateFromAddress(docData.registeredAddress) || 'MADHYA PRADESH',
    district: docData.district || '',
  };
}

export const GENERAL_INFO_EMPTY = {
  typeOfBusiness: '',
  typeOfCompany: '',
  registeredAddressLine1: '',
  registeredAddressLine2: '',
  cin: '',
  stateUt: 'MADHYA PRADESH',
  district: '',
  authDesignation: '',
  password: '',
  confirmPassword: '',
};
