/**
 * Fill CPCB Part B — Section 4: Consents Details (Air and Water Act)
 *
 * Portal behaviour:
 *  1. Application Number  → text input
 *  2. Validity of Consent → auto-populated by portal from application number
 *  3. Consent Document    → file input / Upload button enabled after portal date populates
 */

import path from 'path';
import fs from 'fs';

async function waitForEnabled(handle, page, maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const disabled = await handle.isDisabled().catch(() => false);
    if (!disabled) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function fillTextInput(inputLoc, value, onLog, label) {
  if (!(await inputLoc.isVisible({ timeout: 2500 }).catch(() => false))) {
    if (onLog) onLog(`${label}: text input not visible — skipping.`);
    return false;
  }
  await inputLoc.scrollIntoViewIfNeeded().catch(() => {});
  await inputLoc.click().catch(() => {});
  await inputLoc.fill('').catch(() => {});
  await inputLoc.fill(String(value));
  await inputLoc.dispatchEvent('input').catch(() => {});
  await inputLoc.dispatchEvent('change').catch(() => {});
  await inputLoc.blur().catch(() => {});
  if (onLog) onLog(`${label}: ${value}`);
  return true;
}

async function uploadConsentDoc({ cellLoc, fallbackInput, fallbackBtn, page, filePath, onLog, label }) {
  if (!filePath) {
    if (onLog) onLog(`${label}: no file path provided — skipping.`);
    return false;
  }

  if (!fs.existsSync(filePath)) {
    if (onLog) onLog(`${label}: file does not exist at "${filePath}".`);
    return false;
  }

  // 1. Resolve file input
  let fileInput = null;
  if (cellLoc) {
    const inCell = cellLoc.locator('input[type="file"]').first();
    if (await inCell.count().catch(() => 0)) fileInput = inCell;
  }
  if (!fileInput && fallbackInput && (await fallbackInput.count().catch(() => 0))) {
    fileInput = fallbackInput;
  }

  // 2. Resolve upload button
  let uploadBtn = null;
  if (cellLoc) {
    const btnInCell = cellLoc.locator('button, label, a, div[role="button"], span').filter({ hasText: /upload/i }).first();
    if (await btnInCell.count().catch(() => 0)) uploadBtn = btnInCell;
  }
  if (!uploadBtn && fallbackBtn && (await fallbackBtn.count().catch(() => 0))) {
    uploadBtn = fallbackBtn;
  }

  if (uploadBtn) {
    await uploadBtn.scrollIntoViewIfNeeded().catch(() => {});
  } else if (cellLoc) {
    await cellLoc.scrollIntoViewIfNeeded().catch(() => {});
  }

  // Wait if disabled
  if (fileInput) {
    await waitForEnabled(fileInput, page, 6000);
  } else if (uploadBtn) {
    await waitForEnabled(uploadBtn, page, 6000);
  }

  let uploadSuccess = false;

  // ── STRATEGY A: setInputFiles on file input (proven to work on CPCB) ──
  if (fileInput && (await fileInput.count().catch(() => 0))) {
    try {
      await fileInput.scrollIntoViewIfNeeded().catch(() => {});
      await fileInput.setInputFiles(filePath);
      await fileInput.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }).catch(() => {});
      await page.waitForTimeout(1500);
      uploadSuccess = true;
      if (onLog) onLog(`${label}: uploaded ${path.basename(filePath)} (setInputFiles)`);
    } catch (err) {
      if (onLog) onLog(`${label}: setInputFiles failed — ${err.message}, trying filechooser...`);
    }
  }

  // ── STRATEGY B: Browser FileChooser event via Upload button click ──
  // Only attempt if Strategy A did not succeed
  if (!uploadSuccess && uploadBtn && (await uploadBtn.isVisible({ timeout: 1500 }).catch(() => false))) {
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        uploadBtn.click({ timeout: 2000 }),
      ]);
      await chooser.setFiles(filePath);
      await page.waitForTimeout(1500);
      uploadSuccess = true;
      if (onLog) onLog(`${label}: uploaded ${path.basename(filePath)} (filechooser)`);
    } catch {
      try {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 4000 }),
          uploadBtn.evaluate((el) => el.click()),
        ]);
        await chooser.setFiles(filePath);
        await page.waitForTimeout(1500);
        uploadSuccess = true;
        if (onLog) onLog(`${label}: uploaded ${path.basename(filePath)} (DOM filechooser)`);
      } catch (err2) {
        if (onLog) onLog(`${label}: filechooser also failed — ${err2.message}`);
      }
    }
  }

  return uploadSuccess;
}

async function discoverConsentsColIds(gridTable) {
  const colMap = {
    waterDocColId: null,
    airDocColId: null,
    waterAppColId: null,
    airAppColId: null,
  };

  try {
    const headerLocs = await gridTable.locator('.ag-header-cell').all();
    let appCount = 0;
    for (const h of headerLocs) {
      const colId = await h.getAttribute('col-id').catch(() => null);
      const text = (await h.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (!colId || colId === 'ag-Grid-AutoColumn') continue;

      if (/water.*consent.*doc|water.*doc/i.test(text) || /waterConsent/i.test(colId)) {
        colMap.waterDocColId = colId;
      } else if (/air.*consent.*doc|air.*doc/i.test(text) || /airConsent/i.test(colId)) {
        colMap.airDocColId = colId;
      } else if (/application\s*number/i.test(text)) {
        if (appCount === 0) colMap.waterAppColId = colId;
        else colMap.airAppColId = colId;
        appCount++;
      }
    }
  } catch {
    /* ignore header scan errors */
  }

  return colMap;
}

export async function fillConsentsDetailsGrid(page, consents = [], onLog) {
  if (!Array.isArray(consents) || !consents.length) {
    if (onLog) onLog('No consents details provided — skipping Consents grid fill.');
    return false;
  }

  const heading = page
    .locator('label, div, span, p')
    .filter({ hasText: /Consents Details\s*\(Air and Water Act\)/i })
    .first();

  const headingVisible = await heading.isVisible({ timeout: 10000 }).catch(() => false);
  if (!headingVisible) {
    if (onLog) onLog('Consents Details (Air and Water Act) section not found on portal — skipping.');
    return false;
  }

  await heading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  if (onLog) onLog(`Filling Consents Details for ${consents.length} state(s) (application number + PDF only; validity dates untouched)...`);

  const gridTable = page.locator('app-ag-grid-table').filter({ hasText: /Application Number|consent/i }).first();
  const gridVisible = await gridTable.isVisible({ timeout: 5000 }).catch(() => false);

  const colMap = gridVisible ? await discoverConsentsColIds(gridTable) : {};
  if (onLog && (colMap.waterDocColId || colMap.airDocColId)) {
    onLog(`Consents column mapping: WaterDoc=${colMap.waterDocColId || 'auto'}, AirDoc=${colMap.airDocColId || 'auto'}`);
  }

  let filledCount = 0;

  for (const c of consents) {
    if (!c || !c.state) continue;
    const stateName = String(c.state).trim();

    const rowScope = gridVisible ? gridTable : page;
    const allRows = rowScope.locator('[role="row"], tr').filter({ hasText: stateName });
    const rowCount = await allRows.count().catch(() => 0);

    if (!rowCount) {
      if (onLog) onLog(`Consents: row for "${stateName}" not found — skipping.`);
      continue;
    }

    const row = allRows.first();
    const rowIndex = await row.getAttribute('row-index').catch(() => null);

    // If ag-grid has split center container, find center row
    const centerRow = (gridVisible && rowIndex != null)
      ? gridTable.locator(`.ag-center-cols-container .ag-row[row-index="${rowIndex}"]`).first()
      : null;
    const targetRow = (centerRow && await centerRow.isVisible().catch(() => false)) ? centerRow : row;

    // Get all file inputs and upload buttons in row
    const fileInputsInRow = targetRow.locator('input[type="file"]');
    const uploadBtnsInRow = targetRow.locator('button, label, a, div[role="button"]').filter({ hasText: /upload/i });

    // ── Water Doc Cell & Fallbacks ──
    let waterDocCell = null;
    if (colMap.waterDocColId) {
      const byColId = targetRow.locator(`.ag-cell[col-id="${colMap.waterDocColId}"]`).first();
      if (await byColId.count().catch(() => 0)) waterDocCell = byColId;
    }
    const waterFallbackInput = fileInputsInRow.nth(0);
    const waterFallbackBtn = uploadBtnsInRow.nth(0);

    // ── Air Doc Cell & Fallbacks ──
    let airDocCell = null;
    if (colMap.airDocColId) {
      const byColId = targetRow.locator(`.ag-cell[col-id="${colMap.airDocColId}"]`).first();
      if (await byColId.count().catch(() => 0)) airDocCell = byColId;
    }
    const totalFileInputs = await fileInputsInRow.count().catch(() => 0);
    const totalUploadBtns = await uploadBtnsInRow.count().catch(() => 0);
    const airFallbackInput = totalFileInputs >= 2 ? fileInputsInRow.nth(1) : fileInputsInRow.last();
    const airFallbackBtn = totalUploadBtns >= 2 ? uploadBtnsInRow.nth(1) : uploadBtnsInRow.last();

    // ─── WATER ACT ─────────────────────────────────────────────

    if (c.waterApplicationNumber) {
      let waterAppInput = null;
      if (colMap.waterAppColId) {
        waterAppInput = targetRow.locator(`.ag-cell[col-id="${colMap.waterAppColId}"] input`).first();
      }
      if (!waterAppInput || !(await waterAppInput.count().catch(() => 0))) {
        waterAppInput = targetRow.locator('input[type="text"], input:not([type="date"]):not([type="file"])').nth(0);
      }
      const filled = await fillTextInput(waterAppInput, c.waterApplicationNumber, onLog, `${stateName} Water App No`);
      if (filled) {
        filledCount += 1;
        await page.waitForTimeout(2500); // Allow portal to fetch validity date and enable upload
      }
    }

    if (c.waterConsentDocument) {
      const uploaded = await uploadConsentDoc({
        cellLoc: waterDocCell,
        fallbackInput: waterFallbackInput,
        fallbackBtn: waterFallbackBtn,
        page,
        filePath: c.waterConsentDocument,
        onLog,
        label: `${stateName} Water Doc`,
      });
      if (uploaded) filledCount += 1;
    }

    // ─── AIR ACT ───────────────────────────────────────────────

    if (c.airApplicationNumber) {
      let airAppInput = null;
      if (colMap.airAppColId) {
        airAppInput = targetRow.locator(`.ag-cell[col-id="${colMap.airAppColId}"] input`).first();
      }
      if (!airAppInput || !(await airAppInput.count().catch(() => 0))) {
        airAppInput = targetRow.locator('input[type="text"], input:not([type="date"]):not([type="file"])').nth(1);
      }
      const filled = await fillTextInput(airAppInput, c.airApplicationNumber, onLog, `${stateName} Air App No`);
      if (filled) {
        filledCount += 1;
        await page.waitForTimeout(2500); // Allow portal to fetch validity date and enable upload
      }
    }

    if (c.airConsentDocument) {
      const uploaded = await uploadConsentDoc({
        cellLoc: airDocCell,
        fallbackInput: airFallbackInput,
        fallbackBtn: airFallbackBtn,
        page,
        filePath: c.airConsentDocument,
        onLog,
        label: `${stateName} Air Doc`,
      });
      if (uploaded) filledCount += 1;
    }
  }

  if (onLog) onLog(`Consents Details: ${filledCount} field(s) processed.`);
  return filledCount > 0;
}
