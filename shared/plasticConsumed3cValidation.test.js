import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plasticConsumedYearHasData,
  plasticConsumedYearTotal,
  validatePlasticConsumed3cForPortal,
} from './plasticConsumed3cValidation.js';
import { getCpcbPortalPartA3cYears } from './financialYearScope.js';

test('plasticConsumedYearTotal sums positive category values', () => {
  assert.equal(
    plasticConsumedYearTotal({ cat1: '0.65', cat2: '0', cat3: '0', cat4: '0' }),
    0.65,
  );
  assert.equal(plasticConsumedYearHasData({ cat1: '0', cat2: '0', cat3: '0', cat4: '0' }), false);
});

test('validatePlasticConsumed3cForPortal skips current FY commencement', () => {
  const issues = validatePlasticConsumed3cForPortal({
    plasticConsumed: { '2024-25': { cat1: '0', cat2: '0', cat3: '0', cat4: '0' } },
    yearOfCommencement: String(new Date().getFullYear()),
    reportingYears: ['2024-25', '2025-26'],
  });
  assert.equal(issues.length, 0);
});

test('validatePlasticConsumed3cForPortal flags zero rows for old commencement', () => {
  const issues = validatePlasticConsumed3cForPortal({
    plasticConsumed: {
      '2024-25': { cat1: '0', cat2: '0', cat3: '0', cat4: '0' },
      '2025-26': { cat1: '0.65', cat2: '0', cat3: '0', cat4: '0' },
    },
    yearOfCommencement: '2010',
    reportingYears: ['2024-25', '2025-26'],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].year, '2024-25');
  assert.match(issues[0].message, /cannot be zero/i);
});

test('getCpcbPortalPartA3cYears matches CPCB portal grid rows', () => {
  const portalYears = getCpcbPortalPartA3cYears(new Date('2026-08-31'));
  assert.deepEqual(portalYears, ['2024-25', '2025-26']);
});

test('validatePlasticConsumed3cForPortal passes when all reporting years have data', () => {
  const issues = validatePlasticConsumed3cForPortal({
    plasticConsumed: {
      '2024-25': { cat1: '1', cat2: '0', cat3: '0', cat4: '0' },
      '2025-26': { cat1: '0.65', cat2: '0', cat3: '0', cat4: '0' },
    },
    yearOfCommencement: '2010',
    reportingYears: ['2024-25', '2025-26'],
  });
  assert.equal(issues.length, 0);
});
