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
  if (onLog) onLog('Filling Part B Section 4 (3c AG Grid)...');
  
  // Aggregate data by year since the portal's grid for importers groups only by year
  const aggregatedByYear = {};
  section4Data.forEach(row => {
    if (!row.year) return;
    if (!aggregatedByYear[row.year]) {
      aggregatedByYear[row.year] = { rigid: 0, flexible: 0, mlp: 0, compostable: 0 };
    }
    aggregatedByYear[row.year].rigid += Number(row.rigid || 0);
    aggregatedByYear[row.year].flexible += Number(row.flexible || 0);
    aggregatedByYear[row.year].mlp += Number(row.mlp || 0);
    aggregatedByYear[row.year].compostable += Number(row.compostable || 0);
  });

  const agGrid = page.locator('ag-grid-angular').first();
  if (await agGrid.isVisible().catch(() => false)) {
    for (const year of Object.keys(aggregatedByYear)) {
      const data = aggregatedByYear[year];
      // Find the row by looking for the year cell
      const row = agGrid.locator('.ag-center-cols-container div[role="row"]').filter({ has: page.locator(`div[col-id="year"]`, { hasText: year }) }).first();
      
      if (await row.isVisible().catch(() => false)) {
        if (onLog) onLog(`Filling Section 4 grid for year ${year}...`);
        
        const fillCell = async (colId, value) => {
          if (value > 0) {
            const input = row.locator(`div[col-id="${colId}"] input`).first();
            if (await input.isVisible().catch(() => false)) {
              await input.fill(String(value));
              await input.dispatchEvent('change');
            }
          }
        };

        await fillCell('rigidPlastic', data.rigid);
        await fillCell('flexiblePlastic', data.flexible);
        await fillCell('mlp', data.mlp);
        await fillCell('compostablePlastic', data.compostable);
      } else {
        if (onLog) onLog(`Row for year ${year} not found in the grid.`);
      }
    }
  } else {
    if (onLog) onLog('AG Grid for 3c not found.');
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
