import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prunePartBSection4ForPortal,
  remapLegacyPartBSection4Years,
  emptyPartBSection4Categories,
} from './partBSection4.js';

const asOf = new Date('2026-08-31');
const states = ['Madhya Pradesh'];

function groupWithPostConsumer(year, postConsumer) {
  const categories = emptyPartBSection4Categories();
  categories[0].postConsumer = String(postConsumer);
  return { state: 'Madhya Pradesh', year, categories };
}

test('prunePartBSection4ForPortal uses 2024-25 and 2025-26', () => {
  const pruned = prunePartBSection4ForPortal(
    [groupWithPostConsumer('2025-26', 5), groupWithPostConsumer('2026-27', 6)],
    states,
    asOf,
  );
  assert.deepEqual(pruned.map((g) => g.year), ['2024-25', '2025-26']);
  assert.equal(pruned.find((g) => g.year === '2024-25').categories[0].postConsumer, '6');
  assert.equal(pruned.find((g) => g.year === '2025-26').categories[0].postConsumer, '5');
});

test('remapLegacyPartBSection4Years keeps existing 2024-25 data', () => {
  const remapped = remapLegacyPartBSection4Years(
    [groupWithPostConsumer('2024-25', 9), groupWithPostConsumer('2026-27', 6)],
    asOf,
  );
  assert.equal(remapped.find((g) => g.year === '2024-25').categories[0].postConsumer, '9');
  assert.equal(remapped.find((g) => g.year === '2026-27').categories[0].postConsumer, '6');
});
