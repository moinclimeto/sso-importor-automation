export function normalizeGstin(gstin) {
  return String(gstin || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isInvalidGstPortalStatus(status) {
  return /cancelled|canceled|inactive|suspended|invalid|revoked/i.test(String(status || '').trim());
}

export function formatInvalidGstError(gstNo, status) {
  return `GST ${gstNo} is "${status}" on CPCB portal. Registration cannot proceed — please upload an active GST certificate.`;
}

export function evaluateGstDetailsResponse(body, gstin) {
  const gstNo = body?.data?.gstNo || normalizeGstin(gstin);
  const portalStatus = String(body?.data?.status || '').trim();
  const legalName = body?.data?.legalName || '';
  const tradeName = body?.data?.tradeName || '';

  if (body?.error === true || body?.status === false) {
    return {
      checked: true,
      gstNo,
      portalStatus,
      legalName,
      tradeName,
      isRegistrationAllowed: false,
      message: body?.errorMsg || body?.successMsg || 'GST verification failed on CPCB portal.',
    };
  }

  if (portalStatus && isInvalidGstPortalStatus(portalStatus)) {
    return {
      checked: true,
      gstNo,
      portalStatus,
      legalName,
      tradeName,
      isRegistrationAllowed: false,
      message: formatInvalidGstError(gstNo, portalStatus),
    };
  }

  if (body?.status === true && body?.data) {
    return {
      checked: true,
      gstNo,
      portalStatus: portalStatus || 'Active',
      legalName,
      tradeName,
      isRegistrationAllowed: true,
      message: portalStatus
        ? `GST ${gstNo} is ${portalStatus} on CPCB portal.`
        : `GST ${gstNo} verified on CPCB portal.`,
    };
  }

  return {
    checked: false,
    gstNo,
    portalStatus,
    legalName,
    tradeName,
    isRegistrationAllowed: false,
    message: body?.errorMsg || 'Unexpected response from CPCB GST service.',
  };
}

export function isDuplicateAuthPersonMessage(text) {
  const msg = String(text || '').trim();
  if (!msg) return false;
  return /already exists|is already exists|409|conflict/i.test(msg)
    && /pan|email|mobile|authorised person|authorized person/i.test(msg);
}

export function formatDuplicateAuthPersonError(message) {
  const base = String(message || '').trim()
    || 'Authorised Person PAN, EMAIL and MOBILE already exists on CPCB portal.';
  return `${base} Use different Auth Person details, or recover the existing CPCB account from epr.cpcb.gov.in/login ("Lost Credentials").`;
}

export function evaluateCompaniesApiResponse(body, httpStatus) {
  const status = Number(httpStatus ?? body?.statusCode ?? 0);
  const message = String(body?.message || body?.errorMsg || '').trim();

  if (status === 409 || /conflict/i.test(String(body?.error || ''))) {
    return {
      isRegistrationAllowed: false,
      message: message || 'Authorised Person PAN, EMAIL and MOBILE is already exists',
      errorCode: 'DUPLICATE_AUTH_PERSON',
    };
  }

  if (status >= 400) {
    return {
      isRegistrationAllowed: false,
      message: message || `Company registration failed on CPCB portal (HTTP ${status}).`,
    };
  }

  return {
    isRegistrationAllowed: true,
    message: message || '',
  };
}
