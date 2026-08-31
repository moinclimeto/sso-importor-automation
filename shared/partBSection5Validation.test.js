import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignSec5bRowsToPlasticConsumed,
  prepareSec5bForPortal,
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
