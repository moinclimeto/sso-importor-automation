const MISSING_DOC_LABELS = {
  gst: 'Upload Company GST certificate (Doc Processor section above)',
  person_pan: 'Upload Authorized Person PAN (Doc Processor section above)',
  company_pan: 'Upload Company PAN, or a GST certificate with a valid embedded PAN',
};

/** Items still blocking the CPCB account "Start Registration" action. */
export function getStartRegistrationBlockers({
  docReady = true,
  missingDocs = [],
  fileNameIssues = [],
  autoData = {},
  email = '',
  mobile = '',
  generalInfo = {},
} = {}) {
  const blockers = [];

  if (!docReady) {
    for (const docType of missingDocs) {
      blockers.push({
        id: `doc-${docType}`,
        label: MISSING_DOC_LABELS[docType] || `Upload ${docType}`,
        section: 'documents',
      });
    }
  }

  for (const issue of fileNameIssues) {
    blockers.push({
      id: `file-${issue.label}-${issue.fileName}`,
      label: `${issue.label}: file is still being prepared — re-upload if this persists`,
      section: 'files',
    });
  }

  if (!String(autoData.gstin || '').trim()) {
    blockers.push({ id: 'gstin', label: 'GSTIN — upload GST certificate in Doc Processor', section: 'documents' });
  }
  if (!String(autoData.authPan || '').trim()) {
    blockers.push({ id: 'authPan', label: 'Authorized Person PAN — upload person PAN in Doc Processor', section: 'documents' });
  }
  if (!String(autoData.authName || '').trim()) {
    blockers.push({ id: 'authName', label: 'Authorized Person name — upload person PAN in Doc Processor', section: 'documents' });
  }
  if (!String(autoData.authDob || '').trim()) {
    blockers.push({ id: 'authDob', label: 'Authorized Person date of birth — upload person PAN in Doc Processor', section: 'documents' });
  }

  if (!String(email || '').trim()) {
    blockers.push({ id: 'email', label: 'Enter Email Address', section: 'form' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    blockers.push({ id: 'email-invalid', label: 'Enter a valid Email Address', section: 'form' });
  }

  if (!String(mobile || '').trim()) {
    blockers.push({ id: 'mobile', label: 'Enter Mobile Number', section: 'form' });
  } else if (!/^[0-9]{10}$/.test(mobile)) {
    blockers.push({ id: 'mobile-invalid', label: 'Enter a valid 10-digit Mobile Number', section: 'form' });
  }

  if (!String(generalInfo.typeOfBusiness || '').trim()) {
    blockers.push({ id: 'typeOfBusiness', label: 'Select Type of Business', section: 'form' });
  }
  if (!String(generalInfo.typeOfCompany || '').trim()) {
    blockers.push({ id: 'typeOfCompany', label: 'Select Type of Company', section: 'form' });
  }
  if (!String(generalInfo.registeredAddressLine1 || '').trim()) {
    blockers.push({ id: 'registeredAddressLine1', label: 'Enter Registered Address Line 1', section: 'form' });
  }
  if (!String(generalInfo.stateUt || '').trim()) {
    blockers.push({ id: 'stateUt', label: 'Select State/UT', section: 'form' });
  }
  if (!String(generalInfo.district || '').trim()) {
    blockers.push({ id: 'district', label: 'Enter District', section: 'form' });
  }
  if (!String(generalInfo.authDesignation || '').trim()) {
    blockers.push({ id: 'authDesignation', label: 'Enter Designation (e.g. Director, Manager)', section: 'form' });
  }
  if (!String(generalInfo.password || '').trim()) {
    blockers.push({ id: 'password', label: 'Enter Password (minimum 8 characters)', section: 'form' });
  } else if (String(generalInfo.password).length < 8) {
    blockers.push({ id: 'password-short', label: 'Password must be at least 8 characters', section: 'form' });
  }
  if (!String(generalInfo.confirmPassword || '').trim()) {
    blockers.push({ id: 'confirmPassword', label: 'Confirm Password', section: 'form' });
  } else if (generalInfo.password !== generalInfo.confirmPassword) {
    blockers.push({ id: 'password-mismatch', label: 'Password and Confirm Password must match', section: 'form' });
  }

  if (autoData.authDob) {
    const dobDate = new Date(autoData.authDob);
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const m = today.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age -= 1;
    if (age < 18) {
      blockers.push({ id: 'authDob-age', label: 'Authorized Person must be at least 18 years old', section: 'form' });
    }
  }

  return blockers;
}
