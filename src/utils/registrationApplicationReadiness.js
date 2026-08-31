import {
  validatePlasticConsumed3cForPortal,
  formatPlasticConsumed3cIssue,
} from '../../shared/plasticConsumed3cValidation.js';
import {
  validateSection4AgainstPlasticConsumed,
  formatSection4PartAIssue,
} from '../../shared/partBSection4.js';
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
