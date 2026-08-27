/** Parse HSN/SAC from invoice line text e.g. "HSN CODE-39189090". */
export function extractHsnFromText(text) {
  const s = String(text || '');
  if (!s) return '';

  const patterns = [
    /\bHSN\s*(?:CODE|SAC)?\s*[:\-/]?\s*(\d{4,8})\b/i,
    /\bSAC\s*[:\-/]?\s*(\d{4,8})\b/i,
    /\bHSN\s*[\/&]\s*SAC\s*[:\-/]?\s*(\d{4,8})\b/i,
    /\bHSN\b[\s:.-]*(\d{4,8})/i,
  ];

  for (const re of patterns) {
    const match = s.match(re);
    if (match?.[1]) return match[1];
  }

  if (/hsn|sac/i.test(s)) {
    const digits = s.match(/\b(\d{8})\b/);
    if (digits?.[1]) return digits[1];
  }

  const bareEight = s.match(/\b(\d{8})\b/);
  if (bareEight?.[1]) return bareEight[1];

  return '';
}

/** Pull embedded HSN out of a description and return a cleaner product label. */
export function splitHsnFromDescription(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return { description: '', hsn: '' };

  const hsn = extractHsnFromText(raw);
  if (!hsn) return { description: raw, hsn: '' };

  const description = raw
    .replace(/\bHSN\s*(?:CODE|SAC)?\s*[:\-/]?\s*\d{4,8}\b/gi, '')
    .replace(/\bHSN\b[\s:.-]*\d{4,8}\b/gi, '')
    .replace(/\bSAC\b[\s:.-]*\d{4,8}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+[-–]\s*$/g, '')
    .trim();

  return { description: description || raw, hsn };
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

/** Resolve HSN for review/OCR lines using draft, extraction row, and header fallbacks. */
export function resolveReviewLineHsn(line = {}, extLine = {}, row = {}, lineIndex = 0) {
  const direct = normalizeHsnCode(line.hsn ?? line.hsn_code);
  if (direct) return direct;

  for (const source of [line, extLine]) {
    const fromSource = resolveLineHsn(source);
    if (fromSource) return fromSource;
  }

  const mergedText = [
    line.productDescription,
    line.product,
    extLine?.d,
    extLine?.productDescription,
    extLine?.product_description,
    extLine?.description,
    extLine?.product,
    extLine?.p,
    extLine?.item_name,
    extLine?.name,
    row.item_name,
  ]
    .filter(Boolean)
    .join(' ');
  const fromMerged = extractHsnFromText(mergedText);
  if (fromMerged) return fromMerged;

  const extractionLines =
    row.extraction?.line_items ||
    row.extraction?.lineItems ||
    row.extraction?.products ||
    [];
  const sibling = extractionLines[lineIndex];
  if (sibling && sibling !== extLine) {
    const fromSibling = resolveLineHsn(sibling);
    if (fromSibling) return fromSibling;
  }

  const headerHsn = normalizeHsnCode(
    row.hsn_code ||
      row.extraction?.hsn_code ||
      row.extraction?.MainHsnCode ||
      row.extraction?.h,
  );
  const lineCount =
    row.line_items?.length ||
    row.lineItems?.length ||
    extractionLines.length ||
    0;
  if (headerHsn && lineCount <= 1) return headerHsn;

  return '';
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
