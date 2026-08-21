/** Normalize raw Playwright scrape JSON into stable column names for DB / export. */

function firstNonEmpty(obj, keys) {
  for (const key of keys) {
    const v = obj?.[key];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (isPlaceholder(s)) continue;
    return s;
  }
  return '';
}

function isPlaceholder(val) {
  const s = String(val || '').trim();
  if (!s) return true;
  if (s.toLowerCase() === 'select') return true;
  if (/must be in format|max file size|pdf file \(max/i.test(s)) return true;
  return false;
}

function numVal(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Part A — company & registration (ideal columns). */
export const NEW_APPLICATION_COLUMNS = {
  legal_name: ['legal_name_of_company', 'name_of_the_organization_legal_name'],
  trade_name: ['trade_name'],
  type_of_business: ['type_of_business'],
  registered_address: ['registered_address'],
  plant_unit_address: ['plant_unit_address'],
  company_pan: ['company_pan'],
  unit_gst: ['unit_gst', 'gst'],
  type_of_company: ['type_of_company'],
  iec: ['iec'],
  contact_name: ['name'],
  designation: ['designation'],
  mobile: ['mobile_no', 'mobile_number'],
  email: ['email', 'email_address'],
  contact_pan: ['pan', 'pan_number'],
  operating_states: ['2_a_select_states_uts_in_which_the_importer_is_operating'],
  has_production_facility: ['2_b_does_the_importer_have_a_production_facility'],
  capital_invested_crores: ['2_c_total_capital_invested_in_the_project_rs_in_crores'],
  year_of_commencement: ['2_d_year_of_commencement_of_operations'],
  products_details_file: ['3_a_details_type_quantity_of_products_produced_marketed'],
  packaging_picture_file: [
    '3_b_representative_picture_of_plastic_packaging_plastic_packaging_for_commodities_covering_different_epr_categories',
  ],
  pwm_compliance: ['3d_status_of_compliance_with_pwm_rules'],
  packaging_thickness_microns: ['3e_thickness_of_plastic_packaging_in_microns'],
};

export const PLASTIC_CONSUMED_COLUMNS = {
  financial_year: ['year'],
  rigid_plastic_cat_i_mt: ['rigid_plastic_cat_i', 'rigid_plastic_cat_i_tonnes'],
  flexible_plastic_cat_ii_mt: ['flexible_plastic_cat_ii', 'flexible_plastic_cat_ii_tonnes'],
  mlp_cat_iii_mt: ['mlp_cat_iii', 'mlp_cat_iii_tonnes'],
  compostable_plastic_cat_iv_mt: ['compostable_plastic_cat_iv', 'compostable_plastic_cat_iv_tonnes'],
};

function mapFields(source = {}, columnMap = {}) {
  const out = {};
  for (const [col, keys] of Object.entries(columnMap)) {
    out[col] = firstNonEmpty(source, keys);
  }
  return out;
}

function mapPlasticRow(row = {}) {
  const mapped = mapFields(row, PLASTIC_CONSUMED_COLUMNS);
  return {
    financial_year: mapped.financial_year,
    rigid_plastic_cat_i_mt: numVal(mapped.rigid_plastic_cat_i_mt),
    flexible_plastic_cat_ii_mt: numVal(mapped.flexible_plastic_cat_ii_mt),
    mlp_plastic_cat_iii_mt: numVal(mapped.mlp_cat_iii_mt),
    compostable_plastic_cat_iv_mt: numVal(mapped.compostable_plastic_cat_iv_mt),
  };
}

function extractPlasticTables(part = {}) {
  const tables = part.tables || {};
  const rows = [];
  for (const tableRows of Object.values(tables)) {
    if (!Array.isArray(tableRows)) continue;
    for (const row of tableRows) {
      const mapped = mapPlasticRow(row);
      if (mapped.financial_year) rows.push(mapped);
    }
  }
  return rows;
}

/** Merge part_a/b/c and map to ideal columns. */
export function normalizeNewApplication(raw = {}) {
  const merged = { ...(raw.part_b || {}), ...(raw.part_c || {}), ...(raw.part_a || {}) };
  const application = mapFields(merged, NEW_APPLICATION_COLUMNS);
  const plasticConsumed = extractPlasticTables(raw.part_a || merged);
  const scrapedAt = new Date().toISOString();

  return {
    application: { ...application, scraped_at: scrapedAt },
    plasticConsumed: plasticConsumed.map((r) => ({
      ...r,
      unit_gst: application.unit_gst,
      scraped_at: scrapedAt,
    })),
    part: {
      part_a: mapFields(raw.part_a || {}, NEW_APPLICATION_COLUMNS),
      part_b: mapFields(raw.part_b || {}, NEW_APPLICATION_COLUMNS),
      part_c: mapFields(raw.part_c || {}, NEW_APPLICATION_COLUMNS),
    },
  };
}

/** Procurement dashboard API → flat rows. */
export function normalizeProcurementApi(rawByFy = {}) {
  const rows = [];
  for (const [fy, payload] of Object.entries(rawByFy)) {
    if (!payload || payload.error) continue;
    const data = payload.data || {};
    for (const [entityType, items] of Object.entries(data)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        rows.push({
          financial_year: fy,
          entity_type: entityType,
          category_id: String(item.category_id ?? item.categoryId ?? ''),
          total_quantity_mt: numVal(item.total_quantity ?? item.totalQuantity),
        });
      }
    }
  }
  return rows;
}

/** Sales dashboard API → flat rows (same shape as procurement when present). */
export function normalizeSalesApi(rawByFy = {}) {
  return normalizeProcurementApi(rawByFy);
}

/** Wallet credit/debit transactions → flat rows. */
export function normalizeWalletTransactions(walletApi = {}) {
  const block = walletApi['Credit/Debit Transactions'] || walletApi['Credit\\/Debit Transactions'];
  const items = block?.data?.items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    sr_no: item.srNo ?? item.sr_no ?? null,
    tx_id: item.txId ?? item.tx_id ?? '',
    amount_mt: numVal(item.amount),
    owner_name: item.ownerName ?? item.owner_name ?? '',
    from_user: item.fromUser ?? item.from_user ?? '',
    category: item.category ?? '',
    processing_type: item.processingType ?? item.processing_type ?? '',
    transaction_direction: item.transactionDirection ?? item.transaction_direction ?? '',
    status: item.status ?? '',
    generated_at: item.generatedAt ?? item.generated_at ?? '',
  }));
}

/** Road making API periods → summary rows. */
export function normalizeRoadMakingApi(rawByPeriod = {}) {
  const rows = [];
  for (const [periodKey, payload] of Object.entries(rawByPeriod)) {
    if (!payload || payload.error) continue;
    rows.push({
      period_key: periodKey,
      status_code: payload.statusCode ?? null,
      table_row_count: Array.isArray(payload.data?.tableData) ? payload.data.tableData.length : 0,
      graph_point_count: Array.isArray(payload.data?.graphData) ? payload.data.graphData.length : 0,
    });
  }
  return rows;
}

/** Build full normalized bundle from playwright_data folder contents. */
export function normalizeAllScrapedFiles(files = {}) {
  const newApp = files.new_application_data
    ? normalizeNewApplication(files.new_application_data)
    : { application: {}, plasticConsumed: [], part: {} };

  return {
    scraped_at: new Date().toISOString(),
    new_application: newApp,
    procurement_summary: normalizeProcurementApi(files.procurement_api_data || {}),
    sales_summary: normalizeSalesApi(files.sales_api_data || {}),
    wallet_transactions: normalizeWalletTransactions(files.wallet_api_data || {}),
    road_making: normalizeRoadMakingApi(files.road_making_api_data || {}),
  };
}
