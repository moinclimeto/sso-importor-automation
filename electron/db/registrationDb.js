import { getDb, getDbFilePath } from './database.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('registration', 'registration.log');

const OPTIONAL_COLUMNS = [
  'sub_applicant_type',
  'cepr_id',
  'success_screenshot_path',
  'email',
  'mobile',
  'password',
  'confirm_password',
  'form_data_json',
  'has_production_facility',
  'capital_invested',
  'year_of_commencement',
  'details_of_products_produced_marketed',
  'representative_picture_of_plastic_packaging',
  'plastic_consumed_json',
  'compliance_status',
  'thickness_of_plastic',
  'importer_3a_json',
  'importer_3a_status',
  'importer_3b_json',
];

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function buildFormDataJson(data = {}, existingFormDataJson = null) {
  if (data.form_data_json) {
    try {
      const parsed = JSON.parse(data.form_data_json);
      if (parsed && typeof parsed === 'object') {
        if (!parsed.generalInfo || !parsed.autoData) {
          return JSON.stringify({
            email: parsed.email || data.email || '',
            mobile: parsed.mobile || data.mobile || '',
            generalInfo: parsed.generalInfo || parsed,
            autoData: parsed.autoData || parsed,
          });
        }
        return data.form_data_json;
      }
    } catch {
      /* keep going */
    }
  }
  if (data.formData && typeof data.formData === 'object') {
    return JSON.stringify(data.formData);
  }

  if (data.generalInfo !== undefined || data.autoData !== undefined) {
    return JSON.stringify({
      email: data.email ?? '',
      mobile: data.mobile ?? '',
      generalInfo: data.generalInfo ?? {},
      autoData: data.autoData ?? {},
    });
  }

  if (existingFormDataJson && (data.email !== undefined || data.mobile !== undefined || data.password !== undefined)) {
    try {
      const parsed = JSON.parse(existingFormDataJson);
      const generalInfo = { ...(parsed.generalInfo || {}) };
      if (data.password) {
        generalInfo.password = data.password;
        generalInfo.confirmPassword = data.confirm_password || data.password;
      }
      return JSON.stringify({
        email: data.email ?? parsed.email ?? '',
        mobile: data.mobile ?? parsed.mobile ?? '',
        generalInfo,
        autoData: parsed.autoData || {},
      });
    } catch {
      /* fall through */
    }
  }

  if (!existingFormDataJson && (data.email || data.mobile || data.password)) {
    return JSON.stringify({
      email: data.email || '',
      mobile: data.mobile || '',
      generalInfo: {},
      autoData: {},
    });
  }

  return existingFormDataJson || null;
}

function extractColumnsFromForm(formDataJson, data = {}) {
  let hasProductionFacility = emptyToNull(data.has_production_facility);
  let capitalInvested = emptyToNull(data.capital_invested);
  let yearOfCommencement = emptyToNull(data.year_of_commencement);
  let detailsOfProducts = emptyToNull(data.details_of_products_produced_marketed);
  let representativePicture = emptyToNull(data.representative_picture_of_plastic_packaging);
  let plasticConsumedJson = emptyToNull(data.plastic_consumed_json);
  let complianceStatus = emptyToNull(data.compliance_status);
  let thicknessOfPlastic = emptyToNull(data.thickness_of_plastic);
  let importer3aJson = emptyToNull(data.importer_3a_json);
  let importer3aStatus = emptyToNull(data.importer_3a_status);
  let importer3bJson = emptyToNull(data.importer_3b_json);

  if (!formDataJson) {
    return {
      hasProductionFacility,
      capitalInvested,
      yearOfCommencement,
      detailsOfProducts,
      representativePicture,
      plasticConsumedJson,
      complianceStatus,
      thicknessOfPlastic,
      importer3aJson,
      importer3aStatus,
      importer3bJson,
    };
  }

  try {
    const parsed = JSON.parse(formDataJson);
    const general = parsed.generalInfo || parsed;
    const auto = parsed.autoData || parsed;
    if (general.hasProductionFacility !== undefined) hasProductionFacility = emptyToNull(general.hasProductionFacility);
    if (general.capitalInvested !== undefined) capitalInvested = emptyToNull(general.capitalInvested);
    if (general.yearOfCommencement !== undefined || general.yearOfCommencement !== undefined) {
      yearOfCommencement = emptyToNull(general.yearOfCommencement || general.yearOfCommencement);
    }
    if (general.plasticConsumed !== undefined) plasticConsumedJson = JSON.stringify(general.plasticConsumed);
    if (general.complianceStatus !== undefined || general.complianceStatus !== undefined) {
      complianceStatus = emptyToNull(general.complianceStatus || general.complianceStatus);
    }
    if (general.thicknessOfPlastic !== undefined || general.thicknessOfPlastic !== undefined) {
      thicknessOfPlastic = emptyToNull(general.thicknessOfPlastic || general.thicknessOfPlastic);
    }
    if (auto.detailsOfProductsPath || auto.detailsOfProductsPath) {
      detailsOfProducts = emptyToNull(auto.detailsOfProductsPath || auto.detailsOfProductsPath);
    }
    if (auto.representativePicturePath || auto.representativePicturePath) {
      representativePicture = emptyToNull(auto.representativePicturePath || auto.representativePicturePath);
    }
    if (auto.importer3a) importer3aJson = JSON.stringify(auto.importer3a);
    if (auto.importer3b) importer3bJson = JSON.stringify(auto.importer3b);
    if (general.importer3aStatus) importer3aStatus = emptyToNull(general.importer3aStatus);
  } catch (err) {
    log.warn('form_data_json parse failed', { error: err.message });
  }

  return {
    hasProductionFacility,
    capitalInvested,
    yearOfCommencement,
    detailsOfProducts,
    representativePicture,
    plasticConsumedJson,
    complianceStatus,
    thicknessOfPlastic,
    importer3aJson,
    importer3aStatus,
    importer3bJson,
  };
}

async function ensureRegistrationColumns(db) {
  for (const col of OPTIONAL_COLUMNS) {
    try {
      await db.run(`ALTER TABLE registration_details ADD COLUMN ${col} TEXT`);
    } catch {
      /* column exists */
    }
  }
}

function normalizeRegistrationRow(row) {
  if (!row) return null;
  const ceprId = emptyToNull(row.cepr_id || row.epr_id || row.ceprId);
  return { ...row, cepr_id: ceprId };
}

async function findRegistrationRow(db) {
  const withCepr = await db.get(
    `SELECT * FROM registration_details
     WHERE cepr_id IS NOT NULL AND TRIM(cepr_id) != ''
     ORDER BY _internal_id DESC
     LIMIT 1`
  ).catch(() => null);
  if (withCepr) return normalizeRegistrationRow(withCepr);

  const anyRow = await db.get(
    'SELECT * FROM registration_details ORDER BY _internal_id DESC LIMIT 1'
  ).catch(() => null);
  return normalizeRegistrationRow(anyRow);
}

export async function saveRegistrationDetails(data = {}) {
  const dbPath = getDbFilePath();
  log.info('saveRegistrationDetails start', {
    dbPath,
    ceprId: data.cepr_id || null,
    email: data.email || null,
    hasFormJson: Boolean(data.form_data_json || data.formData),
  });

  const db = getDb();
  await ensureRegistrationColumns(db);

  const existing = await findRegistrationRow(db);
  const formDataJson = buildFormDataJson(data, existing?.form_data_json);
  const cols = extractColumnsFromForm(formDataJson, data);
  const ceprId = emptyToNull(data.cepr_id);
  const email = emptyToNull(data.email);
  const mobile = emptyToNull(data.mobile);
  const password = emptyToNull(data.password);
  const confirmPassword = emptyToNull(data.confirm_password);

  if (existing) {
    await db.run(
      `UPDATE registration_details SET
        applicant_type = COALESCE(?, applicant_type),
        sub_applicant_type = COALESCE(?, sub_applicant_type),
        cepr_id = COALESCE(?, cepr_id),
        success_screenshot_path = COALESCE(?, success_screenshot_path),
        email = COALESCE(?, email),
        mobile = COALESCE(?, mobile),
        password = COALESCE(?, password),
        confirm_password = COALESCE(?, confirm_password),
        form_data_json = COALESCE(?, form_data_json),
        has_production_facility = COALESCE(?, has_production_facility),
        capital_invested = COALESCE(?, capital_invested),
        year_of_commencement = COALESCE(?, year_of_commencement),
        details_of_products_produced_marketed = COALESCE(?, details_of_products_produced_marketed),
        representative_picture_of_plastic_packaging = COALESCE(?, representative_picture_of_plastic_packaging),
        plastic_consumed_json = COALESCE(?, plastic_consumed_json),
        compliance_status = COALESCE(?, compliance_status),
        thickness_of_plastic = COALESCE(?, thickness_of_plastic),
        importer_3a_json = COALESCE(?, importer_3a_json),
        importer_3a_status = COALESCE(?, importer_3a_status),
        importer_3b_json = COALESCE(?, importer_3b_json)
      WHERE _internal_id = ?`,
      emptyToNull(data.applicant_type),
      emptyToNull(data.sub_applicant_type),
      ceprId,
      emptyToNull(data.success_screenshot_path),
      email,
      mobile,
      password,
      confirmPassword,
      formDataJson,
      cols.hasProductionFacility,
      cols.capitalInvested,
      cols.yearOfCommencement,
      cols.detailsOfProducts,
      cols.representativePicture,
      cols.plasticConsumedJson,
      cols.complianceStatus,
      cols.thicknessOfPlastic,
      cols.importer3aJson,
      cols.importer3aStatus,
      cols.importer3bJson,
      existing._internal_id
    );

    const verify = await db.get(
      'SELECT _internal_id, cepr_id, email, mobile, length(form_data_json) as form_len FROM registration_details WHERE _internal_id = ?',
      existing._internal_id
    );
    log.success('registration row updated', { dbPath, ...verify });
    return { success: true, id: existing._internal_id, inserted: false, data: verify };
  }

  const result = await db.run(
    `INSERT INTO registration_details
      (applicant_type, sub_applicant_type, cepr_id, success_screenshot_path, email, mobile, password, confirm_password, form_data_json, has_production_facility, capital_invested, year_of_commencement, details_of_products_produced_marketed, representative_picture_of_plastic_packaging, plastic_consumed_json, compliance_status, thickness_of_plastic, importer_3a_json, importer_3a_status, importer_3b_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    emptyToNull(data.applicant_type) || 'PIBO',
    emptyToNull(data.sub_applicant_type) || 'Importer',
    ceprId,
    emptyToNull(data.success_screenshot_path),
    email,
    mobile,
    password,
    confirmPassword,
    formDataJson ?? JSON.stringify({ email: email || '', mobile: mobile || '', generalInfo: {}, autoData: {} }),
    cols.hasProductionFacility,
    cols.capitalInvested,
    cols.yearOfCommencement,
    cols.detailsOfProducts,
    cols.representativePicture,
    cols.plasticConsumedJson,
    cols.complianceStatus,
    cols.thicknessOfPlastic,
    cols.importer3aJson,
    cols.importer3aStatus,
    cols.importer3bJson,
  );

  const verify = await db.get(
    'SELECT _internal_id, cepr_id, email, mobile, length(form_data_json) as form_len FROM registration_details WHERE _internal_id = ?',
    result.lastID
  );
  log.success('registration row inserted', { dbPath, ...verify });
  return { success: true, id: result.lastID, inserted: true, data: verify };
}

export async function getRegistrationDetails() {
  const dbPath = getDbFilePath();
  log.info('getRegistrationDetails start', { dbPath });

  const db = getDb();
  await ensureRegistrationColumns(db);

  const row = await findRegistrationRow(db);

  if (!row) {
    log.warn('no registration row found', { dbPath });
    return { success: true, data: null };
  }

  let formData = null;
  if (row.form_data_json) {
    try {
      formData = JSON.parse(row.form_data_json);
      if (formData && !formData.generalInfo) {
        formData = {
          email: formData.email || row.email,
          mobile: formData.mobile || row.mobile,
          generalInfo: formData,
          autoData: formData,
        };
      }
      if (formData && !formData.autoData) {
        formData.autoData = {};
      }
    } catch (err) {
      log.warn('stored form_data_json is invalid JSON', { error: err.message });
      formData = null;
    }
  }

  log.success('registration row loaded', {
    dbPath,
    id: row._internal_id,
    ceprId: row.cepr_id || null,
    email: row.email || null,
    hasFormData: Boolean(formData),
  });

  return {
    success: true,
    data: {
      ...row,
      formData,
    },
  };
}
