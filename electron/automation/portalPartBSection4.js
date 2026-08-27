/** Fill CPCB Part B section 4 table from prepared state-wise groups. */

import {
  normalizeOperatingStateKey,
  PART_B_SECTION4_CATEGORY_LABELS,
} from '../../shared/partBSection4.js';

const CATEGORY_PATTERNS = [
  /Rigid Plastic/i,
  /Flexible Plastic/i,
  /\bMLP\b/i,
  /Compostable Plastic/i,
];

async function fillQuantityInput(input, value, page) {
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click({ timeout: 2500 });
  await input.fill('');
  await input.pressSequentially(String(value ?? '0'), { delay: 25 });
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await input.blur();
  await page.waitForTimeout(150);
}

function normalizeStateLabel(state = '') {
  return normalizeOperatingStateKey(state);
}

async function fillSection4HtmlTable(page, table, groups, onLog) {
  const tbody = table.locator('tbody').first();
  const rowCount = await tbody.locator('tr').count().catch(() => 0);
  if (!rowCount) return 0;

  let carryState = '';
  let carryYear = '';
  let filled = 0;

  for (let i = 0; i < rowCount; i += 1) {
    const row = tbody.locator('tr').nth(i);
    const cells = row.locator('td');
    const cellCount = await cells.count().catch(() => 0);
    const texts = [];
    for (let c = 0; c < cellCount; c += 1) {
      texts.push(((await cells.nth(c).innerText().catch(() => '')) || '').trim());
    }
    const rowText = texts.join(' ');

    for (const t of texts) {
      if (/^\d{4}-\d{2}$/.test(t)) carryYear = t;
    }
    for (const t of texts) {
      if (
        t.length > 2
        && !/^\d+$/.test(t)
        && !/^\d{4}-\d{2}$/.test(t)
        && !/Plastic|Cat-|MLP|Compostable|Rigid|Flexible/i.test(t)
      ) {
        carryState = t;
      }
    }

    let catIndex = -1;
    for (let ci = 0; ci < CATEGORY_PATTERNS.length; ci += 1) {
      if (CATEGORY_PATTERNS[ci].test(rowText)) {
        catIndex = ci;
        break;
      }
    }
    if (catIndex < 0 || !carryYear) continue;

    const group = (groups || []).find((g) => {
      const stateMatch = !carryState
        || normalizeStateLabel(g.state) === normalizeStateLabel(carryState)
        || rowText.toLowerCase().includes(String(g.state || '').toLowerCase());
      return stateMatch && String(g.year) === String(carryYear);
    });
    const cat = group?.categories?.[catIndex];
    if (!cat) {
      if (onLog) onLog(`Section 4 row ${carryYear}/${PART_B_SECTION4_CATEGORY_LABELS[catIndex]} — no prepared data.`);
      continue;
    }

    const inputs = row.locator('input.cell-input, input[type="number"]');
    const inputCount = await inputs.count().catch(() => 0);
    if (inputCount < 3) continue;

    await fillQuantityInput(inputs.nth(0), cat.preConsumer ?? '0', page);
    await fillQuantityInput(inputs.nth(1), cat.postConsumer ?? '0', page);
    await fillQuantityInput(inputs.nth(2), cat.exportQuantity ?? '0', page);
    filled += 3;
    if (onLog) {
      onLog(
        `Section 4 ${carryState || group.state} ${carryYear} ${PART_B_SECTION4_CATEGORY_LABELS[catIndex]}: `
        + `pre=${cat.preConsumer ?? '0'}, post=${cat.postConsumer ?? '0'}, export=${cat.exportQuantity ?? '0'}`,
      );
    }
  }

  return filled;
}

async function fillSection4ByGroupFilters(page, table, groups, onLog) {
  let filled = 0;
  for (const group of groups || []) {
    for (let catIndex = 0; catIndex < CATEGORY_PATTERNS.length; catIndex += 1) {
      const cat = group.categories?.[catIndex];
      if (!cat) continue;

      let row = table.locator('tbody tr')
        .filter({ hasText: group.year })
        .filter({ hasText: CATEGORY_PATTERNS[catIndex] });
      if (group.state) {
        const stateRow = row.filter({ hasText: new RegExp(group.state.replace(/[()]/g, ''), 'i') });
        if (await stateRow.count().catch(() => 0)) row = stateRow;
      }

      const target = row.first();
      if (!(await target.isVisible({ timeout: 1200 }).catch(() => false))) continue;

      const inputs = target.locator('input.cell-input, input[type="number"]');
      if ((await inputs.count().catch(() => 0)) < 3) continue;

      await fillQuantityInput(inputs.nth(0), cat.preConsumer ?? '0', page);
      await fillQuantityInput(inputs.nth(1), cat.postConsumer ?? '0', page);
      await fillQuantityInput(inputs.nth(2), cat.exportQuantity ?? '0', page);
      filled += 3;
    }
  }
  if (filled && onLog) onLog(`Part B Section 4: filled ${filled} cell(s) via row filters.`);
  return filled;
}

export async function fillPartBSection4Grid(page, section4Groups = [], onLog) {
  const groups = Array.isArray(section4Groups) ? section4Groups : [];
  const heading = page.getByText(/State-wise, Category-wise Quantity of PW generated|Pre Consumer Waste/i).first();

  if (!(await heading.isVisible({ timeout: 8000 }).catch(() => false))) {
    if (onLog) onLog('Part B Section 4 heading not found.');
    return false;
  }

  await heading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  const table = heading.locator('xpath=following::table[1]').first();
  if (await table.isVisible({ timeout: 4000 }).catch(() => false)) {
    let filled = await fillSection4HtmlTable(page, table, groups, onLog);
    if (!filled) filled = await fillSection4ByGroupFilters(page, table, groups, onLog);
    if (filled > 0) {
      if (onLog) onLog(`Part B Section 4 table fill complete (${filled} cells).`);
      return true;
    }
  }

  const scope = heading.locator('xpath=ancestor::div[contains(@class,"section") or contains(@class,"card") or contains(@class,"form")][1]').first();
  const scopedTable = scope.locator('table').first();
  if (await scopedTable.isVisible({ timeout: 2000 }).catch(() => false)) {
    const filled = await fillSection4HtmlTable(page, scopedTable, groups, onLog)
      || await fillSection4ByGroupFilters(page, scopedTable, groups, onLog);
    if (filled > 0) return true;
  }

  if (onLog) onLog('Part B Section 4 table rows not matched — trying sequential inputs in section scope.');
  const values = [];
  for (const group of groups) {
    for (const cat of group.categories || []) {
      values.push(String(cat.preConsumer ?? '0'), String(cat.postConsumer ?? '0'), String(cat.exportQuantity ?? '0'));
    }
  }
  if (!values.length) return false;

  const inputs = scope.locator('input.cell-input, input[type="number"]');
  const inputCount = await inputs.count().catch(() => 0);
  for (let i = 0; i < inputCount; i += 1) {
    const val = values[i] ?? '0';
    const input = inputs.nth(i);
    try {
      if (!(await input.isVisible().catch(() => false))) continue;
      if (await input.isDisabled().catch(() => false)) continue;
      await fillQuantityInput(input, val, page);
    } catch {
      /* skip */
    }
  }
  return true;
}
