const MISSING_DOC_LABELS = {
  gst: 'Upload Company GST certificate (Doc Processor section above)',
  person_pan: 'Upload Authorized Person PAN (Doc Processor section above)',
  company_pan: 'Upload Company PAN, or a GST certificate with a valid embedded PAN',
};

/** Items still blocking the CPCB account "Start Registration" action. */
export function getRegistrationChecklist({
  docReady = true,
  missingDocs = [],
  fileNameIssues = [],
  autoData = {},
  email = '',
  mobile = '',
  generalInfo = {},
} = {}) {
  const checklist = [
    {
      id: 'doc-gst',
      label: MISSING_DOC_LABELS['gst'] || 'Upload Company GST certificate',
      fulfilled: docReady || !missingDocs.includes('gst'),
    },
    {
      id: 'doc-person_pan',
      label: MISSING_DOC_LABELS['person_pan'] || 'Upload Authorized Person PAN',
      fulfilled: docReady || !missingDocs.includes('person_pan'),
    },
    {
      id: 'doc-company_pan',
      label: MISSING_DOC_LABELS['company_pan'] || 'Upload Company PAN, or a GST certificate with a valid embedded PAN',
      fulfilled: docReady || !missingDocs.includes('company_pan'),
    },
    {
      id: 'gstin',
      label: 'GSTIN — upload GST certificate in Doc Processor',
      fulfilled: Boolean(String(autoData.gstin || '').trim()),
    },
    {
      id: 'authPan',
      label: 'Authorized Person PAN — upload person PAN in Doc Processor',
      fulfilled: Boolean(String(autoData.authPan || '').trim()),
    },
    {
      id: 'authName',
      label: 'Authorized Person name — upload person PAN in Doc Processor',
      fulfilled: Boolean(String(autoData.authName || '').trim()),
    },
    {
      id: 'authDob',
      label: 'Authorized Person date of birth — upload person PAN in Doc Processor',
      fulfilled: Boolean(String(autoData.authDob || '').trim()) && (() => {
        const dobDate = new Date(autoData.authDob);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age -= 1;
        return age >= 18;
      })(),
    },
    {
      id: 'email',
      label: 'Enter Email Address',
      fulfilled: Boolean(String(email || '').trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    },
    {
      id: 'mobile',
      label: 'Enter Mobile Number',
      fulfilled: Boolean(String(mobile || '').trim()) && /^[0-9]{10}$/.test(mobile),
    },
    {
      id: 'typeOfBusiness',
      label: 'Select Type of Business',
      fulfilled: Boolean(String(generalInfo.typeOfBusiness || '').trim()),
    },
    {
      id: 'typeOfCompany',
      label: 'Select Type of Company',
      fulfilled: Boolean(String(generalInfo.typeOfCompany || '').trim()),
    },
    ...(['Micro', 'Small', 'Medium', 'Large'].includes(String(generalInfo.typeOfCompany || '').trim()) ? [{
      id: 'doc-type_of_company',
      label: String(generalInfo.typeOfCompany || '').trim().toLowerCase() === 'large' 
        ? 'Upload Declaration of Large Entity (Part C - Prepared Letters)' 
        : 'Upload MSME Certificate (Part C)',
      fulfilled: Boolean(String(autoData.typeOfCompanyDoc || '').trim()),
    }] : []),
    {
      id: 'registeredAddressLine1',
      label: 'Enter Registered Address Line 1',
      fulfilled: Boolean(String(generalInfo.registeredAddressLine1 || '').trim()),
    },
    {
      id: 'stateUt',
      label: 'Select State/UT',
      fulfilled: Boolean(String(generalInfo.stateUt || '').trim()),
    },
    {
      id: 'district',
      label: 'Enter District',
      fulfilled: Boolean(String(generalInfo.district || '').trim()),
    },
    {
      id: 'authDesignation',
      label: 'Enter Designation (e.g. Director, Manager)',
      fulfilled: Boolean(String(generalInfo.authDesignation || '').trim()),
    },
    {
      id: 'password',
      label: 'Enter Password (minimum 8 characters)',
      fulfilled: Boolean(String(generalInfo.password || '').trim()) && String(generalInfo.password).length >= 8,
    },
    {
      id: 'confirmPassword',
      label: 'Confirm Password',
      fulfilled: Boolean(String(generalInfo.confirmPassword || '').trim()) && generalInfo.password === generalInfo.confirmPassword,
    },
  ];

  // We add file name issues as unfulfilled extra items if they exist
  for (const issue of fileNameIssues) {
    checklist.push({
      id: `file-${issue.label}-${issue.fileName}`,
      label: `${issue.label}: file is still being prepared — re-upload if this persists`,
      fulfilled: false,
    });
  }

  return checklist;
}

export function getStartRegistrationBlockers(args = {}) {
  return getRegistrationChecklist(args).filter((item) => !item.fulfilled);
}
