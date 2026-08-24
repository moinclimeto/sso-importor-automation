import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlasticConsumed3cForReports } from './plasticConsumed3cReports.js';

const FY = '2025-26';

test('3c reports uses sales packaging MT when no procurement or import pool', () => {
  const result = buildPlasticConsumed3cForReports({
    purchases: [],
    sales: [
      {
        company_id: 1,
        doc_status: 'published',
        financial_year: FY,
        invoice_date: '2025-07-01',
        category_of_plastic: 'Cat-I',
        quantity_sold_mt: 0.4,
        line_items: [
          {
            productDescription: 'PVC CLING FILM',
            quantity: '200',
            unit: 'Box',
            plasticCategory: 'Cat-I',
            conversionFactorApplied: '2',
            quantityDerivationType: 'conversion_factor',
          },
        ],
      },
    ],
    packagingRows: [
      {
        company_id: 1,
        list_type: 'sales',
        plastic_category: 'Cat-I',
        conversion_factor: 2,
        is_active: 1,
        product_match_key: 'pvc cling film::39204300',
      },
    ],
    docStatus: 'published',
    financialYear: 'all',
    companyId: 1,
  });

  assert.equal(result.source, 'sales_packaging');
  assert.ok(Number(result.plasticConsumed[FY]?.cat1) > 0);
});

test('3c reports prefers importer 3a when import-sale matches exist', () => {
  const result = buildPlasticConsumed3cForReports({
    purchases: [
      {
        company_id: 1,
        doc_status: 'published',
        procurement_source: 'import',
        financial_year: FY,
        invoice_date: '2025-06-01',
        line_items: [{ productDescription: 'Widget A', hsn: '3923', quantity: '10000', unit: 'Nos' }],
      },
    ],
    sales: [
      {
        company_id: 1,
        doc_status: 'published',
        financial_year: FY,
        invoice_date: '2025-07-01',
        line_items: [{
          productDescription: 'Widget A',
          hsn: '3923',
          quantity: '4000',
          unit: 'Nos',
          plasticCategory: 'Cat-II',
          conversionFactorApplied: '0.05',
          quantityDerivationType: 'conversion_factor',
        }],
      },
    ],
    packagingRows: [{
      company_id: 1,
      list_type: 'sales',
      plastic_category: 'Cat-II',
      conversion_factor: 0.05,
      product_match_key: 'widget a::3923',
      is_active: 1,
    }],
    docStatus: 'published',
    companyId: 1,
  });

  assert.equal(result.source, 'importer_3a');
  assert.ok(Number(result.plasticConsumed[FY]?.cat2) > 0);
});
