/** CPCB portal rejects spaces, brackets, special chars, and double extensions in upload names. */

const CPCB_DOC_FILE_NAMES = {
  gst: 'gst',
  unit_gst: 'unit_gst',
  company_pan: 'company_pan',
  person_pan: 'person_pan',
  cin: 'cin',
  udyam: 'udyam',
  iec: 'iec',
  cto: 'cto',
  supporting_category_doc: 'supporting_category_doc',
  operations_details: 'operations_details',
  plastic_packaging_picture: 'plastic_packaging_picture',
  covering_letter: 'covering_letter',
  signature: 'signature',
  self_declaration: 'self_declaration',
};

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

export function getBaseNameFromPath(filePath = '') {
  return String(filePath || '').split(/[/\\]/).pop() || '';
}

export function registrationDocFileName(docType, ext = '.pdf') {
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${String(ext).toLowerCase()}`;
  const base = CPCB_DOC_FILE_NAMES[docType] || String(docType || 'document').trim().toLowerCase();
  return `${base}${normalizedExt}`;
}

function splitFileName(fileName = '') {
  const name = String(fileName || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '.pdf' };
  return { base: name.slice(0, dot), ext: name.slice(dot).toLowerCase() };
}

export function hasDoubleExtension(fileName = '') {
  const { base, ext } = splitFileName(fileName);
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  const innerParts = base.split('.');
  if (innerParts.length <= 1) return false;
  return innerParts.some((part) => ALLOWED_EXTENSIONS.has(`.${part.toLowerCase()}`));
}

export function sanitizeCpcbPortalFileName(fileName = '', fallbackBase = 'document') {
  const { ext: rawExt } = splitFileName(fileName);
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : '.pdf';
  let base = splitFileName(fileName).base
    .replace(/\([^)]*\)/g, '')
    .replace(/[<>:"/\\|?*\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/\.+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  if (!base) base = String(fallbackBase || 'document').trim().toLowerCase() || 'document';
  return `${base}${ext}`;
}

export function validateCpcbPortalFileName(fileName = '', fallbackBase = 'document') {
  const trimmed = String(fileName || '').trim();
  const issues = [];

  if (!trimmed) {
    return {
      valid: false,
      issues: ['missing'],
      fileName: trimmed,
      suggestedName: registrationDocFileName(fallbackBase, '.pdf'),
    };
  }

  if (/\s/.test(trimmed)) issues.push('spaces');
  if (/[()]/.test(trimmed)) issues.push('parentheses');
  if (/[<>:"/\\|?*]/.test(trimmed)) issues.push('invalid_chars');
  if (hasDoubleExtension(trimmed)) issues.push('double_extension');
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) issues.push('special_chars');

  const { ext } = splitFileName(trimmed);
  if (!ALLOWED_EXTENSIONS.has(ext)) issues.push('bad_extension');

  const suggestedName = CPCB_DOC_FILE_NAMES[fallbackBase]
    ? registrationDocFileName(fallbackBase, ext || '.pdf')
    : sanitizeCpcbPortalFileName(trimmed, fallbackBase);

  return {
    valid: issues.length === 0,
    issues,
    fileName: trimmed,
    suggestedName,
  };
}

export function validateCpcbPortalFilePath(filePath = '', fallbackBase = 'document') {
  return validateCpcbPortalFileName(getBaseNameFromPath(filePath), fallbackBase);
}

export function formatCpcbFileNameIssue(issue = {}) {
  const label = issue.label || 'Document';
  const fileName = issue.fileName || '';
  const suggestedName = issue.suggestedName || 'document.pdf';
  return `${label}: "${fileName}" CPCB portal par accept nahi hoga. File ka naam badal kar "${suggestedName}" rakhein — spaces, brackets ( ) aur double extension allowed nahi hain.`;
}

export function formatCpcbFileNameIssueShort(issue = {}) {
  const fileName = issue.fileName || '';
  const suggestedName = issue.suggestedName || 'document.pdf';
  return `"${fileName}" → "${suggestedName}" (simple naam, bina space/brackets ke)`;
}

const DOC_TYPE_LABELS = {
  gst: 'Company GST',
  unit_gst: 'Unit GST',
  person_pan: 'Authorized Person PAN',
  company_pan: 'Company PAN',
  cin: 'CIN',
  udyam: 'Udyam / MSME',
  iec: 'IEC',
  cto: 'CTO Certificate',
  supporting_category_doc: 'Supporting document for company category',
  operations_details: 'Details of products (3a)',
  plastic_packaging_picture: 'Plastic packaging picture (3b)',
  covering_letter: 'Covering Letter',
  signature: 'Signature',
  self_declaration: 'Self declaration',
};

export function collectRegistrationUploadFileIssues({
  docs = [],
  autoData = {},
  generalInfo = {},
} = {}) {
  const issues = [];

  const pushIssue = (label, filePath, fallbackBase) => {
    if (!filePath) return;
    const check = validateCpcbPortalFilePath(filePath, fallbackBase);
    if (!check.valid) {
      issues.push({
        label,
        filePath,
        fileName: check.fileName,
        suggestedName: check.suggestedName,
        issues: check.issues,
      });
    }
  };

  for (const doc of docs || []) {
    const docType = doc.doc_type || 'document';
    pushIssue(DOC_TYPE_LABELS[docType] || docType, doc.file_path, docType);
  }

  pushIssue('Supporting document for company category', autoData.typeOfCompanyDoc, 'supporting_category_doc');
  pushIssue('Details of products (3a)', autoData.detailsOfProductsPath, 'operations_details');
  pushIssue('Plastic packaging picture (3b)', autoData.representativePicturePath, 'plastic_packaging_picture');
  pushIssue('Covering Letter', generalInfo.partCCoveringLetter, 'covering_letter');
  pushIssue('Signature', generalInfo.partCSignature, 'signature');
  pushIssue('Self declaration', generalInfo.partCAuditedStatement, 'self_declaration');

  return issues;
}
