/** Short storage names for registration uploads (doc_type style, no random suffix). */
const REGISTRATION_DOC_FILE_NAMES = {
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

export function registrationDocFileName(docType, ext = '.pdf') {
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  const base = REGISTRATION_DOC_FILE_NAMES[docType] || String(docType || 'document').trim();
  return `${base}${normalizedExt}`;
}
