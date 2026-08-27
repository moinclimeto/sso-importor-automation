const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/gi;
const PAN_RE = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/g;

export function normalizeGstin(gst) {
  return String(gst || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

export function panFromGstin(gstin) {
  const g = normalizeGstin(gstin);
  return g.length === 15 ? g.slice(2, 12) : '';
}

export function extractGstNumbersFromText(text) {
  const found = new Set();
  const raw = String(text || '');
  for (const match of raw.matchAll(GSTIN_RE)) {
    const gst = normalizeGstin(match[1]);
    if (gst.length === 15) found.add(gst);
  }
  return [...found];
}

const FOOTER_SELLER_GST_PATTERNS = [
  /Company'?s?\s*GST\s*No\.?\s*:?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/gi,
  /Our\s*GSTIN?\s*(?:No\.?)?\s*:?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/gi,
  /Supplier\s*GSTIN?\s*(?:No\.?)?\s*:?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/gi,
  /Seller\s*GSTIN?\s*(?:No\.?)?\s*:?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/gi,
  /GSTIN\s*\/?\s*UIN\s*:?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/gi,
];

/** Footer labels like "Company's GST No.: 06AAXF..." on purchase invoices (issuer = seller). */
export function extractFooterCompanyGst(text) {
  const raw = String(text || '');
  for (const pattern of FOOTER_SELLER_GST_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(raw);
    if (match?.[1]) {
      const gst = normalizeGstin(match[1]);
      if (gst.length === 15) return gst;
    }
  }
  return '';
}

/** Infer seller GST from invoice text when OCR missed it — excludes buyer/company GST. */
export function resolveSellerGstFromInvoiceText(text, { buyerGst = '', companyGst = '' } = {}) {
  const exclude = new Set(
    [buyerGst, companyGst].map(normalizeGstin).filter((g) => g.length === 15),
  );

  const footerGst = extractFooterCompanyGst(text);
  if (footerGst && !exclude.has(footerGst)) return footerGst;

  for (const gst of extractGstNumbersFromText(text)) {
    if (!exclude.has(gst)) return gst;
  }
  return '';
}

export function extractPanNumbersFromText(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(PAN_RE)) {
    const pan = String(match[1] || '').toUpperCase();
    if (pan.length === 10 && !/^([A-Z])\1+$/.test(pan)) found.add(pan);
  }
  return [...found];
}

export function dedupeParties(parties = []) {
  const seen = new Set();
  return parties.filter((party) => {
    const key = `${party.role}:${normalizeGstin(party.gst)}`;
    if (!party.gst || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
