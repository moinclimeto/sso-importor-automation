/** Fill CPCB Part A section 3c ag-Grid from plasticConsumed data. */

import {
  alignPlasticConsumedToYears,
  mergePlasticConsumedYearSets,
} from '../../shared/plasticConsumed3c.js';
import { getCpcbPortalPartA3cYears } from '../../shared/financialYearScope.js';

const COLUMN_MAP = [
  { key: 'cat1', colId: 'rigidPlastic' },
  { key: 'cat2', colId: 'flexiblePlastic' },
  { key: 'cat3', colId: 'mlp' },
  { key: 'cat4', colId: 'compostablePlastic' },
];

const FY_PATTERN = /\d{4}-\d{2}/;

function plasticConsumedGrid(page) {
  return page.locator('app-ag-grid-table').filter({ hasText: /Rigid Plastic/i }).first();
}

async function fillPlasticConsumedCell(page, cellLoc, inputLoc, value) {
  const strVal = String(value ?? '0');
  await inputLoc.scrollIntoViewIfNeeded().catch(() => {});
  await inputLoc.click({ timeout: 1500 }).catch(() => {});
  await inputLoc.fill('').catch(() => {});
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await inputLoc.pressSequentially(strVal, { delay: 25 }).catch(() => inputLoc.fill(strVal).catch(() => {}));
  await inputLoc.dispatchEvent('input').catch(() => {});
  await inputLoc.dispatchEvent('change').catch(() => {});
  await page.keyboard.press('Enter').catch(() => {});
  await page.keyboard.press('Tab').catch(() => {});
  await page.waitForTimeout(150);

  const textRead = (await cellLoc.innerText().catch(() => '')).trim();
  if (textRead.includes(strVal)) {
    return true;
  }

  // Fallback: If cell text does not reflect value yet and input is still in DOM, force JS value dispatch
  const isInputAttached = await inputLoc.isVisible({ timeout: 200 }).catch(() => false);
  if (isInputAttached) {
    await page.evaluate(({ inputEl, v }) => {
      if (inputEl) {
        inputEl.focus();
        inputEl.value = v;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.blur();
      }
    }, { inputEl: await inputLoc.elementHandle().catch(() => null), v: strVal }).catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(100);
  }
  return true;
}

/** Read FY labels currently rendered in the portal 3c grid. */
export async function readPlasticConsumedGridYears(page, onLog) {
  try {
    const gridContainer = plasticConsumedGrid(page);
    await gridContainer.waitFor({ state: 'visible', timeout: 5000 });

    const rowLocators = gridContainer.locator('div[role="row"]');
    const count = await rowLocators.count().catch(() => 0);
    const years = [];

    for (let i = 0; i < count; i += 1) {
      const text = await rowLocators.nth(i).innerText().catch(() => '');
      const match = text.match(FY_PATTERN);
      if (match && !years.includes(match[0])) {
        years.push(match[0]);
      }
    }

    years.sort((a, b) => b.localeCompare(a));
    if (onLog && years.length) onLog(`Portal 3c grid years: ${years.join(', ')}`);
    return years;
  } catch (err) {
    if (onLog) onLog(`Could not read portal 3c years: ${err.message}`);
    return [];
  }
}

async function findGridRowForYear(gridContainer, year) {
  const selectors = [
    'div.ag-center-cols-container div[role="row"]',
    'div.ag-pinned-left-cols-container div[role="row"]',
    'div[role="row"]',
  ];

  for (const sel of selectors) {
    const rows = gridContainer.locator(sel);
    const count = await rows.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const candidate = rows.nth(i);
      const text = await candidate.innerText().catch(() => '');
      if (text.includes(year)) return candidate;
    }
  }

  return gridContainer.locator('div[role="row"]').filter({ hasText: year }).first();
}

export async function fillPlasticConsumedGrid(page, plasticConsumed = {}, years = [], onLog) {
  if (!plasticConsumed || !years.length) {
    if (onLog) onLog('No plasticConsumed data — skipping 3c grid fill');
    return false;
  }

  const aligned = alignPlasticConsumedToYears(plasticConsumed, years);
  if (onLog) onLog(`Filling 3c plastic consumed: ${JSON.stringify(aligned)}`);

  try {
    const gridContainer = plasticConsumedGrid(page);
    await gridContainer.waitFor({ state: 'visible', timeout: 5000 });

    let filledCells = 0;

    for (const year of years) {
      const row = await findGridRowForYear(gridContainer, year);

      if (!(await row.isVisible({ timeout: 2000 }).catch(() => false))) {
        if (onLog) onLog(`Warning: Row for year ${year} not found in ag-Grid.`);
        continue;
      }

      for (const col of COLUMN_MAP) {
        const val = aligned?.[year]?.[col.key] ?? '0';
        const cellLoc = row.locator(`div[col-id="${col.colId}"]`).first();

        if (await cellLoc.isVisible({ timeout: 2000 }).catch(() => false)) {
          let inputLoc = cellLoc.locator('input').first();
          let inputFound = await inputLoc.isVisible({ timeout: 300 }).catch(() => false);

          if (!inputFound) {
            // AG-Grid cells require click or double-click to enter inline editing mode
            await cellLoc.click({ force: true }).catch(() => {});
            await page.waitForTimeout(100);
            await cellLoc.dblclick({ force: true }).catch(() => {});
            await page.waitForTimeout(200);

            inputLoc = cellLoc.locator('input').first();
            inputFound = await inputLoc.isVisible({ timeout: 600 }).catch(() => false);
          }

          if (!inputFound) {
            // Fallback: active input at row level or ag-grid container level
            inputLoc = row.locator('input.cell-input, input.ag-input-field-input, input').first();
            inputFound = await inputLoc.isVisible({ timeout: 600 }).catch(() => false);
          }

          if (!inputFound) {
            // Fallback: active input anywhere in page editor overlay
            inputLoc = page.locator('div.ag-cell-inline-editing input, div.ag-popup-editor input').first();
            inputFound = await inputLoc.isVisible({ timeout: 600 }).catch(() => false);
          }

          if (inputFound) {
            await fillPlasticConsumedCell(page, cellLoc, inputLoc, val);
            filledCells += 1;
            if (onLog) onLog(`3c ${year} ${col.colId} = ${val}`);
          } else if (onLog) {
            onLog(`Warning: Input for ${year} column ${col.colId} not found.`);
          }
        } else if (onLog) {
          onLog(`Warning: Cell for ${year} column ${col.colId} not found.`);
        }
      }
    }

    return filledCells > 0;
  } catch (err) {
    if (onLog) onLog(`Error filling Plastic Consumed ag-Grid: ${err.message}`);
    return false;
  }
}

export function resolvePlasticConsumedYears(plasticConsumed = {}) {
  const keys = Object.keys(plasticConsumed || {}).filter(Boolean);
  return keys.sort((a, b) => b.localeCompare(a));
}

/** Prefer portal-visible FY rows; fall back to saved data / importer reporting FYs. */
export async function resolvePlasticConsumedYearsForPortal(page, plasticConsumed = {}, onLog) {
  const portalYears = await readPlasticConsumedGridYears(page, onLog);
  const reportingYears = getCpcbPortalPartA3cYears();
  const merged = portalYears.length
    ? mergePlasticConsumedYearSets(portalYears, reportingYears)
    : reportingYears;
  if (onLog) onLog(`3c fill target years: ${merged.join(', ')}`);
  return merged;
}
