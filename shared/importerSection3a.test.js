import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImporter3aDraft,
  importer3aCanFinalize,
  finalizeImporter3a,
  packagingMtForAllocatedSale,
  resolveSaleLineDraftFor3a,
} from './importerSection3a.js';
import {
  filterImportPurchaseLines,
  collectUnclassifiedProcurementIssues,
} from './importerPurchaseSaleMatch.js';

const FY = '2025-26';

function purchaseRow(overrides = {}) {
  return {
    id: 1,
    doc_status: 'published',
    procurement_source: 'import',
    invoice_date: '2025-06-01',
    financial_year: FY,
    invoice_number: 'PI-001',
    country: 'China',
    line_items: [
      {
        productDescription: 'Widget A',
        hsn: '3923',
        quantity: '10000',
        unit: 'Nos',
      },
    ],
    ...overrides,
  };
}

function saleRow(overrides = {}) {
  return {
    id: 10,
    doc_status: 'published',
    invoice_date: '2025-07-01',
    financial_year: FY,
    invoice_no: 'SI-001',
    line_items: [
      {
        productDescription: 'Widget A',
        hsn: '3923',
        quantity: '4000',
        unit: 'Nos',
        plasticCategory: 'Cat-II',
        quantityDerivationType: 'conversion_factor',
        conversionFactor: '0.05',
        conversionFactorApplied: '0.05',
        cfBaseSource: 'quantity',
      },
    ],
    ...overrides,
  };
}

function masterRow(overrides = {}) {
  return {
    product_match_key: 'widget a::3923',
    list_type: 'sales',
    plastic_category: 'Cat-II',
    conversion_factor: 0.05,
    cf_base_source: 'quantity',
    uom: 'Nos',
    is_active: 1,
    ...overrides,
  };
}

test('no domestic sale → Finalize NIL allowed', () => {
  const draft = buildImporter3aDraft({
    purchases: [purchaseRow()],
    sales: [],
    reportingYears: [FY],
  });
  assert.equal(draft.status, 'nil');
  assert.equal(draft.stats.saleLineCount, 0);
  const check = importer3aCanFinalize(draft);
  assert.equal(check.ok, true);
  assert.equal(check.nil, true);
  const finalized = finalizeImporter3a(draft);
  assert.equal(finalized.success, true);
  assert.equal(finalized.data.status, 'nil');
});

test('all domestic sales matched → Finalize allowed', () => {
  const draft = buildImporter3aDraft({
    purchases: [purchaseRow()],
    sales: [saleRow()],
    reportingYears: [FY],
  });
  assert.equal(draft.unmatchedSales.length, 0);
  assert.equal(draft.detailRows.length, 1);
  const check = importer3aCanFinalize(draft);
  assert.equal(check.ok, true);
  assert.equal(finalizeImporter3a(draft).success, true);
});

test('some domestic sales unmatched → Finalize blocked', () => {
  const draft = buildImporter3aDraft({
    purchases: [purchaseRow()],
    sales: [
      saleRow(),
      saleRow({
        id: 11,
        invoice_no: 'SI-002',
        line_items: [
          {
            productDescription: 'Other Product',
            hsn: '9999',
            quantity: '100',
            unit: 'Nos',
            plasticCategory: 'Cat-II',
            quantityDerivationType: 'conversion_factor',
            conversionFactor: '0.05',
            conversionFactorApplied: '0.05',
          },
        ],
      }),
    ],
    reportingYears: [FY],
  });
  assert.ok(draft.unmatchedSales.length > 0);
  const check = importer3aCanFinalize(draft);
  assert.equal(check.ok, false);
  assert.match(check.reason, /could not be linked/i);
  assert.equal(finalizeImporter3a(draft).success, false);
});

test('foreign country purchase auto-detected as import → in import pool', () => {
  const importPurchase = purchaseRow({ procurement_source: '', country: 'China' });
  const importLines = filterImportPurchaseLines([importPurchase], [FY]);
  assert.equal(importLines.length, 1);
  const issues = collectUnclassifiedProcurementIssues([importPurchase], [FY]);
  assert.equal(issues.length, 0);
});

test('Indian GST purchase auto-detected as domestic → not in import pool', () => {
  const domesticPurchase = purchaseRow({
    procurement_source: '',
    country: '',
    supplier_gst_number: '06AAXFB4240J1Z7',
    state: 'Haryana',
    city: 'Faridabad',
  });
  const importLines = filterImportPurchaseLines([domesticPurchase], [FY]);
  assert.equal(importLines.length, 0);
});

test('explicit import procurement → included in import pool', () => {
  const lines = filterImportPurchaseLines([purchaseRow()], [FY]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 10000);
});

test('sale line has CF/category → use sale line values', () => {
  const raw = saleRow().line_items[0];
  const draft = resolveSaleLineDraftFor3a(raw, 0, [masterRow({ conversion_factor: 999 })]);
  assert.equal(draft.plasticCategory, 'Cat-II');
  assert.equal(String(draft.conversionFactorApplied), '0.05');
});

test('sale line missing CF/category + Packaging Master → use master', () => {
  const raw = {
    productDescription: 'Widget A',
    hsn: '3923',
    quantity: '4000',
    unit: 'Nos',
  };
  const draft = resolveSaleLineDraftFor3a(raw, 0, [masterRow()]);
  assert.equal(draft.plasticCategory, 'Cat-II');
  assert.equal(String(draft.conversionFactorApplied), '0.05');
  assert.equal(draft.quantityDerivationType, 'conversion_factor');
});

test('both sale line and master missing data → Finalize blocked', () => {
  const draft = buildImporter3aDraft({
    purchases: [purchaseRow()],
    sales: [
      saleRow({
        line_items: [
          {
            productDescription: 'Widget A',
            hsn: '3923',
            quantity: '4000',
            unit: 'Nos',
          },
        ],
      }),
    ],
    packagingRows: [],
    reportingYears: [FY],
  });
  assert.equal(draft.detailRows.length, 0);
  const check = importer3aCanFinalize(draft);
  assert.equal(check.ok, false);
});

test('4000 Nos × 0.05 kg/Nos → 0.20 MT', () => {
  const saleLine = {
    rawLine: saleRow().line_items[0],
    lineIndex: 0,
    quantity: 4000,
  };
  const { mt, error } = packagingMtForAllocatedSale(saleLine, 4000, []);
  assert.equal(error, null);
  assert.equal(mt, 0.2);
});

test('multiple sales → no double counting', () => {
  const draft = buildImporter3aDraft({
    purchases: [purchaseRow()],
    sales: [
      saleRow({
        line_items: [
          {
            ...saleRow().line_items[0],
            quantity: '2000',
          },
        ],
      }),
      saleRow({
        id: 11,
        invoice_no: 'SI-002',
        line_items: [
          {
            ...saleRow().line_items[0],
            quantity: '3000',
          },
        ],
      }),
      saleRow({
        id: 12,
        invoice_no: 'SI-003',
        line_items: [
          {
            ...saleRow().line_items[0],
            quantity: '1000',
          },
        ],
      }),
    ],
    reportingYears: [FY],
  });
  assert.equal(draft.detailRows.length, 3);
  const totalMt = draft.detailRows.reduce((sum, row) => sum + row.packagingMt, 0);
  assert.equal(Number(totalMt.toFixed(6)), 0.3);
  assert.equal(draft.summaryByFy[FY].cat2, '0.3');
});

test('auto-detected procurement source does not block finalize for classification', () => {
  const draft = buildImporter3aDraft({
    purchases: [purchaseRow({ procurement_source: '' })],
    sales: [saleRow()],
    reportingYears: [FY],
  });
  assert.equal(draft.stats.unclassifiedProcurementCount, 0);
});
