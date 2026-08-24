import path from 'path';
import { app } from 'electron';
import { getDb } from '../db/database.js';
import { buildImporter3aDraft, finalizeImporter3a, buildPlasticConsumed3cFromImporter3a } from '../../shared/importerSection3a.js';
import { generateImporter3aPdf, generateImporter3bPdf } from './importerEprReports.js';

function registrationDocsDir() {
  return path.join(app.getPath('userData'), 'processed_registration_docs');
}

function parseJson(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

async function loadPackagingMaster(companyId) {
  const db = getDb();
  if (companyId) {
    return db.all('SELECT * FROM packaging_master WHERE company_id = ? AND is_active != 0', [companyId]);
  }
  return db.all('SELECT * FROM packaging_master WHERE is_active != 0');
}

export async function computeImporter3aDraft({ companyId = null } = {}) {
  const db = getDb();
  const purchases = await db.all(`
    SELECT p.*, c.name AS company_name FROM purchases p
    LEFT JOIN companies c ON p.company_id = c.id
    ${companyId ? 'WHERE p.company_id = ?' : ''}
    ORDER BY p.invoice_date DESC
  `, companyId ? [companyId] : []);

  const sales = await db.all(`
    SELECT s.*, c.name AS company_name FROM sales s
    LEFT JOIN companies c ON s.company_id = c.id
    ${companyId ? 'WHERE s.company_id = ?' : ''}
    ORDER BY s.invoice_date DESC
  `, companyId ? [companyId] : []);

  const parsedPurchases = purchases.map((row) => ({
    ...row,
    line_items: row.line_items ? JSON.parse(row.line_items) : [],
    extraction: row.extraction ? JSON.parse(row.extraction) : null,
  }));
  const parsedSales = sales.map((row) => ({
    ...row,
    line_items: row.line_items ? JSON.parse(row.line_items) : [],
    extraction: row.extraction ? JSON.parse(row.extraction) : null,
  }));

  const packagingRows = await loadPackagingMaster(companyId);
  return buildImporter3aDraft({
    purchases: parsedPurchases,
    sales: parsedSales,
    packagingRows,
  });
}

export async function finalizeAndGenerateImporter3a({ companyId = null, companyName = 'Importer', draft = null } = {}) {
  const workingDraft = draft || (await computeImporter3aDraft({ companyId }));
  const finalized = finalizeImporter3a(workingDraft);
  if (!finalized.success) {
    return { success: false, error: finalized.error, draft: workingDraft };
  }

  const importer3a = finalized.data;
  const pdfResult = await generateImporter3aPdf({
    companyName,
    importer3a,
    destDir: registrationDocsDir(),
  });

  const plastic3c = buildPlasticConsumed3cFromImporter3a(importer3a);

  return {
    success: true,
    importer3a,
    importer3aStatus: importer3a.status,
    detailsOfProductsPath: pdfResult.filePath,
    plasticConsumed: plastic3c.plasticConsumed,
    years: plastic3c.years,
    importer3aJson: JSON.stringify(importer3a),
  };
}

export async function generateImporter3bFromImages({ companyName = 'Importer', images = [] } = {}) {
  if (!images.length) {
    return { success: false, error: 'Add at least one packaging image' };
  }
  const pdfResult = await generateImporter3bPdf({
    companyName,
    images,
    destDir: registrationDocsDir(),
  });
  return {
    success: true,
    representativePicturePath: pdfResult.filePath,
    importer3bJson: JSON.stringify({ images, generatedPdfPath: pdfResult.filePath, generatedAt: new Date().toISOString() }),
  };
}

export function mergeImporterIntoRegistrationPayload(payload = {}, importerResult = {}) {
  const formData = parseJson(payload.form_data_json, {}) || {};
  const generalInfo = { ...(formData.generalInfo || {}), ...(payload.generalInfo || {}) };
  const autoData = { ...(formData.autoData || {}), ...(payload.autoData || {}) };

  if (importerResult.plasticConsumed) {
    generalInfo.plasticConsumed = importerResult.plasticConsumed;
  }
  if (importerResult.detailsOfProductsPath) {
    autoData.detailsOfProductsPath = importerResult.detailsOfProductsPath;
  }
  if (importerResult.representativePicturePath) {
    autoData.representativePicturePath = importerResult.representativePicturePath;
  }
  if (importerResult.importer3bJson) {
    autoData.importer3b = parseJson(importerResult.importer3bJson, {});
  }

  return {
    ...payload,
    form_data_json: JSON.stringify({ ...formData, email: formData.email, mobile: formData.mobile, generalInfo, autoData }),
    plastic_consumed_json: importerResult.plasticConsumed
      ? JSON.stringify(importerResult.plasticConsumed)
      : payload.plastic_consumed_json,
    details_of_products_produced_marketed: importerResult.detailsOfProductsPath || payload.details_of_products_produced_marketed,
    representative_picture_of_plastic_packaging: importerResult.representativePicturePath || payload.representative_picture_of_plastic_packaging,
    importer_3a_json: importerResult.importer3aJson || payload.importer_3a_json,
    importer_3a_status: importerResult.importer3aStatus || payload.importer_3a_status,
    importer_3b_json: importerResult.importer3bJson || payload.importer_3b_json,
  };
}
