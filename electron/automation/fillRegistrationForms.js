import { uploadDocumentByLabel } from './cpcbRegistration.js';

async function waitAndFill(page, selector, value, onLog, fieldName) {
  if (!value) return;
  try {
    const input = page.locator(selector).first();
    if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (onLog) onLog(`Filling ${fieldName}...`);
      await input.fill(String(value));
      await input.dispatchEvent('change');
    }
  } catch (err) {
    if (onLog) onLog(`Failed to fill ${fieldName}: ${err.message}`);
  }
}

async function waitAndSelect(page, selector, value, onLog, fieldName) {
  if (!value) return;
  try {
    const select = page.locator(selector).first();
    if (await select.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (onLog) onLog(`Selecting ${fieldName}...`);
      await select.selectOption({ label: String(value) }).catch(() => select.selectOption({ value: String(value) }));
    }
  } catch (err) {
    if (onLog) onLog(`Failed to select ${fieldName}: ${err.message}`);
  }
}

export async function fillRemainingPartA(page, generalInfo, autoData, onLog) {
  if (onLog) onLog('Filling remaining Part A details...');

  // Helper to find a field container by its label title
  const getFieldContainer = (title) => page.locator(`label[title*="${title}"]`).locator('..').locator('..');

  if (autoData.typeOfCompanyDoc) {
    await uploadDocumentByLabel(page, 'Supporting document for company category', autoData.typeOfCompanyDoc, onLog);
  }

  // Unit Address logic
  if (generalInfo.isSameAsRegisteredAddress === false) {
    const checkbox = page.locator('input#sameAsRegistered');
    if (await checkbox.isVisible().catch(() => false)) {
      const isChecked = await checkbox.isChecked();
      if (isChecked) {
        if (onLog) onLog('Unchecking Same as Registered Address...');
        await checkbox.click(); 
      }
      
      const plantAddressInput = page.locator('textarea[placeholder="Enter Plant/Unit address"]').first();
      if (await plantAddressInput.isVisible().catch(() => false)) {
        await plantAddressInput.fill(String(generalInfo.plantAddress));
        await plantAddressInput.dispatchEvent('change');
      }

      const unitGstInput = page.locator('input[placeholder="Enter Unit GST number"]').first();
      if (await unitGstInput.isVisible().catch(() => false)) {
        await unitGstInput.fill(String(generalInfo.unitGst));
        await unitGstInput.dispatchEvent('change');
      }
      
      if (autoData.unitGstDoc) {
        await uploadDocumentByLabel(page, 'Unit GST', autoData.unitGstDoc, onLog);
      }
    }
  }

  // 3c) Total Quantity of Plastic Consumed
  if (generalInfo.plasticConsumed) {
    if (onLog) onLog('Filling 3c) Total Quantity of Plastic Consumed...');
    try {
      const gridContainer = page.locator('app-ag-grid-table').filter({ hasText: /Rigid Plastic/i }).first();
      await gridContainer.waitFor({ state: 'visible', timeout: 5000 });

      const yearsToFill = [
        { year: '2024-25', index: 0 },
        { year: '2025-26', index: 1 }
      ];

      const columns = [
        { key: 'cat1', colId: 'rigidPlastic' },
        { key: 'cat2', colId: 'flexiblePlastic' },
        { key: 'cat3', colId: 'mlp' },
        { key: 'cat4', colId: 'compostablePlastic' }
      ];

      for (const y of yearsToFill) {
        let row = gridContainer.locator(`div.ag-center-cols-container div[role="row"]`).filter({ hasText: y.year }).first();
        if ((await row.count().catch(() => 0)) === 0) {
           row = gridContainer.locator(`div.ag-center-cols-container div[role="row"][row-index="${y.index}"]`).first();
        }

        if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
          for (const col of columns) {
            const val = generalInfo.plasticConsumed?.[y.year]?.[col.key] || '0';
            const inputLoc = row.locator(`div[col-id="${col.colId}"] input.cell-input`).first();
            
            if (await inputLoc.isVisible({ timeout: 2000 }).catch(() => false)) {
              await inputLoc.scrollIntoViewIfNeeded();
              await inputLoc.click();
              await inputLoc.fill('');
              await inputLoc.pressSequentially(String(val), { delay: 10 });
              await inputLoc.dispatchEvent('input');
              await inputLoc.dispatchEvent('change');
              await inputLoc.blur();
              await page.waitForTimeout(200);
            } else {
              if (onLog) onLog(`Warning: Input for ${y.year} column ${col.colId} not found.`);
            }
          }
        }
      }
    } catch (err) {
      if (onLog) onLog(`Error filling Plastic Consumed ag-Grid: ${err.message}`);
    }
  }

  // 3d) Compliance Status
  if (generalInfo.complianceStatus) {
    const complianceSelect = getFieldContainer('Status of compliance with PWM Rules').locator('select');
    if (await complianceSelect.isVisible().catch(() => false)) {
      if (onLog) onLog('Selecting Compliance Status (3d)...');
      await complianceSelect.selectOption({ value: generalInfo.complianceStatus.toLowerCase() }).catch(() => {});
    }
  }

  // 3e) Thickness
  if (generalInfo.thicknessOfPlastic) {
    const thicknessInput = getFieldContainer('Thickness of Plastic Packaging').locator('input');
    if (await thicknessInput.isVisible().catch(() => false)) {
      if (onLog) onLog('Filling Thickness of Plastic (3e)...');
      await thicknessInput.fill(String(generalInfo.thicknessOfPlastic));
      await thicknessInput.dispatchEvent('change');
    }
  }
}

export async function fillPartBSection4(page, section4Data, onLog) {
  if (!section4Data || !section4Data.length) return;
  if (onLog) onLog('Filling Part B Section 4 (State-wise PW generated)...');

  try {
    const agGrid = page.locator('app-ag-grid-table').filter({ hasText: /Pre Consumer Waste/i }).first();
    if (!(await agGrid.isVisible({ timeout: 5000 }).catch(() => false))) {
      if (onLog) onLog('Part B Section 4 grid not found on this page.');
      return;
    }

    const rows = agGrid.locator('.ag-center-cols-container div[role="row"]:not(.ag-row-last)');
    const rowCount = await rows.count();

    let currentState = '';
    let currentYear = '';

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      
      const stateText = await row.locator('div[col-id="stateName"]').innerText().catch(() => '');
      if (stateText && stateText.trim() && stateText.toLowerCase() !== 'total') {
        currentState = stateText.trim().toUpperCase();
      }

      const yearText = await row.locator('div[col-id="year"]').innerText().catch(() => '');
      if (yearText && yearText.trim()) {
        currentYear = yearText.trim();
      }

      const catText = await row.locator('div[col-id="categoryOfPlastic"]').innerText().catch(() => '');
      const category = catText.trim();

      if (!currentState || !currentYear || !category || currentState.toLowerCase() === 'total') continue;

      const groupData = section4Data.find(g => g.state.toUpperCase() === currentState && g.year === currentYear);
      if (groupData && groupData.categories) {
        const catData = groupData.categories.find(c => c.category === category || category.includes(c.category) || c.category.includes(category));
        
        if (catData) {
          const fillCell = async (colId, value) => {
            if (value && String(value).trim() !== '' && String(value) !== '0') {
              const input = row.locator(`div[col-id="${colId}"] input.cell-input`).first();
              if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
                await input.scrollIntoViewIfNeeded();
                await input.click();
                await input.fill('');
                await input.pressSequentially(String(value), { delay: 10 });
                await input.dispatchEvent('input');
                await input.dispatchEvent('change');
                await input.blur();
              }
            }
          };

          await fillCell('preConsumerPlasticQuantity', catData.preConsumer);
          await fillCell('postConsumerPlasticQuantity', catData.postConsumer);
          await fillCell('exportPlasticQuantity', catData.exportQuantity);
        }
      }
    }
  } catch (err) {
    if (onLog) onLog(`Error filling Part B Section 4 grid: ${err.message}`);
  }
}

export async function fillPartBSection5(page, transactions, onLog) {
  if (!transactions) return;
  if (onLog) onLog('Filling Part B Section 5 transactions...');

  const sections = ['sec5a', 'sec5b', 'sec5c', 'sec5d'];
  for (const sec of sections) {
    const rows = transactions[sec] || [];
    for (const row of rows) {
      if (onLog) onLog(`Adding Section 5 transaction: ${sec}...`);
      // Placeholder for clicking Add Row for this specific section, then filling modal
      // e.g. await page.locator(`button[id="add-row-${sec}"]`).click();
      // await fill5Modal(page, row, sec);
    }
  }
}

export async function fillPartC(page, generalInfo, onLog) {
  if (onLog) onLog('Filling Part C uploads...');
  
  // Go to Next page if necessary to reach Part C
  // await page.getByRole('button', { name: /Save & Next/i }).click();

  if (generalInfo.partCCoveringLetter) {
    await uploadDocumentByLabel(page, 'Covering Letter', generalInfo.partCCoveringLetter, onLog);
  }
  if (generalInfo.partCSignature) {
    await uploadDocumentByLabel(page, 'Signature', generalInfo.partCSignature, onLog);
  }
  if (generalInfo.partCAuditedStatement) {
    await uploadDocumentByLabel(page, 'Audited Statement', generalInfo.partCAuditedStatement, onLog);
  }

  // Check the final agreement checkbox
  const agreeCheck = page.locator('input[type="checkbox"][id="agree"]').first();
  if (await agreeCheck.isVisible().catch(() => false)) {
    if (!(await agreeCheck.isChecked())) {
       await agreeCheck.click();
    }
  }
  
  if (onLog) onLog('Stopped before Submit & Pay.');
}
