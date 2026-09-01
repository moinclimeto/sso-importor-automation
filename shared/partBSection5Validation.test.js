import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignSec5bRowsToPlasticConsumed,
  prepareSec5bForPortal,
  reconcileSec5bForAutomation,
  validateSection5bAgainstPlasticConsumed,
} from './partBSection5.js';

const years = ['2024-25', '2025-26'];
const plasticConsumed = {
  '2024-25': { cat1: '6', cat2: '4', cat3: '11', cat4: '9' },
  '2025-26': { cat1: '0.65', cat2: '5', cat3: '7', cat4: '8' },
};

test('alignSec5bRowsToPlasticConsumed scales existing 5b rows to Part A 3c', () => {
  const sec5b = [
    {
      financialYear: '2025-26',
      category: 'Flexible Plastic (Cat-II)',
      quantity: '1',
      entityName: 'Vendor A',
    },
    {
      financialYear: '2025-26',
      category: 'MLP (Cat-III)',
      quantity: '2',
      entityName: 'Vendor B',
    },
  ];
  const aligned = alignSec5bRowsToPlasticConsumed(sec5b, plasticConsumed, years);
  const prepared = prepareSec5bForPortal({
    plasticConsumed,
    sec5b,
    years,
  });
  const issues = validateSection5bAgainstPlasticConsumed(prepared, plasticConsumed, years);
  assert.equal(Number(aligned.find((r) => r.category.includes('Cat-II')).quantity), 5);
  assert.equal(Number(aligned.find((r) => r.category.includes('Cat-III')).quantity), 7);
  assert.equal(issues.filter((i) => i.year === '2025-26' && i.catKey === 'cat2').length, 0);
  assert.equal(issues.filter((i) => i.year === '2025-26' && i.catKey === 'cat3').length, 0);
});

test('reconcileSec5bForAutomation keeps manual rows without purchase sourceRecordId', () => {
  const existing = [
    {
      entityName: 'Manual Vendor',
      quantity: '3',
      category: 'Rigid Plastic (Cat-I)',
      financialYear: '2024-25',
      invoiceDoc: 'manual.pdf',
    },
    {
      entityName: 'BlueGram Distributors',
      quantity: '1',
      category: 'Flexible Plastic (Cat-II)',
      financialYear: '2025-26',
      sourceRecordId: 42,
      invoiceDoc: 'published.pdf',
    },
  ];
  const computed = [
    {
      entityName: 'BlueGram Distributors',
      quantity: '1',
      category: 'Flexible Plastic (Cat-II)',
      financialYear: '2025-26',
      sourceRecordId: 42,
      invoiceDoc: 'published.pdf',
    },
  ];

  const merged = reconcileSec5bForAutomation(existing, computed);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((row) => row.entityName === 'Manual Vendor'));
  assert.ok(merged.some((row) => String(row.sourceRecordId) === '42'));
});

test('reconcileSec5bForAutomation keeps manual-only rows when computed is empty', () => {
  const existing = [
    {
      entityName: 'Manual Vendor',
      quantity: '3',
      category: 'Compostable Plastic (Cat-IV)',
      financialYear: '2024-25',
    },
  ];
  const merged = reconcileSec5bForAutomation(existing, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].entityName, 'Manual Vendor');
});
