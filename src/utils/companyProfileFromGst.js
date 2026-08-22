import { normalizeGst, panFromGst } from './companyInvoiceMatch.js';

export function verifiedPartyLabel(party) {
  const v = party?.verified;
  if (!v?.success && v?.success !== undefined) return party?.gst || '';
  const legal = v?.legalName || '';
  const trade = v?.tradeName || '';
  if (legal && trade && legal.toLowerCase() !== trade.toLowerCase()) {
    return `${trade} (${legal})`;
  }
  return trade || legal || party?.name || party?.gst || '';
}

export function buildCompanyProfileFromParty(party) {
  const v = party?.verified || {};
  const gstin = normalizeGst(v.gst || party?.gst);
  const tradeName = String(v.tradeName || party?.name || '').trim();
  const legalName = String(v.legalName || '').trim();
  const name = tradeName || legalName || gstin;
  return {
    name,
    gstin,
    pan: panFromGst(gstin) || String(v.pan || '').trim(),
    entity_type: v.entity_type || '',
    legal_name: legalName,
    trade_name: tradeName,
    address: v.address || '',
    registration_type: v.registration_type || '',
  };
}

export async function upsertCompanyFromParty(party, companies = []) {
  const profile = buildCompanyProfileFromParty(party);
  if (!profile.gstin || profile.gstin.length !== 15) {
    throw new Error('Selected party does not have a valid GST number.');
  }
  if (!profile.pan || profile.pan.length !== 10) {
    throw new Error('Could not derive PAN from GST number.');
  }

  const api = window.pwp?.companies;
  if (!api?.add || !api?.update) {
    throw new Error('Company profile API is not available.');
  }

  const existing = (companies || []).find(
    (c) => normalizeGst(c.gstin) === profile.gstin,
  );

  if (existing?.id) {
    await api.update({
      ...existing,
      name: profile.name,
      gstin: profile.gstin,
      pan: profile.pan,
      entity_type: profile.entity_type || existing.entity_type || '',
    });
    return { ...existing, ...profile, id: existing.id };
  }

  const created = await api.add({
    name: profile.name,
    gstin: profile.gstin,
    pan: profile.pan,
    entity_type: profile.entity_type || '',
  });
  return { ...created, ...profile };
}
