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

/** Document OCR fills empty fields; saved user edits win on conflict. */
export function mergeAutoData(emptyAuto, docData = {}, savedAuto = {}) {
  return { ...emptyAuto, ...pickNonEmpty(docData), ...pickNonEmpty(savedAuto) };
}

export function mergeGeneralInfoFromSources(docData = {}, savedGeneral = {}) {
  const fromDocs = buildGeneralInfoFromDocData(docData);
  const saved = pickNonEmpty(savedGeneral);
  const docFields = pickNonEmpty(fromDocs);

  return {
    ...GENERAL_INFO_EMPTY,
    ...docFields,
    ...saved,
    typeOfBusiness: saved.typeOfBusiness || docFields.typeOfBusiness || docData.typeOfBusiness || '',
    typeOfCompany: saved.typeOfCompany || docFields.typeOfCompany || docData.typeOfCompany || '',
    registeredAddressLine1:
      saved.registeredAddressLine1 || docFields.registeredAddressLine1 || docData.registeredAddress || '',
    district: saved.district || docFields.district || docData.district || '',
    cin: saved.cin || docFields.cin || docData.cin || '',
    stateUt: saved.stateUt || docFields.stateUt || docData.stateUt || '',
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
  const payload = {
    applicant_type: savedRegistration?.applicant_type || 'PIBO',
    sub_applicant_type: savedRegistration?.sub_applicant_type || 'Importer',
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
