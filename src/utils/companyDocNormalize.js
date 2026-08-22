/** Indian Corporate Identification Number (21 chars). */
export const CIN_PATTERN = /\b(?:CIN[#:\s]*)?([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/i;

export function extractCinFromText(text) {
  if (!text) return '';
  const match = String(text).match(CIN_PATTERN);
  return match ? match[1].toUpperCase() : '';
}

export function scanCinFromObject(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const direct = extractCinFromText(obj.document_number);
  if (direct) return direct;
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      const found = extractCinFromText(value);
      if (found) return found;
    }
  }
  return '';
}

export function fileNameHintsCin(fileName = '') {
  return /\bcin\b/i.test(String(fileName || ''));
}

export function fileNameHintsUnitGst(fileName = '') {
  return /\bunit[\s_-]?gst\b/i.test(String(fileName || ''));
}

export function resolveGstDocType(data, fileName = '', context = {}) {
  const type = data.doc_type || 'unknown';
  if (type !== 'gst' && type !== 'unit_gst') return type;

  const gstin = String(data.document_number || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { companyGstNumber = null, hasCompanyGst = false } = context;

  if (fileNameHintsUnitGst(fileName)) {
    data.doc_type = 'unit_gst';
    return 'unit_gst';
  }

  if (type === 'gst' && hasCompanyGst && companyGstNumber && gstin && gstin !== companyGstNumber) {
    data.doc_type = 'unit_gst';
    return 'unit_gst';
  }

  if (type === 'unit_gst' && !hasCompanyGst && !companyGstNumber && gstin) {
    data.doc_type = 'gst';
    return 'gst';
  }

  return data.doc_type;
}

const CIN_RECLASSIFY_TYPES = new Set([
  'self_declaration',
  'other',
  'unknown',
  'covering_letter',
]);

/**
 * Fix OCR misclassification (e.g. letterhead with CIN# tagged as self_declaration).
 * Mutates and returns the same object for convenience.
 */
export function normalizeCompanyDocumentExtraction(data, fileName = '', options = {}) {
  if (!data || typeof data !== 'object') return data;
  const { allowFilenameReclassify = true } = options;

  const cin = scanCinFromObject(data);
  const hintsCin = fileNameHintsCin(fileName);
  let type = data.doc_type || 'unknown';

  if (
    cin ||
    (allowFilenameReclassify && hintsCin && CIN_RECLASSIFY_TYPES.has(type))
  ) {
    data.doc_type = 'cin';
    if (cin) data.document_number = cin;
    type = 'cin';
  }

  if (type === 'pan') {
    const pan = String(data.document_number || '').toUpperCase();
    data.doc_type = pan.charAt(3) === 'C' ? 'company_pan' : 'person_pan';
  }

  return data;
}

export function needsCinOcrRetry(data, fileName = '', companyDocType = 'auto') {
  if (companyDocType && companyDocType !== 'auto') return false;
  if (!fileNameHintsCin(fileName)) return false;
  if (data?.doc_type === 'cin' && extractCinFromText(data?.document_number)) return false;
  return !scanCinFromObject(data);
}
