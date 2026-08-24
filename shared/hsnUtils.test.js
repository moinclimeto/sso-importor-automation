import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHsnFromText,
  resolveReviewLineHsn,
  splitHsnFromDescription,
} from './hsnUtils.js';

test('extractHsnFromText parses HSN CODE suffix', () => {
  assert.equal(extractHsnFromText('PVC Cling Film HSN CODE-39204300'), '39204300');
});

test('splitHsnFromDescription separates HSN from product label', () => {
  const split = splitHsnFromDescription('PVC Cling Film HSN CODE-39204300');
  assert.equal(split.hsn, '39204300');
  assert.equal(split.description, 'PVC Cling Film');
});

test('resolveReviewLineHsn uses OCR extraction line text', () => {
  const hsn = resolveReviewLineHsn(
    { productDescription: 'PVC Cling Film', hsn: '' },
    { d: 'PVC Cling Film HSN CODE-39204300', h: '' },
    { item_name: 'PVC Cling Film' },
    0,
  );
  assert.equal(hsn, '39204300');
});
