import { buildRegistrationDataFromDocuments } from './registrationDataMapper.js';

export const LETTER_CATALOG = [
  {
    id: 'coveringLetter',
    title: 'Covering Letter',
    shortName: 'CL',
    field: 'partCCoveringLetter',
    store: 'generalInfo',
    description: 'Official application covering letter for CPCB Part C.',
    required: true,
  },
  {
    id: 'selfDeclaration',
    title: 'Self-Declaration',
    shortName: 'SD',
    field: 'partCAuditedStatement',
    store: 'generalInfo',
    description: 'Self-declaration based on audited financial statements.',
    required: true,
  },
  {
    id: 'largeEntity',
    title: 'Large-Entity Declaration',
    shortName: 'LED',
    field: 'typeOfCompanyDoc',
    store: 'autoData',
    description: 'Submitted instead of Udyam when the entity is Large.',
    required: false,
    largeOnly: true,
  },
];

export const PLACEHOLDER_ALIASES = {
  OrganizationName: ['OrganizationName', 'OrganisationName', 'OrganizationName'],
  TradeName: ['TradeName', 'TradeName'],
  RegisteredAddress: ['RegisteredAddress', 'RegisteredAddress'],
  PlantAddress: ['PlantAddress', 'PlantAddress'],
  CIN: ['CIN', 'CIN'],
  GSTIN: ['GSTIN', 'GSTIN', 'GSTIN'],
  CompanyPAN: ['CompanyPAN', 'CompanyPAN', 'CompanyPan'],
  IEC: ['IEC', 'IEC'],
  TypeOfCompany: ['TypeOfCompany', 'TypeOfCompany'],
  AuthorizedPersonName: ['AuthorizedPersonName', 'AuthorizedPersonName', 'AuthorizedPersonName'],
  Designation: ['Designation', 'Designation'],
  Mobile: ['Mobile', 'Mobile'],
  Email: ['Email', 'Email'],
  ApplicationNo: ['ApplicationNo', 'ApplicationNo'],
  RegistrationYear: ['RegistrationYear', 'RegistrationYear'],
  Date: ['Date', 'Date'],
  Place: ['Place', 'Place'],
};

export const LETTER_BODIES = {
  coveringLetter: `[ COMPANY LETTERHEAD ]
{{OrganizationName}}  |  {{RegisteredAddress}}
CIN: {{CIN}}  |  GSTIN: {{GSTIN}}  |  PAN: {{CompanyPAN}}  |  IEC: {{IEC}}

Date: {{Date}}
Ref: EPR/PIBO/IMP/{{ApplicationNo}}

To,
The Member Secretary
Central Pollution Control Board (CPCB)
Parivesh Bhawan, East Arjun Nagar
Delhi – 110032

Subject: Application for EPR Registration as an Importer (PIBO) under the Plastic Waste Management Rules, 2016 (as amended) — Application No. {{ApplicationNo}}

Respected Sir/Madam,

We, {{OrganizationName}} (Trade Name: {{TradeName}}), a {{TypeOfCompany}} enterprise having our registered office at {{RegisteredAddress}}, are engaged in the import of plastic packaging / plastic-packaged commodities and are required to obtain registration under the Extended Producer Responsibility (EPR) framework of the Plastic Waste Management Rules, 2016 (as amended).

Accordingly, we hereby submit our application (Application No. {{ApplicationNo}}) for EPR Registration as an Importer through the CPCB Common EPR (CEPR) Portal for the registration year {{RegistrationYear}}. The requisite information has been furnished in Parts A, B and C of the application, and the supporting documents listed below are enclosed for your kind reference and processing.

Enclosures:
1. Company PAN, GST Certificate and Unit GST Certificate (if applicable)
2. CIN Certificate (if a company) / MSME (Udyam) Certificate or Large-Entity Declaration, as applicable
3. Authorized Person's PAN
4. Details (Type & Quantity) of products produced/marketed
5. Representative pictures of plastic packaging covering EPR categories
6. Self-Declaration based upon Audited Statement
7. Any other information/statutory document as required

We confirm that the information provided is true and correct to the best of our knowledge and belief. We request you to kindly process our application and grant the EPR Registration at the earliest.

Thanking you,
Yours faithfully,
For {{OrganizationName}}

(Signature)

{{AuthorizedPersonName}}
{{Designation}}
Mobile: {{Mobile}}  |  Email: {{Email}}`,

  selfDeclaration: `[ COMPANY LETTERHEAD ]
{{OrganizationName}}  |  {{RegisteredAddress}}
CIN: {{CIN}}  |  GSTIN: {{GSTIN}}  |  PAN: {{CompanyPAN}}  |  IEC: {{IEC}}

Date: {{Date}}

SELF-DECLARATION
(Based upon Audited Financial Statements)

I/We, {{AuthorizedPersonName}}, {{Designation}}, duly authorized signatory of {{OrganizationName}} (Trade Name: {{TradeName}}), having registered office at {{RegisteredAddress}}, GSTIN {{GSTIN}} and PAN {{CompanyPAN}}, do hereby solemnly declare and affirm as under:

1. That the details of plastic packaging imported, procured, sold and consumed, and the quantities (in Tonnes) furnished in our EPR application (Application No. {{ApplicationNo}}) for the year {{RegistrationYear}}, are true, correct and complete, and are based upon our audited financial statements and books of account for the relevant financial year(s).

2. That the category-wise and transaction-wise data submitted under Part B of the application has been derived from genuine invoices / GST e-invoices and supporting records maintained in the ordinary course of business.

3. That we have complied with the applicable provisions of the Plastic Waste Management Rules, 2016 (as amended) to the extent applicable to us.

Verified at {{Place}} on this {{Date}} that the contents of the above declaration are true and correct to the best of my/our knowledge and belief.

For {{OrganizationName}}

(Signature & Seal)

{{AuthorizedPersonName}}
{{Designation}}`,

  largeEntity: `[ COMPANY LETTERHEAD ]
{{OrganizationName}}  |  {{RegisteredAddress}}
CIN: {{CIN}}  |  GSTIN: {{GSTIN}}  |  PAN: {{CompanyPAN}}  |  IEC: {{IEC}}

Date: {{Date}}

DECLARATION OF ENTERPRISE CATEGORY
(Large Enterprise)

I/We, {{AuthorizedPersonName}}, {{Designation}}, duly authorized signatory of {{OrganizationName}} (Trade Name: {{TradeName}}), having registered office at {{RegisteredAddress}}, GSTIN {{GSTIN}} and PAN {{CompanyPAN}}, do hereby declare and confirm as under:

1. That {{OrganizationName}} is classified as a LARGE ENTERPRISE, as its investment in plant & machinery/equipment and/or annual turnover exceeds the thresholds prescribed for Micro, Small and Medium Enterprises under the Micro, Small and Medium Enterprises Development (MSMED) Act, 2006 (as amended).

2. That, being a Large Enterprise, {{OrganizationName}} is not registered as an MSME and accordingly no MSME (Udyam) Registration Certificate is applicable to us. This declaration is submitted in lieu thereof for the purpose of establishing our company category in the EPR application (Application No. {{ApplicationNo}}).

3. That the above position is based upon our audited financial statements for the relevant financial year and is true and correct.

Verified at {{Place}} on this {{Date}}.

For {{OrganizationName}}

(Signature & Seal)

{{AuthorizedPersonName}}
{{Designation}}`,
};

export function currentFinancialYear(date = new Date()) {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}

export function formatLetterDate(date = new Date()) {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function pick(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function nameFromAddress(address) {
  const first = String(address || '').split(',')[0].trim();
  if (first && /pvt|ltd|llp|limited|private|company|industries|enterprises/i.test(first)) {
    return first;
  }
  return '';
}

export function getApplicableLetters(typeOfCompany) {
  const isLarge = String(typeOfCompany || '').toLowerCase() === 'large';
  return LETTER_CATALOG.filter((letter) => !letter.largeOnly || isLarge);
}

export function expandLetterValues(values = {}) {
  const out = { ...values };
  for (const [canonical, aliases] of Object.entries(PLACEHOLDER_ALIASES)) {
    const val = pick(values[canonical], ...aliases.map((alias) => values[alias]));
    out[canonical] = val;
    for (const alias of aliases) out[alias] = val;
  }
  return out;
}

export function fillLetterText(template, values = {}) {
  const expanded = expandLetterValues(values);
  const letterhead = expanded.OrganizationName || 'COMPANY LETTERHEAD';
  let text = String(template || '');
  text = text.replace(/\[\s*COMPANY LETTERHEAD\s*\]/gi, letterhead);
  text = text.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => expanded[key.trim()] || '________');
  return text;
}

export function letterPreviewLines(letterId, values = {}) {
  const template = LETTER_BODIES[letterId];
  if (!template) return [];
  return fillLetterText(template, values)
    .split('\n')
    .map((line) => line.trimEnd());
}

export function buildLetterValues({
  generalInfo = {},
  autoData = {},
  email = '',
  mobile = '',
  iec = '',
  docs = [],
  companies = [],
  overrides = {},
} = {}) {
  const fromDocs = buildRegistrationDataFromDocuments(docs || []);
  const iecDoc = (docs || []).find((doc) => doc.doc_type === 'iec');
  const company = Array.isArray(companies) && companies.length ? companies[0] : {};
  const registeredAddress = pick(
    [generalInfo.registeredAddressLine1, generalInfo.registeredAddressLine2].filter(Boolean).join(', '),
    autoData.registeredAddress,
    fromDocs.registeredAddress,
    company.address
  );
  const plantAddress = generalInfo.isSameAsRegisteredAddress === false
    ? pick(generalInfo.plantAddress, registeredAddress)
    : registeredAddress;

  const organizationName = pick(
    autoData.legalName,
    fromDocs.legalName,
    autoData.companyName,
    fromDocs.companyName,
    company.name,
    nameFromAddress(registeredAddress)
  );

  const values = {
    OrganizationName: organizationName,
    TradeName: pick(autoData.companyName, fromDocs.companyName, organizationName),
    RegisteredAddress: registeredAddress,
    PlantAddress: plantAddress,
    CIN: pick(generalInfo.cin, autoData.cin, fromDocs.cin, company.cin),
    GSTIN: pick(autoData.gstin, fromDocs.gstin, company.gstin),
    CompanyPAN: pick(autoData.companyPan, fromDocs.companyPan, company.pan),
    IEC: pick(iec, autoData.iec, iecDoc?.document_number),
    TypeOfCompany: pick(generalInfo.typeOfCompany, autoData.typeOfCompany, fromDocs.enterpriseType),
    AuthorizedPersonName: pick(autoData.authName, fromDocs.authName, generalInfo.authName),
    Designation: pick(generalInfo.authDesignation, autoData.authDesignation, fromDocs.authDesignation),
    Mobile: pick(mobile, autoData.mobile, generalInfo.mobile),
    Email: pick(email, autoData.email, generalInfo.email),
    ApplicationNo: pick(overrides.ApplicationNo, generalInfo.partCApplicationNo, 'To be allotted'),
    RegistrationYear: pick(overrides.RegistrationYear, generalInfo.partCRegistrationYear, currentFinancialYear()),
    Date: pick(overrides.Date, formatLetterDate()),
    Place: pick(overrides.Place, generalInfo.partCLetterPlace, generalInfo.district, autoData.district, fromDocs.district, generalInfo.stateUt),
  };

  return expandLetterValues({ ...values, ...overrides });
}

export const REQUIRED_LETTER_FIELDS = [
  ['OrganizationName', 'Organisation name'],
  ['RegisteredAddress', 'Registered address'],
  ['GSTIN', 'GSTIN'],
  ['CompanyPAN', 'Company PAN'],
  ['AuthorizedPersonName', 'Authorised person'],
  ['Designation', 'Designation'],
  ['Mobile', 'Mobile'],
  ['Email', 'Email'],
  ['Place', 'Place'],
  ['TypeOfCompany', 'Type of company'],
];

export function missingLetterFields(values = {}) {
  return REQUIRED_LETTER_FIELDS
    .filter(([key]) => !String(values[key] || '').trim())
    .map(([, label]) => label);
}

export function getLocalFilePath(file) {
  if (!file) return '';
  try {
    const fromElectron = window.pwp?.webUtils?.getPathForFile?.(file);
    if (fromElectron) return fromElectron;
  } catch {
    /* browser / older Electron */
  }
  return file.path || '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function persistLocalUpload(file) {
  if (!file) return '';
  const src = getLocalFilePath(file);
  if (src && window.pwp?.fs?.copyRegistrationFile) {
    try {
      const copied = await window.pwp.fs.copyRegistrationFile(src);
      if (copied) return copied;
    } catch {
      /* fall through to in-memory save */
    }
    if (src.includes('\\') || src.includes('/')) return src;
  }
  if (window.pwp?.fs?.saveRegistrationFile) {
    try {
      const base64 = await fileToBase64(file);
      const saved = await window.pwp.fs.saveRegistrationFile(file.name, base64);
      if (saved) return saved;
    } catch {
      /* ignore */
    }
  }
  return src || '';
}

export function fileLabel(filePath) {
  if (!filePath) return '';
  return String(filePath).split(/[/\\]/).pop();
}

export async function resolveIecNumber(docs = []) {
  const fromList = (docs || []).find((doc) => doc.doc_type === 'iec');
  if (fromList?.document_number) return String(fromList.document_number).trim();
  try {
    const all = await window.pwp?.documents?.getAll?.();
    const iecDoc = (all || []).find((doc) => doc.doc_type === 'iec');
    return String(iecDoc?.document_number || '').trim();
  } catch {
    return '';
  }
}

export async function loadLetterSourceRecords() {
  const docsPromise = window.pwp?.documents?.getAll
    ? window.pwp.documents.getAll().catch(() => [])
    : Promise.resolve([]);
  const companiesPromise = window.pwp?.companies?.getAll
    ? window.pwp.companies.getAll().catch(() => [])
    : Promise.resolve([]);
  const [docs, companies] = await Promise.all([docsPromise, companiesPromise]);
  return { docs: docs || [], companies: companies || [] };
}
