export function resolveCompanyIdFromGstin(companies = [], gstin = '') {
  const normalized = String(gstin || '').trim().toUpperCase();
  if (!normalized) return null;
  const match = companies.find((company) => {
    const value = String(company.gstin || company.gst || company.GSTIN || '').trim().toUpperCase();
    return value === normalized;
  });
  return match?.id ?? null;
}
