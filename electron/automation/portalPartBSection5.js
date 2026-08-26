import fs from 'fs';

async function fillTextControl(scope, locators, value) {
  if (value == null || value === '') return false;
  const wanted = String(value);
  for (const locator of locators) {
    const field = typeof locator === 'string' ? scope.locator(locator).first() : locator.first();
    if (!(await field.isVisible({ timeout: 1200 }).catch(() => false))) continue;
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.click({ timeout: 2000 }).catch(() => {});
    await field.fill('');
    await field.pressSequentially(wanted, { delay: 20 });
    await field.dispatchEvent('input');
    await field.dispatchEvent('change');
    await field.blur();
    return true;
  }
  return false;
}

async function pickDropdownOption(page, scope, labelRegex, optionValue) {
  if (!optionValue) return false;
  const wrapper = scope
    .locator('.custom-input-wrapper, .form-group, .field-wrapper')
    .filter({ hasText: labelRegex })
    .first();

  if (!(await wrapper.isVisible({ timeout: 1500 }).catch(() => false))) {
    return fillTextControl(scope, [
      scope.getByLabel(labelRegex).first(),
    ], optionValue);
  }

  const nativeSelect = wrapper.locator('select').first();
  if (await nativeSelect.isVisible({ timeout: 800 }).catch(() => false)) {
    await nativeSelect.selectOption({ label: String(optionValue) }).catch(async () => {
      await nativeSelect.selectOption(String(optionValue));
    });
    return true;
  }

  const trigger = wrapper.locator(
    'select, input[readonly], .p-dropdown, .dropdown-toggle, .ng-select-container, .select-trigger',
  ).first();
  if (await trigger.isVisible({ timeout: 800 }).catch(() => false)) {
    await trigger.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    const option = page.getByRole('option', { name: new RegExp(`^${String(optionValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).first();
    if (await option.isVisible({ timeout: 1500 }).catch(() => false)) {
      await option.click();
      return true;
    }
    const listItem = page.locator('.dropdown-item, .p-dropdown-item, li, .option').filter({
      hasText: new RegExp(String(optionValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    }).first();
    if (await listItem.isVisible({ timeout: 1200 }).catch(() => false)) {
      await listItem.click();
      return true;
    }
  }

  return false;
}

function sectionBlock(page, sectionLabelRegex) {
  return page.locator('.table-field').filter({
    has: page.getByText(sectionLabelRegex).first(),
  }).first();
}

async function clickAddNewRow(section, onLog, sectionName) {
  await section.scrollIntoViewIfNeeded().catch(() => {});
  const addBtn = section.locator('button.add-button[title="Add New Row"], button[title="Add New Row"]').first();
  if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn.click({ timeout: 3000 });
    return true;
  }

  const fallback = section.locator('button.add-button, .table-actions button').last();
  if (await fallback.isVisible({ timeout: 1500 }).catch(() => false)) {
    await fallback.click({ timeout: 2000 });
    return true;
  }

  if (onLog) onLog(`${sectionName}: Add New Row button not found.`);
  return false;
}

async function waitForEntryModal(page, titleRegex) {
  const modal = page.locator(
    '.modal, .dialog, [role="dialog"], .cdk-overlay-pane, .p-dialog',
  ).filter({ hasText: titleRegex }).last();
  await modal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) return modal;

  return page.locator('body').first();
}

async function submitEntryModal(page, modal) {
  const submit = modal.getByRole('button', { name: /^Submit$|^Save$|^Add$/i }).last();
  if (await submit.isVisible({ timeout: 2500 }).catch(() => false)) {
    await submit.click({ timeout: 3000 });
    await page.waitForTimeout(900);
    return true;
  }
  const fallback = page.getByRole('button', { name: /^Submit$|^Save$|^Add$/i }).last();
  if (await fallback.isVisible({ timeout: 1500 }).catch(() => false)) {
    await fallback.click({ timeout: 3000 });
    await page.waitForTimeout(900);
    return true;
  }
  return false;
}

async function uploadInvoiceInModal(modal, filePath, onLog) {
  if (!filePath || !fs.existsSync(filePath)) {
    if (onLog) onLog(`Invoice file missing: ${filePath || '(none)'}`);
    return false;
  }
  const fileInput = modal.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(filePath);
    if (onLog) onLog(`Uploaded invoice: ${filePath}`);
    return true;
  }
  const uploadLabel = modal.getByText(/Upload Invoice\/GST E-Invoice/i).first();
  if (await uploadLabel.isVisible({ timeout: 1200 }).catch(() => false)) {
    const scopedInput = uploadLabel.locator('xpath=following::input[@type="file"][1]').first();
    if (await scopedInput.count()) {
      await scopedInput.setInputFiles(filePath);
      if (onLog) onLog(`Uploaded invoice: ${filePath}`);
      return true;
    }
  }
  return false;
}

export async function fillSec5bEntryModal(page, row = {}, onLog) {
  const modal = await waitForEntryModal(page, /Procured from Non-Registered|Non-Registered Entity/i);
  const scope = modal;

  await pickDropdownOption(page, scope, /Registration Type/i, row.regType || 'UnRegistered');
  await pickDropdownOption(page, scope, /Entity Type/i, row.entityType || 'Producer');
  await fillTextControl(scope, [
    scope.getByPlaceholder(/Enter Name of the Entity/i),
    scope.getByPlaceholder(/Name of the Entity/i),
  ], row.entityName);
  await fillTextControl(scope, [scope.getByPlaceholder(/Postal Address|^Address$/i)], row.address);
  await fillTextControl(scope, [scope.getByPlaceholder(/Mobile Number/i)], row.mobile);
  await pickDropdownOption(page, scope, /Country/i, row.country || 'India');
  await pickDropdownOption(page, scope, /Plastic Material Type/i, row.materialType || 'Packaging');
  await pickDropdownOption(page, scope, /Category Of Plastic|Category of Plastic/i, row.category);
  await pickDropdownOption(page, scope, /Financial Year/i, row.financialYear);
  await fillTextControl(scope, [scope.getByPlaceholder(/^Date|Invoice Date/i)], row.date);
  await fillTextControl(scope, [
    scope.getByPlaceholder(/Enter Quantity/i),
    scope.getByPlaceholder(/Total Plastic Quantity/i),
  ], row.quantity);
  await fillTextControl(scope, [scope.getByPlaceholder(/Recycled Plastic/i)], row.recycledPercent ?? '0');
  await uploadInvoiceInModal(scope, row.invoiceDoc, onLog);

  const ok = await submitEntryModal(page, modal);
  if (onLog && ok) onLog(`Section 5b saved: ${row.entityName || row.quantity}`);
  return ok;
}

export async function fillSec5dEntryModal(page, row = {}, onLog) {
  const modal = await waitForEntryModal(page, /Sold to UnRegistered PIBOs|UnRegistered PIBOs/i);
  const scope = modal;

  await pickDropdownOption(page, scope, /Registration Type/i, row.regType || 'UnRegistered');
  await pickDropdownOption(page, scope, /Entity Type/i, row.entityType || 'Producer');
  await fillTextControl(scope, [
    scope.getByPlaceholder(/Enter Name of the Entity/i),
    scope.getByPlaceholder(/Name of the Entity/i),
  ], row.entityName);
  await fillTextControl(scope, [scope.getByPlaceholder(/Postal Address|^Address$/i)], row.address);
  await pickDropdownOption(page, scope, /^State/i, row.state);
  await fillTextControl(scope, [scope.getByPlaceholder(/Mobile Number/i)], row.mobile);
  await pickDropdownOption(page, scope, /Plastic Material Type/i, row.materialType || 'Packaging');
  await pickDropdownOption(page, scope, /Category Of Plastic|Category of Plastic/i, row.category);
  await pickDropdownOption(page, scope, /Financial Year/i, row.financialYear);
  await fillTextControl(scope, [
    scope.getByPlaceholder(/22AAAAA0000A1Z5/i),
    scope.getByPlaceholder(/^GST$/i),
  ], row.gst);
  await fillTextControl(scope, [scope.getByPlaceholder(/Bank Account Number/i)], row.bankAccount);
  await fillTextControl(scope, [scope.getByPlaceholder(/HDFC0001234|IFSC/i)], row.ifsc);
  await fillTextControl(scope, [scope.getByPlaceholder(/Enter GST Paid|GST Paid/i)], row.gstPaid);
  await fillTextControl(scope, [
    scope.getByPlaceholder(/Enter GST Invoice Number|GST E-Invoice Number/i),
  ], row.invoiceNo);
  await fillTextControl(scope, [
    scope.getByPlaceholder(/Enter Quantity/i),
    scope.getByPlaceholder(/Total Plastic Quantity/i),
  ], row.quantity);
  await fillTextControl(scope, [scope.getByPlaceholder(/Recycled Plastic/i)], row.recycledPercent ?? '0');

  const ok = await submitEntryModal(page, modal);
  if (onLog && ok) onLog(`Section 5d saved: ${row.entityName || row.invoiceNo || row.quantity}`);
  return ok;
}

export async function fillPartBSection5dRows(page, rows = [], onLog) {
  const entries = Array.isArray(rows) ? rows.filter((row) => row?.entityName || row?.quantity) : [];
  if (!entries.length) {
    if (onLog) onLog('No Part B Section 5d rows to fill.');
    return false;
  }

  const section = sectionBlock(page, /5\s*d\).*Sold to UnRegistered PIBOs/i);
  if (!(await section.isVisible({ timeout: 6000 }).catch(() => false))) {
    const heading = page.getByText(/Sold to UnRegistered PIBOs/i).first();
    if (!(await heading.isVisible({ timeout: 3000 }).catch(() => false))) {
      if (onLog) onLog('Section 5d heading not found on portal.');
      return false;
    }
    await heading.scrollIntoViewIfNeeded().catch(() => {});
  }

  let filled = 0;
  for (const row of entries) {
    const block = sectionBlock(page, /5\s*d\).*Sold to UnRegistered PIBOs/i);
    const target = (await block.isVisible({ timeout: 1500 }).catch(() => false))
      ? block
      : page.locator('.table-field').filter({ hasText: /UnRegistered PIBOs/i }).last();

    const clicked = await clickAddNewRow(target, onLog, 'Section 5d');
    if (!clicked) continue;

    await page.waitForTimeout(700);
    const ok = await fillSec5dEntryModal(page, row, onLog);
    if (ok) filled += 1;
  }

  if (onLog) onLog(`Section 5d filled ${filled}/${entries.length} row(s).`);
  return filled > 0;
}

export async function fillPartBSection5bRows(page, rows = [], onLog) {
  const entries = Array.isArray(rows) ? rows.filter((row) => row?.entityName || row?.quantity) : [];
  if (!entries.length) {
    if (onLog) onLog('No Part B Section 5b rows to fill.');
    return false;
  }

  const section = sectionBlock(page, /5\s*b\).*Non-Registered Entity|Procured from Non-Registered/i);
  if (!(await section.isVisible({ timeout: 6000 }).catch(() => false))) {
    if (onLog) onLog('Section 5b heading not found on portal.');
    return false;
  }

  let filled = 0;
  for (const row of entries) {
    const block = sectionBlock(page, /5\s*b\).*Non-Registered Entity|Procured from Non-Registered/i);
    const clicked = await clickAddNewRow(block, onLog, 'Section 5b');
    if (!clicked) continue;

    await page.waitForTimeout(700);
    const ok = await fillSec5bEntryModal(page, row, onLog);
    if (ok) filled += 1;
  }

  if (onLog) onLog(`Section 5b filled ${filled}/${entries.length} row(s).`);
  return filled > 0;
}
