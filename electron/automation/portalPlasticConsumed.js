/** Fill CPCB Part A section 3c ag-Grid from plasticConsumed data. */

const COLUMN_MAP = [
  { key: 'cat1', colId: 'rigidPlastic' },
  { key: 'cat2', colId: 'flexiblePlastic' },
  { key: 'cat3', colId: 'mlp' },
  { key: 'cat4', colId: 'compostablePlastic' },
];

export async function fillPlasticConsumedGrid(page, plasticConsumed = {}, years = [], onLog) {
  if (!plasticConsumed || !years.length) {
    if (onLog) onLog('No plasticConsumed data — skipping 3c grid fill');
    return false;
  }

  if (onLog) onLog(`Filling 3c plastic consumed: ${JSON.stringify(plasticConsumed)}`);

  try {
    const gridContainer = page.locator('app-ag-grid-table').filter({ hasText: /Rigid Plastic/i }).first();
    await gridContainer.waitFor({ state: 'visible', timeout: 5000 });

    for (const year of years) {
      let row = gridContainer
        .locator('div.ag-center-cols-container div[role="row"]')
        .filter({ hasText: year })
        .first();

      if ((await row.count().catch(() => 0)) === 0) {
        const allRows = gridContainer.locator('div.ag-center-cols-container div[role="row"]');
        const count = await allRows.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          const candidate = allRows.nth(i);
          const text = await candidate.innerText().catch(() => '');
          if (text.includes(year)) {
            row = candidate;
            break;
          }
        }
      }

      if (!(await row.isVisible({ timeout: 2000 }).catch(() => false))) {
        if (onLog) onLog(`Warning: Row for year ${year} not found in ag-Grid.`);
        continue;
      }

      for (const col of COLUMN_MAP) {
        const val = plasticConsumed?.[year]?.[col.key] || '0';
        const inputLoc = row.locator(`div[col-id="${col.colId}"] input.cell-input`).first();

        if (await inputLoc.isVisible({ timeout: 2000 }).catch(() => false)) {
          await inputLoc.scrollIntoViewIfNeeded();
          await inputLoc.click();
          await inputLoc.fill('');
          await inputLoc.pressSequentially(String(val), { delay: 10 });
          await inputLoc.dispatchEvent('input');
          await inputLoc.dispatchEvent('change');
          await inputLoc.blur();
          await page.waitForTimeout(150);
        } else if (onLog) {
          onLog(`Warning: Input for ${year} column ${col.colId} not found.`);
        }
      }
    }
    return true;
  } catch (err) {
    if (onLog) onLog(`Error filling Plastic Consumed ag-Grid: ${err.message}`);
    return false;
  }
}

export function resolvePlasticConsumedYears(plasticConsumed = {}) {
  const keys = Object.keys(plasticConsumed || {}).filter(Boolean);
  return keys.sort((a, b) => b.localeCompare(a));
}
