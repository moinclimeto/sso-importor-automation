/** Indian GST state codes → name (+ CPCB-style label e.g. "30 - Goa GA"). */

export const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

export const GST_STATE_ABBR = {
  '01': 'JK',
  '02': 'HP',
  '03': 'PB',
  '04': 'CH',
  '05': 'UA',
  '06': 'HR',
  '07': 'DL',
  '08': 'RJ',
  '09': 'UP',
  '10': 'BR',
  '11': 'SK',
  '12': 'AR',
  '13': 'NL',
  '14': 'MN',
  '15': 'MZ',
  '16': 'TR',
  '17': 'ML',
  '18': 'AS',
  '19': 'WB',
  '20': 'JH',
  '21': 'OD',
  '22': 'CG',
  '23': 'MP',
  '24': 'GJ',
  '25': 'DD',
  '26': 'DN',
  '27': 'MH',
  '28': 'AP',
  '29': 'KA',
  '30': 'GA',
  '31': 'LD',
  '32': 'KL',
  '33': 'TN',
  '34': 'PY',
  '35': 'AN',
  '36': 'TS',
  '37': 'AP',
  '38': 'LA',
};

export function getStateFromGst(gstNumber) {
  const gst = String(gstNumber ?? '').trim().toUpperCase();
  if (gst.length < 2) return '';
  return GST_STATE_CODES[gst.substring(0, 2)] || '';
}

export function formatGstStateLabel(gstNumber) {
  const gst = String(gstNumber ?? '').trim().toUpperCase();
  if (gst.length < 2) return '';
  const code = gst.substring(0, 2);
  const name = GST_STATE_CODES[code];
  if (!name) return '';
  const abbr = GST_STATE_ABBR[code];
  return abbr ? `${code} - ${name} ${abbr}` : `${code} - ${name}`;
}

/** Prefer OCR-extracted state; fall back to GSTIN state code. */
export function resolveState(extractedState, gstNumber) {
  const fromExtract = String(extractedState ?? '').trim();
  if (fromExtract && fromExtract !== '-' && fromExtract.toLowerCase() !== 'null') {
    return fromExtract;
  }
  const label = formatGstStateLabel(gstNumber);
  if (label) return label;
  return getStateFromGst(gstNumber);
}
