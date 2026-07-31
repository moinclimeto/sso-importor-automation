/**
 * Match OCR invoice parties against Company Profile (GST / PAN / name).
 * Same idea as my-dashboard:
 * - Our company as buyer  → purchase
 * - Our company as seller → sale
 * - No match              → reject
 */

export function normalizeGst(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 15);
}

export function normalizePan(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

export function panFromGst(gstin) {
  const g = normalizeGst(gstin);
  if (g.length !== 15) return '';
  return g.slice(2, 12);
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|llp|opc|company|co)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namesLikelyMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' ').filter((t) => t.length > 2));
  const tb = new Set(nb.split(' ').filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return false;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  const score = hit / Math.min(ta.size, tb.size);
  return score >= 0.7;
}

function companyPan(company) {
  return normalizePan(company?.pan) || panFromGst(company?.gstin);
}

/**
 * Pick seller/buyer GST + names from OCR/QR row.
 */
export function extractInvoiceParties(row = {}) {
  const data = row.data || row;
  const qr = data._qr || data.extraction?._qr || data.qr || {};
  const extraction = data.extraction || {};

  let sellerGst = normalizeGst(
    qr.SellerGstin ||
      qr.sellerGstin ||
      data.seller_gst ||
      data.sellerGst ||
      extraction.sellerGst ||
      extraction.SellerGstin
  );
  let buyerGst = normalizeGst(
    qr.BuyerGstin ||
      qr.buyerGstin ||
      data.buyer_gst ||
      data.buyerGst ||
      extraction.buyerGst ||
      extraction.BuyerGstin
  );

  let sellerName = String(
    data.seller_name ||
      data.sellerName ||
      extraction.sellerName ||
      qr.SellerNm ||
      qr.SellerName ||
      ''
  ).trim();
  let buyerName = String(
    data.buyer_name ||
      data.buyerName ||
      extraction.buyerName ||
      qr.BuyerNm ||
      qr.BuyerName ||
      ''
  ).trim();

  // Fallback from mapped EPR fields (purchase = seller counterparty, sale = buyer)
  const recordType = String(data.record_type || '').toLowerCase();
  if (!sellerGst && (recordType.includes('purchase') || data.supplier_gst_number || data.vendor_gstin)) {
    sellerGst = normalizeGst(data.supplier_gst_number || data.vendor_gstin);
  }
  if (!buyerGst && (recordType.includes('sale') || data.customer_gstin || data.buyer_gst)) {
    buyerGst = normalizeGst(data.customer_gstin || data.buyer_gst);
  }
  if (!sellerName && (data.supplier_name || data.vendor_name)) {
    sellerName = String(data.supplier_name || data.vendor_name).trim();
  }
  if (!buyerName && (data.entity_name || data.customer_name)) {
    buyerName = String(data.entity_name || data.customer_name).trim();
  }

  return {
    sellerGst,
    buyerGst,
    sellerName,
    buyerName,
    onlyOneGst: Boolean((sellerGst && !buyerGst) || (!sellerGst && buyerGst)),
  };
}

function matchCompanyByGstOrPan(companies, gst) {
  const g = normalizeGst(gst);
  if (!g) return null;
  const pan = panFromGst(g);
  return (
    companies.find((c) => normalizeGst(c.gstin) === g) ||
    (pan
      ? companies.find((c) => companyPan(c) === pan || panFromGst(c.gstin) === pan)
      : null) ||
    null
  );
}

function matchCompanyByName(companies, name) {
  if (!name) return null;
  return companies.find((c) => namesLikelyMatch(c.name, name)) || null;
}

/**
 * @returns {{
 *   decidedType: 'purchase'|'sale'|null,
 *   rejected: boolean,
 *   reason: string,
 *   zone: 'buyer'|'seller'|'',
 *   company: object|null,
 *   parties: object,
 * }}
 */
export function matchInvoiceToCompanies(row, companies = []) {
  const list = Array.isArray(companies) ? companies.filter(Boolean) : [];
  const parties = extractInvoiceParties(row);

  if (!list.length) {
    return {
      decidedType: null,
      rejected: true,
      reason: 'No company in Company Profile. Add GST / name first.',
      zone: '',
      company: null,
      parties,
    };
  }

  const buyerHit = matchCompanyByGstOrPan(list, parties.buyerGst);
  const sellerHit = matchCompanyByGstOrPan(list, parties.sellerGst);

  if (buyerHit && sellerHit && buyerHit.id === sellerHit.id) {
    return {
      decidedType: null,
      rejected: true,
      reason: 'Buyer and seller GST both match the same company profile (invalid invoice parties).',
      zone: '',
      company: buyerHit,
      parties,
    };
  }

  if (buyerHit) {
    return {
      decidedType: 'purchase',
      rejected: false,
      reason: `Matched company as buyer (GST ${parties.buyerGst || companyPan(buyerHit)}) → Procurement`,
      zone: 'buyer',
      company: buyerHit,
      parties,
    };
  }

  if (sellerHit) {
    return {
      decidedType: 'sale',
      rejected: false,
      reason: `Matched company as seller (GST ${parties.sellerGst || companyPan(sellerHit)}) → Post Consumer`,
      zone: 'seller',
      company: sellerHit,
      parties,
    };
  }

  // Name fallback when GST missing on one side
  const buyerNameHit = !parties.buyerGst
    ? matchCompanyByName(list, parties.buyerName)
    : null;
  const sellerNameHit = !parties.sellerGst
    ? matchCompanyByName(list, parties.sellerName)
    : null;

  if (buyerNameHit && !sellerNameHit) {
    return {
      decidedType: 'purchase',
      rejected: false,
      reason: `Matched company name as buyer ("${buyerNameHit.name}") → Procurement`,
      zone: 'buyer',
      company: buyerNameHit,
      parties,
    };
  }

  if (sellerNameHit && !buyerNameHit) {
    return {
      decidedType: 'sale',
      rejected: false,
      reason: `Matched company name as seller ("${sellerNameHit.name}") → Post Consumer`,
      zone: 'seller',
      company: sellerNameHit,
      parties,
    };
  }

  // Own GST appeared only as counterparty field wrongly — still no role → reject
  return {
    decidedType: null,
    rejected: true,
    reason:
      'Invoice GST/name did not match any Company Profile. Add the company or reject this invoice.',
    zone: '',
    company: null,
    parties,
  };
}

export function applyCompanyRoutingToResults(results = [], companies = []) {
  return (results || []).map((r) => {
    if (!r?.ok || r.skipped) return r;
    const match = matchInvoiceToCompanies(r, companies);
    const data = {
      ...(r.data || {}),
      company_id: match.company?.id ?? null,
      company_name: match.company?.name || '',
      buyer_gst:
        match.zone === 'buyer'
          ? normalizeGst(match.company?.gstin) || match.parties.buyerGst
          : match.parties.buyerGst,
      _parties: match.parties,
      _routing: {
        decidedType: match.decidedType,
        rejected: match.rejected,
        reason: match.reason,
        zone: match.zone,
        companyId: match.company?.id ?? null,
        companyName: match.company?.name || '',
      },
    };

    if (match.decidedType === 'purchase') {
      data.record_type = 'purchase_epr';
      if (match.company?.gstin) data.buyer_gst = normalizeGst(match.company.gstin);
    } else if (match.decidedType === 'sale') {
      data.record_type = 'sale_epr';
    }

    return {
      ...r,
      data,
      routing: data._routing,
      rejected: match.rejected,
      decidedType: match.decidedType,
    };
  });
}
