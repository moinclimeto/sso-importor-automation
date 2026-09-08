const SENSITIVE_KEY = /password|passwd|token|authorization|secret|api[_-]?key|cookie|session|otp|captcha/i;

export function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (depth > 4) return '[Truncated]';
  if (typeof value === 'string') {
    return value.length > 2500 ? `${value.slice(0, 2500)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return `[Buffer ${value.length}]`;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: String(value.stack || '').slice(0, 8000),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[Redacted]' : sanitizeValue(nested, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 500);
}

export function errorToPayload(err) {
  if (!err) return { name: 'Error', message: 'Unknown error' };
  if (typeof err === 'string') return { name: 'Error', message: err };
  return {
    name: err.name || 'Error',
    message: err.message || String(err),
    stack: String(err.stack || '').slice(0, 8000),
    code: err.code || undefined,
  };
}
