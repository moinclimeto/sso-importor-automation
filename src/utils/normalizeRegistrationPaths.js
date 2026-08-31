import {
  registrationDocFileName,
  validateCpcbPortalFilePath,
} from '../../shared/cpcbPortalFileName.js';
import { storeCompressedUploadPath } from './storeUploadFile.js';

function fileExt(filePath = '') {
  const match = String(filePath).match(/\.[^.\\/]+$/i);
  return match ? match[0].toLowerCase() : '.pdf';
}

export async function normalizeRegistrationPath(
  filePath,
  docType,
  destSubdir = 'processed_registration_docs',
) {
  if (!filePath) return { filePath: '', changed: false };

  const check = validateCpcbPortalFilePath(filePath, docType);
  if (check.valid) return { filePath, changed: false };

  const stored = await storeCompressedUploadPath(filePath, {
    fileName: registrationDocFileName(docType, fileExt(filePath)),
    destSubdir,
  });

  if (!stored.success || !stored.filePath) {
    return { filePath, changed: false, error: stored.message };
  }

  return {
    filePath: stored.filePath,
    changed: true,
    compressed: stored.compressed,
    warning: stored.warning,
  };
}

const AUTO_DATA_FIELDS = {
  typeOfCompanyDoc: ['supporting_category_doc', 'processed_registration_docs'],
  detailsOfProductsPath: ['operations_details', 'processed_registration_docs'],
  representativePicturePath: ['plastic_packaging_picture', 'processed_registration_docs'],
};

const GENERAL_INFO_FIELDS = {
  partCCoveringLetter: ['covering_letter', 'processed_part_c'],
  partCAuditedStatement: ['self_declaration', 'processed_part_c'],
  partCSignature: ['signature', 'processed_part_c'],
};

/** Auto-rename + compress Part C / supporting uploads to CPCB-safe names under userData. */
export async function normalizeRegistrationPaths({
  autoData = {},
  generalInfo = {},
} = {}) {
  const nextAutoData = { ...autoData };
  const nextGeneralInfo = { ...generalInfo };
  let changed = false;

  for (const [field, [docType, destSubdir]] of Object.entries(AUTO_DATA_FIELDS)) {
    const current = nextAutoData[field];
    if (!current) continue;
    const result = await normalizeRegistrationPath(current, docType, destSubdir);
    if (result.changed) {
      nextAutoData[field] = result.filePath;
      changed = true;
    }
  }

  for (const [field, [docType, destSubdir]] of Object.entries(GENERAL_INFO_FIELDS)) {
    const current = nextGeneralInfo[field];
    if (!current) continue;
    const result = await normalizeRegistrationPath(current, docType, destSubdir);
    if (result.changed) {
      nextGeneralInfo[field] = result.filePath;
      changed = true;
    }
  }

  return { autoData: nextAutoData, generalInfo: nextGeneralInfo, changed };
}
