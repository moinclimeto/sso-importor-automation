import {
  validatePlasticConsumed3cForPortal,
  formatPlasticConsumed3cIssue,
} from '../../shared/plasticConsumed3cValidation.js';
import {
  validateSection4AgainstPlasticConsumed,
  formatSection4PartAIssue,
  formatSection4IssuesAsPortalMessage,
} from '../../shared/partBSection4.js';
import {
  validateSection5bAgainstPlasticConsumed,
  formatSection5bPartAIssue,
  prepareSec5bForPortal,
} from '../../shared/partBSection5.js';
import { requiresHistoricalEprData } from '../../shared/commencementYearScope.js';
import { getCpcbPortalPartA3cYears } from '../../shared/financialYearScope.js';
import { alignPlasticConsumedToYears, prunePlasticConsumedForPortal } from '../../shared/plasticConsumed3c.js';

const PART_A_REQUIRED = [
  { key: 'typeOfBusiness', label: 'Type of Business' },
  { key: 'typeOfCompany', label: 'Type of Company' },
  { key: 'registeredAddressLine1', label: 'Registered Address' },
  { key: 'yearOfCommencement', label: 'Year of Commencement' },
  { key: 'stateUt', label: 'State/UT' },
  { key: 'complianceStatus', label: 'Compliance Status (3d)' },
  { key: 'thicknessOfPlastic', label: 'Thickness of Plastic (3e)' },
];

const PART_C_REQUIRED = [
  { key: 'partCCoveringLetter', label: 'Part C: Covering Letter' },
  { key: 'partCSignature', label: 'Part C: Signature' },
  { key: 'partCAuditedStatement', label: 'Part C: Audited Statement' },
];

function partAHint(label = '') {
  return [
    'Type of Business',
    'Type of Company',
    'State/UT',
    'Operating States',
    'Year of Commencement',
    'Compliance Status',
    'Thickness',
    'Section 3c',
    'plastic consumed',
    'Details (Type & Quantity) of products produced/marketed',
    'Representative picture of Plastic Packaging',
    'Type of Company Document',
    'Password',
    'Plant/Unit Address',
    'Unit GST',
  ].some((hint) => label.includes(hint));
}

import { isSimpRawMaterial, unitGstMatchesCompanyPan, panFromGstin } from '../../shared/entityRegistrationTypes.js';
import { validateSimpRawMaterialSupplyAgainstImport, validateSimpImportCoveringRequiredYears, validateSimpSupplyPortalRows, prepareSimpSupplyRowsForPortal } from '../../shared/simpRawMaterialPartB.js';

/** Blockers for Register / New Application — runs before login or automation. */
export function getRegisterApplicationBlockers({
  savedCeprId = '',
  generalInfo = {},
  autoData = {},
  reportingYears = null,
} = {}) {
  const blockers = [];
  const years = reportingYears?.length ? reportingYears : getCpcbPortalPartA3cYears();
  const portalPlasticConsumed = alignPlasticConsumedToYears(generalInfo.plasticConsumed, years);
  const showHistorical = requiresHistoricalEprData(generalInfo.yearOfCommencement);
  const isSimp = isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType);

  if (!String(savedCeprId || '').trim()) {
    blockers.push({
      id: 'cepr-id',
      label: 'CEPR ID not found — complete registration first.',
      section: 'login',
    });
  }

  if (!String(generalInfo.password || '').trim()) {
    blockers.push({
      id: 'password',
      label: 'Enter CPCB portal Password in Part A → Login credentials.',
      section: 'partA',
    });
  }

  if (isSimp) {
    if (!String(generalInfo.plantState || generalInfo.stateUt || '').trim()) {
      blockers.push({ id: 'plantState', label: 'Plant / Unit State', section: 'partA' });
    }
    if (!generalInfo.isSameAsRegisteredAddress && !String(generalInfo.plantAddress || '').trim()) {
      blockers.push({ id: 'plantAddress', label: 'Plant / Unit Address', section: 'partA' });
    }
    if (!String(generalInfo.unitGst || '').trim()) {
      blockers.push({ id: 'unitGst', label: 'Plant/Unit GST', section: 'partA' });
    } else {
      const companyPan = generalInfo.companyPan || autoData.companyPan || autoData.pan || panFromGstin(generalInfo.gstin || autoData.gstin);
      if (!unitGstMatchesCompanyPan(generalInfo.unitGst, companyPan, generalInfo.gstin || autoData.gstin)) {
        blockers.push({
          id: 'unitGst-pan',
          label: 'Plant/Unit GST PAN does not match Company PAN (CPCB will reject verification). Use a GSTIN issued to the same PAN.',
          section: 'partA',
        });
      }
    }
    if (!autoData.unitGstDoc) {
      blockers.push({ id: 'unitGstDoc', label: 'Plant/Unit GST document', section: 'partA' });
    }
    if (!autoData.gstDoc && !autoData.gstinDoc && !autoData.gstDocumentPath) {
      blockers.push({ id: 'gstDoc', label: 'GST document', section: 'partA' });
    }
    if (!autoData.companyPanDoc && !autoData.panDoc && !autoData.companyPanDocumentPath && !autoData.panDocumentPath) {
      blockers.push({ id: 'companyPanDoc', label: 'Company PAN document', section: 'partA' });
    }
    if (!autoData.personPanDoc && !autoData.authPanDoc && !autoData.personPanDocumentPath) {
      blockers.push({ id: 'personPanDoc', label: 'Authorized Person PAN document', section: 'partA' });
    }
    if (!autoData.cinDoc && !autoData.cinDocumentPath) {
      blockers.push({ id: 'cinDoc', label: 'Company CIN document', section: 'partA' });
    }
    if (!String(generalInfo.yearOfCommencement || '').trim()) {
      blockers.push({ id: 'yearOfCommencement', label: 'Year of Commencement of Production', section: 'partA' });
    }
    if (!String(generalInfo.capitalInvested || '').trim()) {
      blockers.push({ id: 'capitalInvested', label: 'Total Capital Invested on the Project (Rs in Crores)', section: 'partA' });
    }
    if (/^yes$/i.test(String(generalInfo.dicRegistered || '')) && !autoData.dicRegistrationDoc && !generalInfo.dicRegistrationDoc) {
      blockers.push({ id: 'dicRegistrationDoc', label: 'DIC/DCSSI Supporting Document', section: 'partA' });
    }

    const importYearIssues = validateSimpImportCoveringRequiredYears(
      generalInfo.simpImportDetails || [],
    );
    for (const issue of importYearIssues) {
      blockers.push({
        id: `simp-import-fy-${(issue.missingYears || []).join('-')}`,
        label: issue.message,
        section: 'partB',
      });
    }

    const supplyIssues = validateSimpRawMaterialSupplyAgainstImport(
      generalInfo.simpImportDetails || [],
      generalInfo.simpSupplyDetails || [],
    );
    for (const issue of supplyIssues) {
      blockers.push({
        id: `simp-supply-${issue.financialYear}-${issue.plasticType}`,
        label: issue.message,
        section: 'partB',
      });
    }

    const preparedSupply = prepareSimpSupplyRowsForPortal(generalInfo.simpSupplyDetails || [], {
      fallbackContact: generalInfo.mobile || autoData.mobile || '',
    });
    for (const issue of validateSimpSupplyPortalRows(preparedSupply)) {
      blockers.push({
        id: `simp-supply-field-${issue.row}-${issue.field}`,
        label: `Part B sales Excel: ${issue.message}`,
        section: 'partB',
      });
    }

    if (!String(generalInfo.latitude || '').trim()) {
      blockers.push({ id: 'latitude', label: 'Part C: GPS Latitude', section: 'partC' });
    }
    if (!String(generalInfo.longitude || '').trim()) {
      blockers.push({ id: 'longitude', label: 'Part C: GPS Longitude', section: 'partC' });
    }
    if (!generalInfo.partCCoveringLetter && !autoData.coveringLetterDoc) {
      blockers.push({ id: 'partCCoveringLetter', label: 'Part C: Cover Letter', section: 'partC' });
    }
    if (!generalInfo.partCSignature && !autoData.signatureDoc) {
      blockers.push({ id: 'partCSignature', label: 'Part C: Signature', section: 'partC' });
    }
    if (!generalInfo.partCAuditedStatement && !autoData.selfDeclarationDoc) {
      blockers.push({ id: 'partCAuditedStatement', label: 'Part C: Self Declaration', section: 'partC' });
    }

    return blockers;
  }

  for (const req of PART_A_REQUIRED) {
    if (!String(generalInfo[req.key] || '').trim()) {
      blockers.push({ id: req.key, label: req.label, section: 'partA' });
    }
  }

  for (const req of PART_C_REQUIRED) {
    if (!generalInfo[req.key]) {
      blockers.push({ id: req.key, label: req.label, section: 'partC' });
    }
  }

  if (!generalInfo.operatingStates || generalInfo.operatingStates.length === 0) {
    blockers.push({
      id: 'operatingStates',
      label: 'Operating States (minimum 1 required)',
      section: 'partA',
    });
  } else if (generalInfo.operatingStates.length === 2) {
    blockers.push({
      id: 'operatingStates-count',
      label: 'Operating States (Cannot select exactly 2 states. Select 1, or 3+ states)',
      section: 'partA',
    });
  }

  if (['Micro', 'Small', 'Medium', 'Large'].includes(generalInfo.typeOfCompany) && !autoData.typeOfCompanyDoc) {
    blockers.push({
      id: 'typeOfCompanyDoc',
      label: 'Type of Company Document (MSME/Declaration)',
      section: 'partA',
    });
  }

  if (!autoData.detailsOfProductsPath) {
    blockers.push({
      id: 'detailsOfProductsPath',
      label: 'Details (Type & Quantity) of products produced/marketed',
      section: 'partA',
    });
  }

  if (!autoData.representativePicturePath) {
    blockers.push({
      id: 'representativePicturePath',
      label: 'Representative picture of Plastic Packaging',
      section: 'partA',
    });
  }

  if (!generalInfo.isSameAsRegisteredAddress) {
    if (!generalInfo.plantAddress) {
      blockers.push({ id: 'plantAddress', label: 'Plant/Unit Address', section: 'partA' });
    }
    if (!generalInfo.unitGst) {
      blockers.push({ id: 'unitGst', label: 'Unit GST', section: 'partA' });
    }
    if (!autoData.unitGstDoc) {
      blockers.push({ id: 'unitGstDoc', label: 'Unit GST Document', section: 'partA' });
    }
  }

  if (showHistorical) {
    for (const issue of validatePlasticConsumed3cForPortal({
      plasticConsumed: portalPlasticConsumed,
      yearOfCommencement: generalInfo.yearOfCommencement,
      reportingYears: years,
    })) {
      blockers.push({
        id: issue.id,
        label: formatPlasticConsumed3cIssue(issue),
        section: 'partA',
        year: issue.year,
      });
    }

    for (const issue of validateSection4AgainstPlasticConsumed(
      generalInfo.partBSection4 || [],
      portalPlasticConsumed,
      years,
    )) {
      blockers.push({
        id: `section4-${issue.year}-${issue.catKey}`,
        label: formatSection4PartAIssue(issue),
        section: 'partB',
        _issue: issue,
      });
    }

    const prepared5b = prepareSec5bForPortal({
      plasticConsumed: portalPlasticConsumed,
      sec5b: generalInfo.partBTransactions?.sec5b || [],
      years,
      alignToPartA: true,
    });
    for (const issue of validateSection5bAgainstPlasticConsumed(
      prepared5b,
      portalPlasticConsumed,
      years,
    )) {
      blockers.push({
        id: `section5b-${issue.year}-${issue.catKey}`,
        label: formatSection5bPartAIssue(issue),
        section: 'partB',
      });
    }
  }

  return blockers;
}

export function navigateToRegisterBlockerSection(blockers = [], { setWizardStep } = {}) {
  if (!blockers.length || !setWizardStep) return;
  const first = blockers[0];
  if (first.section === 'partA' || partAHint(first.label)) {
    setWizardStep('partA');
  } else if (first.section === 'partB') {
    setWizardStep('partB');
  } else if (first.section === 'partC' || String(first.label || '').startsWith('Part C')) {
    setWizardStep('partC');
  }
}

export function summarizeRegisterBlockers(blockers = []) {
  if (!blockers.length) return '';
  if (blockers.length === 1) return blockers[0].label;
  return `${blockers[0].label} (+${blockers.length - 1} more)`;
}

/** Split Part B ±40% blockers — Section 4 (PW generated) vs Section 5b (unregistered purchases). */
export function getPartBPlasticValidationSummary(blockers = []) {
  const section4 = blockers.filter((b) => String(b.id || '').startsWith('section4-'));
  const section5b = blockers.filter((b) => String(b.id || '').startsWith('section5b-'));
  return { section4, section5b };
}

/** User-facing toasts for Part B plastic validation (avoids mislabeling 5b issues as Section 4). */
export function formatPartBPlasticValidationToasts(blockers = []) {
  const { section4, section5b } = getPartBPlasticValidationSummary(blockers);
  const messages = [];

  if (section4.length) {
    const s4Issues = section4.map((b) => b._issue).filter(Boolean);
    const portalMsg = s4Issues.length
      ? formatSection4IssuesAsPortalMessage(s4Issues)
      : `${section4.length} Section 4 total(s) are outside ±40% range of Part A 3c.`;
    messages.push({
      type: 'error',
      text: portalMsg,
    });
  }
  if (section5b.length) {
    messages.push({
      type: 'warning',
      text: `${section5b.length} Section 5b total(s) are outside ±40% of Part A 3c. Add published unregistered purchases or manual 5b rows (5a is manual).`,
    });
  }
  return messages;
}

