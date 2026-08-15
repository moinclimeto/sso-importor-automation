import { getDb } from './database.js';

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
  'representative_picture_of_plastic_packaging'
];

async function ensureRegistrationColumns(db) {
  for (const col of OPTIONAL_COLUMNS) {
    try {
      await db.run(`ALTER TABLE registration_details ADD COLUMN ${col} TEXT`);
    } catch {
      /* column exists */
    }
  }
}

export async function saveRegistrationDetails(data = {}) {
  const db = getDb();
  await ensureRegistrationColumns(db);

  const formDataJson =
    data.form_data_json ??
    (data.formData ? JSON.stringify(data.formData) : null);

  // Extract the specific fields from formDataJson if present to populate the physical columns
  let hasProductionFacility = data.has_production_facility ?? null;
  let capitalInvested = data.capital_invested ?? null;
  let yearOfCommencement = data.year_of_commencement ?? null;
  let detailsOfProducts = data.details_of_products_produced_marketed ?? null;
  let representativePicture = data.representative_picture_of_plastic_packaging ?? null;
  
  if (formDataJson) {
    try {
      const parsed = JSON.parse(formDataJson);
      if (parsed.generalInfo) {
        if (parsed.generalInfo.hasProductionFacility !== undefined) hasProductionFacility = parsed.generalInfo.hasProductionFacility;
        if (parsed.generalInfo.capitalInvested !== undefined) capitalInvested = parsed.generalInfo.capitalInvested;
        if (parsed.generalInfo.yearOfCommencement !== undefined) yearOfCommencement = parsed.generalInfo.yearOfCommencement;
      }
      if (parsed.autoData) {
        if (parsed.autoData.detailsOfProductsPath !== undefined) detailsOfProducts = parsed.autoData.detailsOfProductsPath;
        if (parsed.autoData.representativePicturePath !== undefined) representativePicture = parsed.autoData.representativePicturePath;
      }
    } catch (e) {
      // ignore parse error
    }
  }

  const existing = await db.get('SELECT _internal_id FROM registration_details LIMIT 1');

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
        has_production_facility = ?,
        capital_invested = ?,
        year_of_commencement = ?,
        details_of_products_produced_marketed = ?,
        representative_picture_of_plastic_packaging = ?
      WHERE _internal_id = ?`,
      data.applicant_type ?? null,
      data.sub_applicant_type ?? null,
      data.cepr_id ?? null,
      data.success_screenshot_path ?? null,
      data.email ?? null,
      data.mobile ?? null,
      data.password ?? null,
      data.confirm_password ?? null,
      formDataJson,
      hasProductionFacility,
      capitalInvested,
      yearOfCommencement,
      detailsOfProducts,
      representativePicture,
      existing._internal_id
    );
    return { success: true, id: existing._internal_id, inserted: false };
  }

  const result = await db.run(
    `INSERT INTO registration_details
      (applicant_type, sub_applicant_type, cepr_id, success_screenshot_path, email, mobile, password, confirm_password, form_data_json, has_production_facility, capital_invested, year_of_commencement, details_of_products_produced_marketed, representative_picture_of_plastic_packaging)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.applicant_type ?? null,
    data.sub_applicant_type ?? null,
    data.cepr_id ?? null,
    data.success_screenshot_path ?? null,
    data.email ?? null,
    data.mobile ?? null,
    data.password ?? null,
    data.confirm_password ?? null,
    formDataJson,
    hasProductionFacility,
    capitalInvested,
    yearOfCommencement,
    detailsOfProducts,
    representativePicture
  );

  return { success: true, id: result.lastID, inserted: true };
}

export async function getRegistrationDetails() {
  const db = getDb();
  await ensureRegistrationColumns(db);

  const row = await db.get(
    'SELECT * FROM registration_details ORDER BY _internal_id DESC LIMIT 1'
  );

  if (!row) {
    return { success: true, data: null };
  }

  let formData = null;
  if (row.form_data_json) {
    try {
      formData = JSON.parse(row.form_data_json);
    } catch {
      formData = null;
    }
  }

  return {
    success: true,
    data: {
      ...row,
      formData,
    },
  };
}
