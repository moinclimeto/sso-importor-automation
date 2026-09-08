export function isLoginOtpError(message = '') {
  const msg = String(message || '').trim().toLowerCase();
  return /invalid|expired|incorrect|wrong|otp|6.?digit|verification failed|try again/.test(msg);
}

export function isLoginOtpFailureResult(res = {}) {
  if (res?.success) return false;
  if (res?.step === 'WAITING_LOGIN_OTP' || res?.step === 'WAITING_LOGIN_CAPTCHA') return true;
  return isLoginOtpError(res?.error);
}

export function isGstStatusBlockingError(error) {
  const msg = String(error || '').trim();
  return /cancelled|canceled|inactive|suspended/i.test(msg) && /gst/i.test(msg);
}

export function isDuplicateAuthPersonError(error) {
  const msg = String(error || '').trim();
  return /already exists|409|conflict/i.test(msg)
    && /pan|email|mobile|authorised person|authorized person/i.test(msg);
}

export function registrationAutomationToastOptions(error) {
  if (isGstStatusBlockingError(error)) {
    return { type: 'warning', duration: 10000 };
  }
  if (isDuplicateAuthPersonError(error)) {
    return { type: 'error', duration: 14000 };
  }
  return { type: 'error' };
}

export function showRegistrationAutomationError(showToast, setAutomationLogs, error) {
  const errMsg = String(error || '').trim() || 'Registration automation failed.';
  const toastOpts = registrationAutomationToastOptions(errMsg);
  showToast(errMsg, toastOpts.type, { duration: toastOpts.duration });
  if (setAutomationLogs) {
    setAutomationLogs((prev) => [...prev, { type: 'error', message: errMsg }]);
  }
}
