import { getDb } from './database.js';

const OPTIONAL_COLUMNS = ['sub_applicant_type', 'cepr_id', 'success_screenshot_path'];

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

  const existing = await db.get('SELECT _internal_id FROM registration_details LIMIT 1');

  if (existing) {
    await db.run(
      `UPDATE registration_details SET
        applicant_type = COALESCE(?, applicant_type),
        sub_applicant_type = COALESCE(?, sub_applicant_type),
        cepr_id = COALESCE(?, cepr_id),
        success_screenshot_path = COALESCE(?, success_screenshot_path)
      WHERE _internal_id = ?`,
      data.applicant_type ?? null,
      data.sub_applicant_type ?? null,
      data.cepr_id ?? null,
      data.success_screenshot_path ?? null,
      existing._internal_id
    );
    return { success: true, id: existing._internal_id, inserted: false };
  }

  const result = await db.run(
    `INSERT INTO registration_details
      (applicant_type, sub_applicant_type, cepr_id, success_screenshot_path)
     VALUES (?, ?, ?, ?)`,
    data.applicant_type ?? null,
    data.sub_applicant_type ?? null,
    data.cepr_id ?? null,
    data.success_screenshot_path ?? null
  );

  return { success: true, id: result.lastID, inserted: true };
}
