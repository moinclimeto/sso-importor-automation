/** Login fallbacks if the payload omits email/mobile/password. */
export const REGISTRATION_LOGIN_DUMMY = {
  email: 'amreen.climeto@gmail.com',
  mobile: '9109424392',
  password: 'Pass@321',
};

export function resolveRegistrationLoginCredentials(data = {}) {
  return {
    email: String(data.email || REGISTRATION_LOGIN_DUMMY.email).trim(),
    mobile: String(data.mobile || REGISTRATION_LOGIN_DUMMY.mobile).trim(),
    password: String(data.password || REGISTRATION_LOGIN_DUMMY.password),
  };
}

/** Pass through provided registration fields only — no dummy company JSON. */
export function withRegistrationDummyFallback(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      out[key] = value;
    }
  }
  return out;
}
