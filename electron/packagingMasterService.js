import { normalizePackagingMasterRecord } from '../shared/packagingMasterSync.js';

function pickDefined(normalized, existing) {
  return {
    company_id: normalized.company_id ?? existing.company_id,
    list_type: normalized.list_type || existing.list_type,
    product_description: normalized.product_description || existing.product_description,
    product_match_key: normalized.product_match_key || existing.product_match_key,
    hsn: normalized.hsn || existing.hsn,
    uom: normalized.uom || existing.uom,
    supplier_gst: normalized.supplier_gst || existing.supplier_gst,
    supplier_name: normalized.supplier_name || existing.supplier_name,
    plastic_category: normalized.plastic_category || existing.plastic_category,
    plastic_material: normalized.plastic_material || existing.plastic_material,
    other_plastic_material: normalized.other_plastic_material || existing.other_plastic_material,
    cat1: normalized.cat1 || existing.cat1,
    recycled_percent: normalized.recycled_percent ?? existing.recycled_percent,
    conversion_factor_id: normalized.conversion_factor_id ?? existing.conversion_factor_id,
    cf_base_source: normalized.cf_base_source || existing.cf_base_source || 'quantity',
    conversion_factor: normalized.conversion_factor ?? existing.conversion_factor,
    cf_date_from: normalized.cf_date_from ?? existing.cf_date_from,
    cf_date_to: normalized.cf_date_to ?? existing.cf_date_to,
    total_quantity: normalized.total_quantity ?? existing.total_quantity,
    value_in_mt: normalized.value_in_mt ?? existing.value_in_mt,
    match_type: normalized.match_type || existing.match_type || 'exact',
    is_active: normalized.is_active ?? existing.is_active ?? 1,
    source: normalized.source || existing.source || 'excel_import',
  };
}

export async function upsertPackagingMasterRow(db, data, { cascadeFn, fromImport = false } = {}) {
  const normalized = normalizePackagingMasterRecord({
    ...data,
    source: data.source || (fromImport ? 'excel_import' : 'manual'),
  });

  if (!normalized.company_id) throw new Error('Company is required');
  if (!normalized.list_type) normalized.list_type = 'purchase';

  const now = new Date().toISOString();
  let existing = null;

  if (data.id) {
    existing = await db.get('SELECT * FROM packaging_master WHERE id = ?', [Number(data.id)]);
    if (!existing) throw new Error(`Record ID ${data.id} not found`);
  } else {
    if (!normalized.product_description) {
      throw new Error('Product Description is required');
    }
    existing = await db.get(
      'SELECT * FROM packaging_master WHERE company_id = ? AND list_type = ? AND product_match_key = ?',
      [normalized.company_id, normalized.list_type, normalized.product_match_key],
    );
  }

  if (existing) {
    const merged = normalizePackagingMasterRecord({
      ...pickDefined(normalized, existing),
      id: existing.id,
    });

    await db.run(
      `UPDATE packaging_master SET
        company_id = ?,
        list_type = ?,
        product_description = ?,
        product_match_key = ?,
        hsn = ?,
        uom = ?,
        supplier_gst = ?,
        supplier_name = ?,
        plastic_category = ?,
        plastic_material = ?,
        other_plastic_material = ?,
        cat1 = ?,
        recycled_percent = ?,
        conversion_factor_id = ?,
        cf_base_source = ?,
        conversion_factor = ?,
        cf_date_from = ?,
        cf_date_to = ?,
        total_quantity = ?,
        value_in_mt = ?,
        match_type = ?,
        source = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        merged.company_id,
        merged.list_type,
        merged.product_description,
        merged.product_match_key,
        merged.hsn,
        merged.uom,
        merged.supplier_gst,
        merged.supplier_name,
        merged.plastic_category,
        merged.plastic_material,
        merged.other_plastic_material,
        merged.cat1,
        merged.recycled_percent,
        merged.conversion_factor_id,
        merged.cf_base_source,
        merged.conversion_factor,
        merged.cf_date_from,
        merged.cf_date_to,
        merged.total_quantity,
        merged.value_in_mt,
        merged.match_type,
        merged.source,
        merged.is_active ?? 1,
        now,
        existing.id,
      ],
    );

    const saved = await db.get('SELECT * FROM packaging_master WHERE id = ?', [existing.id]);
    if (cascadeFn && saved) {
      await cascadeFn(db, saved.company_id, saved);
    }
    return { action: 'updated', id: existing.id };
  }

  if (!normalized.product_description) {
    throw new Error('Product Description is required');
  }
  if (fromImport && !normalized.plastic_category) {
    throw new Error('Plastic Category is required for new rows');
  }

  const result = await db.run(
    `INSERT INTO packaging_master (
      company_id, list_type, product_description, product_match_key, hsn, uom,
      supplier_gst, supplier_name, plastic_category, plastic_material, other_plastic_material,
      cat1, recycled_percent, conversion_factor_id, cf_base_source, conversion_factor,
      cf_date_from, cf_date_to, total_quantity, value_in_mt, match_type, source, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalized.company_id,
      normalized.list_type || 'purchase',
      normalized.product_description,
      normalized.product_match_key,
      normalized.hsn,
      normalized.uom,
      normalized.supplier_gst,
      normalized.supplier_name,
      normalized.plastic_category,
      normalized.plastic_material,
      normalized.other_plastic_material,
      normalized.cat1,
      normalized.recycled_percent,
      normalized.conversion_factor_id,
      normalized.cf_base_source,
      normalized.conversion_factor,
      normalized.cf_date_from,
      normalized.cf_date_to,
      normalized.total_quantity,
      normalized.value_in_mt,
      normalized.match_type || 'exact',
      normalized.source || 'excel_import',
      1,
      now,
      now,
    ],
  );

  return { action: 'added', id: result.lastID };
}
