import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizePlasticMaterial,
  sanitizePlasticCategory,
  normalizePackagingMasterRecord,
  packagingMasterCompleteness,
  extractHsnFromText,
} from './packagingMasterSync.js';

test('sanitizePlasticMaterial removes OCR garbage', () => {
  const raw =
    "Cat-II (CROSS MEMBER COMPL LWR WINDSH Customer's materials: A2476200500 Customs tariff num";
  assert.equal(sanitizePlasticMaterial(raw), '');
});

test('sanitizePlasticMaterial keeps PVC from noisy text', () => {
  const raw = "PVC CLING FILM Customer's materials: 39204300";
  assert.equal(sanitizePlasticMaterial(raw), 'PVC');
});

test('sanitizePlasticCategory keeps valid categories only', () => {
  assert.equal(sanitizePlasticCategory('Cat-II'), 'Cat-II');
  assert.equal(sanitizePlasticCategory('garbage'), '');
});

test('extractHsnFromText finds HSN in description', () => {
  assert.equal(extractHsnFromText('PVC Cling Film HSN 39204300'), '39204300');
  assert.equal(extractHsnFromText('PVC Cling Film HSN CODE-39204300'), '39204300');
});

test('normalizePackagingMasterRecord builds match key', () => {
  const row = normalizePackagingMasterRecord({
    product_description: 'Widget 500ml',
    hsn: '3923',
    plastic_category: 'Cat-II',
    plastic_material: 'PVC',
    conversion_factor: 0.05,
    uom: 'Nos',
  });
  assert.equal(row.product_match_key, 'widget 500ml::3923');
  assert.equal(row.plastic_category, 'Cat-II');
});

test('packagingMasterCompleteness flags missing CF', () => {
  const check = packagingMasterCompleteness({
    plastic_category: 'Cat-II',
    hsn: '3923',
    conversion_factor: null,
  });
  assert.equal(check.ok, false);
  assert.ok(check.missing.includes('cf'));
});
