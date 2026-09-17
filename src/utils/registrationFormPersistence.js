import { buildRegistrationDataFromDocuments } from './registrationDataMapper.js';
import { buildGeneralInfoFromDocData, GENERAL_INFO_EMPTY } from './registrationGeneralInfo.js';

export const REGISTRATION_DOC_TYPES = new Set([
  'gst', 'person_pan', 'company_pan', 'cto', 'cin', 'udyam', 'iec',
  'unit_gst', 'supporting_category_doc', 'operations_details',
  'plastic_packaging_picture', 'covering_letter', 'signature', 'self_declaration',
]);

export function pickNonEmpty(obj = {}) {
  return Object.fromEntries(
    Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
  );
}

export const PART_A_PDF_DOC_BASE = {
  detailsOfProductsPath: 'operations_details',
  representativePicturePath: 'plastic_packaging_picture',
  typeOfCompanyDoc: 'supporting_category_doc',
  dicRegistrationDoc: 'dic_registration',
  cinDoc: 'cin',
  companyPanDoc: 'company_pan',
  personPanDoc: 'person_pan',
  gstDoc: 'gst',
  gstinDoc: 'gst',
  unitGstDoc: 'unit_gst',
};

const PART_A_PDF_ALIASES = {
  cinDoc: ['cinDocumentPath'],
  companyPanDoc: ['companyPanDocumentPath'],
  personPanDoc: ['personPanDocumentPath', 'authPanDoc'],
  gstDoc: ['gstDocumentPath', 'gstinDoc'],
};

export function applyPartAPdfPath(autoData, field, filePath) {
  const next = { ...(autoData || {}), [field]: filePath };
  for (const alias of PART_A_PDF_ALIASES[field] || []) {
    next[alias] = filePath;
  }
  return next;
}

/** Document OCR fills empty fields; saved user edits win on conflict. */
export function mergeAutoData(emptyAuto, docData = {}, savedAuto = {}) {
  return { ...emptyAuto, ...pickNonEmpty(docData), ...pickNonEmpty(savedAuto) };
}

export function mergeGeneralInfoFromSources(docData = {}, savedGeneral = {}) {
  const fromDocs = buildGeneralInfoFromDocData(docData);
  const saved = pickNonEmpty(savedGeneral);
  const docFields = pickNonEmpty(fromDocs);
  const docHasUnitGst = Boolean(docData.hasUnitGst || docFields.unitGst || docFields.plantAddress);
  const savedHasUnitFields = Boolean(
    String(savedGeneral.unitGst || '').trim() || String(savedGeneral.plantAddress || '').trim()
  );

  return {
    ...GENERAL_INFO_EMPTY,
    ...docFields,
    ...saved,
    typeOfBusiness: saved.typeOfBusiness || docFields.typeOfBusiness || docData.typeOfBusiness || '',
    typeOfCompany: saved.typeOfCompany || docFields.typeOfCompany || docData.typeOfCompany || '',
    registeredAddressLine1:
      saved.registeredAddressLine1 || docFields.registeredAddressLine1 || docData.registeredAddress || '',
    district: saved.district || docFields.district || docData.district || docData.unitDistrict || '',
    cin: saved.cin || docFields.cin || docData.cin || '',
    stateUt: saved.stateUt || docFields.stateUt || docData.stateUt || '',
    unitGst: saved.unitGst || docFields.unitGst || docData.unitGst || '',
    plantAddress: saved.plantAddress || docFields.plantAddress || docData.plantAddress || '',
    isSameAsRegisteredAddress:
      docHasUnitGst && !savedHasUnitFields
        ? false
        : typeof savedGeneral.isSameAsRegisteredAddress === 'boolean'
          ? savedGeneral.isSameAsRegisteredAddress
          : docFields.isSameAsRegisteredAddress ?? true,
    authDesignation: saved.authDesignation || docData.authDesignation || '',
    password: savedGeneral.password || '',
    confirmPassword: savedGeneral.confirmPassword || savedGeneral.password || '',
  };
}

export async function fetchRegistrationDocData() {
  if (!window.pwp?.documents?.getAll) {
    return { docs: [], docData: {} };
  }
  const docs = await window.pwp.documents.getAll();
  const relevant = (docs || []).filter((d) => REGISTRATION_DOC_TYPES.has(d.doc_type));
  return {
    docs,
    docData: buildRegistrationDataFromDocuments(relevant),
  };
}

export function hasPersistableFormContent({ autoData = {}, generalInfo = {}, email = '', mobile = '' } = {}) {
  if (String(email || '').trim() || String(mobile || '').trim()) return true;
  if (Object.keys(pickNonEmpty(autoData)).length > 0) return true;
  const general = pickNonEmpty(generalInfo);
  delete general.password;
  delete general.confirmPassword;
  return Object.keys(general).length > 0;
}

export function buildRegistrationSavePayload({
  savedRegistration,
  email,
  mobile,
  autoData,
  generalInfo,
  ceprId,
}) {
  const appType = generalInfo?.applicantType || savedRegistration?.applicant_type || 'PIBO';
  const defaultSub = /simp/i.test(appType) ? 'Importer of raw material' : 'Importer';
  const payload = {
    applicant_type: appType,
    sub_applicant_type: generalInfo?.subApplicantType || savedRegistration?.sub_applicant_type || defaultSub,
    email: String(email || '').trim() || undefined,
    mobile: String(mobile || '').trim() || undefined,
    password: generalInfo?.password?.trim() || undefined,
    confirm_password: generalInfo?.confirmPassword?.trim() || generalInfo?.password?.trim() || undefined,
    form_data_json: JSON.stringify({
      email: email || '',
      mobile: mobile || '',
      autoData: autoData || {},
      generalInfo: generalInfo || {},
    }),
  };
  if (ceprId) payload.cepr_id = ceprId;
  return payload;
}
