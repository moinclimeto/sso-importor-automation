import { parseGstLabeledAddress } from './registrationDataMapper.js';

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
  const defaultState = extractStateFromAddress(docData.registeredAddress) || 'MADHYA PRADESH';
  const addressLine = docData.registeredAddress || '';
  let district = docData.district || '';
  let cleanAddress = addressLine;
  try {
    const parsed = parseGstLabeledAddress(addressLine);
    if (parsed.address) cleanAddress = parsed.address;
    if (!district && parsed.district) district = parsed.district;
  } catch {
    /* mapper helper missing */
  }

  const hasUnitGst = Boolean(docData.hasUnitGst || docData.unitGst || docData.plantAddress);
  const plantAddress = docData.plantAddress || '';
  const unitGst = docData.unitGst || '';
  const unitDistrict = docData.unitDistrict || '';
  const unitState = plantAddress ? extractStateFromAddress(plantAddress) : '';

  return {
    typeOfBusiness: mapConstitutionToTypeOfBusiness(docData.constitutionOfBusiness),
    typeOfCompany: mapEnterpriseToTypeOfCompany(docData.enterpriseType),
    registeredAddressLine1: cleanAddress,
    registeredAddressLine2: docData.registeredAddressLine2 || '',
    cin: docData.cin || '',
    isSameAsRegisteredAddress: hasUnitGst ? false : true,
    plantAddress,
    unitGst,
    stateUt: hasUnitGst && unitState ? unitState : defaultState,
    operatingStates: hasUnitGst && unitState ? [unitState] : [defaultState],
    district: hasUnitGst && unitDistrict ? unitDistrict : district,
  };
}

export const GENERAL_INFO_EMPTY = {
  typeOfBusiness: '',
  typeOfCompany: '',
  registeredAddressLine1: '',
  registeredAddressLine2: '',
  isSameAsRegisteredAddress: true,
  plantAddress: '',
  unitGst: '',
  cin: '',
  stateUt: 'MADHYA PRADESH',
  operatingStates: [],
  district: '',
  authDesignation: '',
  password: '',
  confirmPassword: '',
  hasProductionFacility: 'Not Applicable',
  capitalInvested: '',
  yearOfCommencement: '',
  plasticConsumed: {
    '2024-25': { cat1: '0', cat2: '0', cat3: '0', cat4: '0' },
    '2025-26': { cat1: '0', cat2: '0', cat3: '0', cat4: '0' }
  },
  complianceStatus: '',
  thicknessOfPlastic: '',
  
  // Part B
  partBSection4: [],
  partBTransactions: {
    sec5a: [],
    sec5b: [],
    sec5c: [],
    sec5d: []
  },

  // Part C (document paths)
  partCCoveringLetter: '',
  partCSignature: '',
  partCAuditedStatement: '',
  partCApplicationNo: '',
  partCLetterPlace: '',
};
