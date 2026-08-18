/** Derive company PAN from 15-char GSTIN (chars 3–12). */
export function derivePanFromGstin(gstin) {
  const g = String(gstin || '').trim().toUpperCase();
  if (g.length >= 12) return g.substring(2, 12);
  return '';
}

function parseRaw(doc) {
  if (!doc?.raw_json) return {};
  try {
    return JSON.parse(doc.raw_json);
  } catch {
    return {};
  }
}

const GST_ADDRESS_LABELS = [
  ['building', /Building\s*No\.?\s*\/?\s*Flat\s*No\.?\s*:/i],
  ['premises', /Name\s*Of\s*Premises\s*\/?\s*Building\s*:/i],
  ['street', /Road\s*\/?\s*Street\s*:/i],
  ['locality', /Locality\s*\/?\s*Sub\s*Locality\s*:/i],
  ['city', /City\s*\/?\s*Town\s*\/?\s*Village\s*:/i],
  ['district', /District\s*:/i],
  ['state', /State\s*:/i],
  ['pin', /PIN\s*Code\s*:/i],
];

/** Turn GST "Building No./Flat No.: ..." blobs into a clean address + district. */
export function parseGstLabeledAddress(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { address: '', district: '', state: '', pin: '', city: '' };

  const hits = [];
  for (const [key, re] of GST_ADDRESS_LABELS) {
    const match = re.exec(text);
    if (match) hits.push({ key, index: match.index, end: match.index + match[0].length });
  }

  if (!hits.length) {
    return {
      address: text,
      district: extractDistrictFromCommaAddress(text),
      state: '',
      pin: (text.match(/\b\d{6}\b/) || [''])[0],
      city: '',
    };
  }

  hits.sort((a, b) => a.index - b.index);
  const values = {};
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].end;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    values[hits[i].key] = text.slice(start, end).trim().replace(/[,;]+$/g, '');
  }

  const parts = [
    values.building,
    values.premises,
    values.street,
    values.locality,
    values.city,
    values.district,
    values.state,
    values.pin,
  ].filter(Boolean);

  return {
    address: parts.join(', '),
    district: values.district || '',
    state: values.state || '',
    pin: values.pin || '',
    city: values.city || '',
  };
}

function extractDistrictFromCommaAddress(address) {
  const addr = String(address || '').trim();
  if (!addr) return '';
  const labeled = /District\s*:/i.exec(addr);
  if (labeled) {
    const after = addr.slice(labeled.index + labeled[0].length);
    const stop = after.search(/\s+(State|PIN\s*Code|Pincode)\s*:/i);
    return (stop >= 0 ? after.slice(0, stop) : after).trim().replace(/[,;]+$/g, '');
  }
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const maybeDistrict = parts[parts.length - 2].replace(/\d{6}/g, '').trim();
    if (maybeDistrict && !/pradesh|nagar|delhi|bengal|india/i.test(maybeDistrict)) {
      return maybeDistrict;
    }
    if (parts.length >= 3) {
      return parts[parts.length - 3].replace(/\d{6}/g, '').trim();
    }
  }
  return '';
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  const ymd = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return s;
}

function extractPersonDob(personPanDoc) {
  if (!personPanDoc) return '';
  const raw = parseRaw(personPanDoc);
  return normalizeDate(
    firstNonEmpty(
      raw.dob,
      raw.date_of_birth,
      raw.dateOfBirth,
      raw.birth_date,
      personPanDoc.issue_date,
      raw.issue_date
    )
  );
}

/** Build unified registration payload from saved company_documents rows. */
export function buildRegistrationDataFromDocuments(docs = []) {
  const byType = {};
  for (const doc of docs) {
    if (doc?.doc_type) byType[doc.doc_type] = doc;
  }

  const gst = byType.gst;
  const gstRaw = parseRaw(gst);
  const companyPanDoc = byType.company_pan;
  const personPanDoc = byType.person_pan;
  const cto = byType.cto;
  const cin = byType.cin;
  const udyam = byType.udyam;
  const iecDoc = byType.iec;

  const gstin = firstNonEmpty(gst?.document_number, gstRaw.document_number).toUpperCase();
  const companyPan = firstNonEmpty(
    companyPanDoc?.document_number,
    derivePanFromGstin(gstin)
  ).toUpperCase();

  const companyName = firstNonEmpty(
    gstRaw.trade_name,
    gst?.entity_name,
    gstRaw.entity_name,
    companyPanDoc?.entity_name
  ).toUpperCase();

  const legalName = firstNonEmpty(gst?.entity_name, gstRaw.entity_name, companyPanDoc?.entity_name).toUpperCase();

  const dateOfEstablishment = normalizeDate(
    firstNonEmpty(
      companyPanDoc?.date_of_incorporation,
      companyPanDoc?.issue_date,
      cin?.issue_date,
      cin?.date_of_incorporation,
      udyam?.date_of_incorporation,
      gst?.issue_date,
      gst?.date_of_liability,
      gstRaw.issue_date,
      gstRaw.date_of_liability
    )
  );

  const authPan = firstNonEmpty(personPanDoc?.document_number).toUpperCase();
  const authName = firstNonEmpty(personPanDoc?.entity_name).toUpperCase();
  const authDob = extractPersonDob(personPanDoc);

  const constitutionOfBusiness = firstNonEmpty(gst?.constitution_of_business, gstRaw.constitution_of_business);
  const rawAddress = firstNonEmpty(gst?.address, gstRaw.address, cto?.address);
  const parsedAddress = parseGstLabeledAddress(rawAddress);
  const registeredAddress = parsedAddress.address || rawAddress;
  const cinNumber = firstNonEmpty(cin?.document_number).toUpperCase();

  return {
    gstin,
    companyPan,
    companyName,
    legalName,
    dateOfEstablishment,
    authPan,
    authName,
    authDob,
    constitutionOfBusiness,
    registeredAddress,
    registeredAddressLine2: '',
    district: firstNonEmpty(gstRaw.district, parsedAddress.district, extractDistrictFromAddress(registeredAddress)),
    cin: cinNumber,
    ctoNumber: firstNonEmpty(cto?.document_number),
    ctoValidity: normalizeDate(firstNonEmpty(cto?.validity_date)),
    dateOfCommencement: normalizeDate(
      firstNonEmpty(cto?.issue_date, udyam?.date_of_commencement, cto?.date_of_commencement)
    ),
    iec: firstNonEmpty(iecDoc?.document_number).toUpperCase(),
    industryCategory: firstNonEmpty(cto?.industry_category),
    allowedCapacity: firstNonEmpty(cto?.allowed_capacity),
    enterpriseType: firstNonEmpty(udyam?.enterprise_type),
    
    // File paths for automation auto-upload
    panDocumentPath: firstNonEmpty(companyPanDoc?.file_path, personPanDoc?.file_path),
    gstDocumentPath: firstNonEmpty(gst?.file_path),
    cinDocumentPath: firstNonEmpty(cin?.file_path),
    iecDocumentPath: firstNonEmpty(iecDoc?.file_path),
  };
}

function extractDistrictFromAddress(address) {
  return parseGstLabeledAddress(address).district || extractDistrictFromCommaAddress(address);
}

export const REQUIRED_REGISTRATION_DOCS = [
  'company_pan',
  'unit_gst',
  'gst',
  'iec',
  'supporting_category_doc',
  'person_pan',
  'operations_details',
  'plastic_packaging_picture',
  'covering_letter',
  'signature'
];

export const OPTIONAL_REGISTRATION_DOCS = ['cin', 'self_declaration', 'udyam', 'cto'];

export function getRegistrationReadiness(docs = []) {
  const types = new Set((docs || []).map((d) => d.doc_type));
  const gstDoc = docs.find((d) => d.doc_type === 'gst');
  const hasDerivedPan = types.has('company_pan') || Boolean(derivePanFromGstin(gstDoc?.document_number));

  const missing = [];
  if (!types.has('gst')) missing.push('gst');
  if (!types.has('unit_gst')) missing.push('unit_gst');
  if (!hasDerivedPan) missing.push('company_pan');
  if (!types.has('person_pan')) missing.push('person_pan');
  if (!types.has('iec')) missing.push('iec');
  if (!types.has('supporting_category_doc')) missing.push('supporting_category_doc');
  if (!types.has('operations_details')) missing.push('operations_details');
  if (!types.has('plastic_packaging_picture')) missing.push('plastic_packaging_picture');
  if (!types.has('covering_letter')) missing.push('covering_letter');
  if (!types.has('signature')) missing.push('signature');

  return {
    ready: missing.length === 0,
    missing,
    uploaded: REQUIRED_REGISTRATION_DOCS.filter((t) => {
      if (t === 'company_pan') return hasDerivedPan;
      return types.has(t);
    }),
  };
}

export const AUTO_FILLED_FIELDS = [
  { key: 'gstin', label: 'Company GST Number', source: 'GST Certificate' },
  { key: 'companyPan', label: 'Company PAN', source: 'Company PAN / GST' },
  { key: 'companyName', label: 'Company Name (Trade Name)', source: 'GST Certificate' },
  { key: 'dateOfEstablishment', label: 'Date of Establishment', source: 'GST / PAN / CIN / Udyam' },
  { key: 'authPan', label: 'Authorised Person PAN', source: 'Person PAN Card' },
  { key: 'authName', label: 'Authorised Person Name', source: 'Person PAN Card' },
  { key: 'authDob', label: 'Authorised Person DOB', source: 'Person PAN Card' },
  { key: 'constitutionOfBusiness', label: 'Type of Business', source: 'GST Certificate' },
  { key: 'registeredAddress', label: 'Registered Address', source: 'GST / CTO' },
  { key: 'district', label: 'District', source: 'GST Address' },
  { key: 'cin', label: 'Company CIN', source: 'CIN Certificate' },
  { key: 'ctoNumber', label: 'CTO Number', source: 'CTO Certificate' },
  { key: 'ctoValidity', label: 'CTO Validity', source: 'CTO Certificate' },
  { key: 'dateOfCommencement', label: 'Date of Commencement', source: 'CTO / Udyam' },
];
