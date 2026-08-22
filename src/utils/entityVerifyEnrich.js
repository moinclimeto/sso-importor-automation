function normalizeGst(gst) {
  return String(gst || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

function counterpartyGst(data, decided) {
  if (decided === 'sale') {
    return normalizeGst(data.customer_gstin || data.buyer_gst);
  }
  return normalizeGst(
    data.supplier_gst_number || data.vendor_gstin || data.seller_gst,
  );
}

function mergeEntityIntoData(data, entity, decided) {
  if (!entity) return data;
  const next = { ...data };
  const trusted = [
    'supplier_master',
    'climeto_api',
    'climeto_master_data',
    'climeto_gst',
  ].includes(entity.source);

  const setField = (key, value) => {
    if (value == null || value === '') return;
    if (!next[key] || trusted) next[key] = value;
  };

  setField('registration_type', entity.registration_type);
  if (entity.entity_type) setField('entity_type', entity.entity_type);
  else if (entity.registration_type === 'Unregistered' && trusted) next.entity_type = '';

  const displayName = entity.trade_name || entity.legal_name || '';

  if (decided === 'purchase') {
    setField('supplier_name', displayName);
    setField('vendor_name', displayName);
    setField('address_line_1', entity.address);
    setField('supplier_mobile_number', entity.mobile);
    setField('supplier_gst_number', entity.gst);
    setField('vendor_gstin', entity.gst);
    if (entity.registration_type === 'Registered') next.is_supplier_gst_available = true;
    else if (entity.registration_type === 'Unregistered') next.is_supplier_gst_available = false;
  } else if (decided === 'sale') {
    setField('entity_name', displayName);
    setField('customer_name', displayName);
    setField('address', entity.address);
    setField('mobile_number', entity.mobile);
    setField('customer_gstin', entity.gst);
  }

  next._entity_verify = {
    gst: entity.gst,
    source: entity.source,
    registration_type: entity.registration_type,
    entity_type: entity.entity_type,
    legal_name: entity.legal_name || '',
    trade_name: entity.trade_name || '',
    gst_status: entity.gst_status || null,
    verified_at: new Date().toISOString(),
  };

  return next;
}

export async function enrichRoutedResultsWithEntityVerify(routed = []) {
  if (!window.pwp?.entityVerify?.lookupByGst) return routed;

  const cache = new Map();
  const out = [];

  for (const row of routed) {
    if (!row?.ok || row.skipped || row.rejected) {
      out.push(row);
      continue;
    }

    const decided = row.routing?.decidedType || row.data?.decidedType;
    if (decided !== 'purchase' && decided !== 'sale') {
      out.push(row);
      continue;
    }

    const data = row.data || {};
    const gst = counterpartyGst(data, decided);
    if (gst.length !== 15) {
      out.push(row);
      continue;
    }

    const companyId = row.routing?.companyId || data.company_id || null;
    const cacheKey = `${companyId || 'all'}:${gst}`;

    try {
      let cached = cache.get(cacheKey);
      if (!cached) {
        const res = await window.pwp.entityVerify.lookupByGst({ gst, companyId });
        cached = {
          entity: res?.bestEntity || res?.gstProfile || null,
          piboWarning: res?.piboWarning || null,
          fromSupplierMaster: res?.fromSupplierMaster || false,
        };
        cache.set(cacheKey, cached);
      }

      if (!cached.entity) {
        out.push(row);
        continue;
      }

      out.push({
        ...row,
        data: mergeEntityIntoData(data, cached.entity, decided),
        entityVerified: true,
        piboWarning: cached.piboWarning,
      });
    } catch {
      out.push(row);
    }
  }

  return out;
}

export function entityVerifyLabel(data) {
  const verify = data?._entity_verify;
  if (!verify?.gst) return '';
  return `GST verified · ${verify.registration_type || '—'} · ${verify.entity_type || '—'}`;
}
