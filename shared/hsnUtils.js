/** Parse HSN/SAC from invoice line text e.g. "HSN CODE-39189090". */
export function extractHsnFromText(text) {
  const s = String(text || '');
  if (!s) return '';

  const patterns = [
    /\bHSN\s*(?:CODE|SAC)?\s*[:\-/]?\s*(\d{4,8})\b/i,
    /\bSAC\s*[:\-/]?\s*(\d{4,8})\b/i,
    /\bHSN\s*[\/&]\s*SAC\s*[:\-/]?\s*(\d{4,8})\b/i,
  ];

  for (const re of patterns) {
    const match = s.match(re);
    if (match?.[1]) return match[1];
  }

  if (/hsn|sac/i.test(s)) {
    const digits = s.match(/\b(\d{8})\b/);
    if (digits?.[1]) return digits[1];
  }

  return '';
}

export function normalizeHsnCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(0, 8);
}

/** Resolve HSN from structured fields or embedded description text. */
export function resolveLineHsn(item = {}) {
  const direct = normalizeHsnCode(
    item.hsn ?? item.hsn_code ?? item.hsnCode ?? item.h ?? item.HSN,
  );
  if (direct) return direct;

  const text = [
    item.product_description,
    item.productDescription,
    item.description,
    item.d,
    item.product,
    item.p,
    item.item_name,
    item.name,
  ]
    .filter(Boolean)
    .join(' ');

  return extractHsnFromText(text) || '';
}

export function fillLineItemsHsn(lineItems = [], headerHsnCode = '') {
  const headerHsn = normalizeHsnCode(headerHsnCode) || extractHsnFromText(headerHsnCode);
  return (lineItems || []).map((line) => {
    const existing = normalizeHsnCode(line.hsn ?? line.hsn_code);
    if (existing) return { ...line, hsn: existing };

    const parsed = resolveLineHsn(line);
    if (parsed) return { ...line, hsn: parsed };

    if (headerHsn && lineItems.length === 1) {
      return { ...line, hsn: headerHsn };
    }

    return line;
  });
}
