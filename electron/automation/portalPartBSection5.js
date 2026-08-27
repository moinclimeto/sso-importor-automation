import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  PORTAL_PLASTIC_MATERIAL_VALUES,
  PORTAL_SEC5_ENTITY_VALUES,
  normalizeSec5bRowForPortal,
  toInputDate,
} from '../../shared/partBSection5.js';
import { CPCB_MAX_UPLOAD_BYTES, ensurePdfUnderMaxSize } from '../utils/pdfCompressor.js';

async function fillPortalSelect(scope, selector, optionLabel, onLog, fieldName, valueMap = {}) {
  if (!optionLabel) return false;
  const select = scope.locator(selector).first();
  if (!(await select.isVisible({ timeout: 2500 }).catch(() => false))) {
    if (onLog) onLog(`${fieldName} select not visible (${selector})`);
    return false;
  }
  if (await select.isDisabled().catch(() => false)) {
    if (onLog) onLog(`${fieldName} is disabled — skipping`);
    return true;
  }

  const label = String(optionLabel).trim();
  const mappedValue = valueMap[label]
    || Object.entries(valueMap).find(([key]) => key.toLowerCase() === label.toLowerCase())?.[1];

  const attempts = [
    () => select.selectOption({ label }),
    () => select.selectOption({
      label: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'),
    }),
    () => (mappedValue ? select.selectOption({ value: mappedValue }) : null),
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) {
        await select.dispatchEvent('change').catch(() => {});
        await select.dispatchEvent('input').catch(() => {});
        if (onLog) onLog(`Selected ${fieldName}: ${label}`);
        return true;
      }
    } catch {
      /* try next */
    }
  }

  const ok = await select.evaluate((el, payload) => {
    const opts = [...el.options];
    const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const want = norm(payload.label);
    let opt = opts.find((o) => norm(o.textContent) === want)
      || opts.find((o) => norm(o.textContent).includes(want));
    if (!opt && payload.mappedValue) {
      opt = opts.find((o) => o.value === payload.mappedValue);
    }
    if (!opt) return false;
    el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { label, mappedValue }).catch(() => false);

  if (ok) {
    if (onLog) onLog(`Selected ${fieldName} via DOM: ${label}`);
    return true;
  }

  if (onLog) onLog(`Failed to select ${fieldName}: ${label}`);
  return false;
}

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

async function fillNativeSelect(scope, selector, optionLabel, onLog, fieldName) {
  if (!optionLabel) return false;
  const select = scope.locator(selector).first();
  if (!(await select.isVisible({ timeout: 2000 }).catch(() => false))) return false;
  if (await select.isDisabled().catch(() => false)) {
    if (onLog) onLog(`${fieldName} is disabled — skipping`);
    return true;
  }

  const escaped = String(optionLabel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const picked = await select.selectOption({ label: new RegExp(escaped, 'i') })
    .catch(() => select.selectOption({ value: String(optionLabel) }))
    .catch(async () => {
      const options = await select.locator('option').allTextContents();
      const match = options.find((text) => new RegExp(escaped, 'i').test(String(text || '').trim()));
      if (match) return select.selectOption({ label: match.trim() });
      throw new Error('no match');
    })
    .catch(() => null);

  if (!picked) return false;
  await select.dispatchEvent('change').catch(() => {});
  if (onLog) onLog(`Selected ${fieldName}: ${optionLabel}`);
  return true;
}

async function fillByControlId(scope, id, value) {
  if (value == null || value === '') return false;
  const field = scope.locator(`#${id}`).first();
  if (!(await field.isVisible({ timeout: 1800 }).catch(() => false))) return false;
  await field.scrollIntoViewIfNeeded().catch(() => {});

  const inputType = String(await field.getAttribute('type').catch(() => '') || '').toLowerCase();
  let fillValue = String(value);
  if (inputType === 'date') {
    fillValue = toInputDate(value);
    if (!fillValue) return false;
  }

  await field.click({ force: true }).catch(() => {});
  await field.fill('');
  await field.fill(fillValue);
  await field.dispatchEvent('input').catch(() => {});
  await field.dispatchEvent('change').catch(() => {});
  await field.blur().catch(() => {});
  return true;
}

async function isEntryModalOpen(page) {
  return page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
    return dialogs.some((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.05
        && rect.width > 0
        && rect.height > 0;
    });
  }).catch(() => false);
}

async function waitForEntryModalClosed(page, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!(await isEntryModalOpen(page))) {
      await page.waitForTimeout(350);
      return true;
    }
    await page.waitForTimeout(250);
  }
  return !(await isEntryModalOpen(page));
}

async function dismissBlockingModals(page, onLog) {
  const hidden = await page.evaluate(() => {
    let count = 0;
    const hide = (el) => {
      if (!(el instanceof HTMLElement)) return;
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      count += 1;
    };
    document.querySelectorAll('app-table-add-modal').forEach(hide);
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach((el) => {
      hide(el);
      hide(el.closest('.fixed.inset-0'));
    });
    return count;
  }).catch(() => 0);
  if (hidden && onLog) onLog(`Force-dismissed ${hidden} blocking modal layer(s).`);
  await page.waitForTimeout(300);
  return !(await isEntryModalOpen(page));
}

async function closeEntryModal(page, onLog) {
  if (!(await isEntryModalOpen(page))) return true;

  const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
  const closeAttempts = [
    () => dialog.locator('button[aria-label*="close" i]').first().click({ force: true, timeout: 2000 }),
    () => dialog.locator('.close, .modal-close, .btn-close, .icon-close').first().click({ force: true, timeout: 2000 }),
    () => page.locator('app-table-add-modal button').filter({ hasText: /^[×xX✕]$/ }).first().click({ force: true, timeout: 2000 }),
    () => dialog.locator('button').filter({ hasText: /^Cancel$/i }).first().click({ force: true, timeout: 2000 }),
    () => page.locator('button').filter({ hasText: /^Cancel$/i }).last().click({ force: true, timeout: 2000 }),
    () => page.keyboard.press('Escape'),
  ];

  for (const attempt of closeAttempts) {
    await attempt().catch(() => {});
    await page.waitForTimeout(450);
    if (!(await isEntryModalOpen(page))) {
      if (onLog) onLog('Closed entry modal.');
      return true;
    }
  }

  return dismissBlockingModals(page, onLog);
}

export async function forceCloseAllEntryModals(page, onLog, maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (!(await isEntryModalOpen(page))) return true;
    if (onLog && i === 0) onLog('Closing open entry modal(s)...');
    const closed = await closeEntryModal(page, onLog);
    if (closed) return true;
    await page.waitForTimeout(400);
  }
  if (onLog) onLog('Entry modal still visible after close attempts.');
  return dismissBlockingModals(page, onLog);
}

async function ensureNoOpenEntryModal(page, onLog) {
  return forceCloseAllEntryModals(page, onLog, 4);
}

async function resolveUploadPdfPath(filePath, onLog) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const size = fs.statSync(filePath).size;
    if (size <= CPCB_MAX_UPLOAD_BYTES) return filePath;
    const tempPath = path.join(os.tmpdir(), `cpcb-sec5-${Date.now()}-${path.basename(filePath)}`);
    const result = await ensurePdfUnderMaxSize(filePath, tempPath);
    if (onLog) {
      onLog(`PDF prepared for upload (${Math.round((result.sizeBytes || size) / 1024)}KB${result.compressed ? ', compressed' : ''}).`);
      if (result.warning) onLog(result.warning);
    }
    return result.filePath || filePath;
  } catch (err) {
    if (onLog) onLog(`PDF prepare failed: ${err.message}`);
    return filePath;
  }
}

async function pickSearchableCountry(page, scope, country = 'India', onLog) {
  const trigger = scope.locator('#country.searchable-trigger, app-searchable-select button.searchable-trigger').first();
  if (!(await trigger.isVisible({ timeout: 2000 }).catch(() => false))) {
    return pickDropdownOption(page, scope, /Country/i, country);
  }

  await trigger.click({ timeout: 3000 });
  await page.waitForTimeout(180);

  const search = page.locator(
    '.searchable-dropdown input, .searchable-panel input, .searchable-options input, input[placeholder*="Search country" i]'
  ).last();
  if (await search.isVisible({ timeout: 800 }).catch(() => false)) {
    await search.fill('');
    await search.fill(country);
    await page.waitForTimeout(120);
  }

  const option = page.locator('.searchable-option, .dropdown-option, [role="option"], li, button, div').filter({
    hasText: new RegExp(`^\\s*${String(country).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'),
  }).first();
  if (await option.isVisible({ timeout: 1500 }).catch(() => false)) {
    await option.click({ force: true });
    if (onLog) onLog(`Selected country: ${country}`);
    return true;
  }

  const fallback = page.getByText(new RegExp(`^${String(country).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')).last();
  if (await fallback.isVisible({ timeout: 1000 }).catch(() => false)) {
    await fallback.click({ force: true });
    if (onLog) onLog(`Selected country: ${country}`);
    return true;
  }
  return false;
}

function nonRegisteredFormScope(page) {
  return page.locator('form.modal-form .nonregistered-modal, .nonregistered-modal').first();
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

async function clickAddNewRow(section, page, onLog, sectionName) {
  const cleared = await forceCloseAllEntryModals(page, onLog, 6);
  if (!cleared) {
    if (onLog) onLog(`${sectionName}: blocked — entry modal still open.`);
    return false;
  }
  await section.scrollIntoViewIfNeeded().catch(() => {});
  const addBtn = section.locator(
    'button.add-button[title="Add New Row"], button.icon-button.add-button, button.add-button'
  ).first();
  if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn.click({ timeout: 5000 });
    return true;
  }

  const fallback = section.locator('button.add-button, .table-actions button').last();
  if (await fallback.isVisible({ timeout: 1500 }).catch(() => false)) {
    await fallback.click({ timeout: 3000 });
    return true;
  }

  if (onLog) onLog(`${sectionName}: Add New Row button not found.`);
  return false;
}

function soldFormScope(page) {
  return page.locator('form.modal-form .sold-modal, .sold-modal').first();
}

async function waitForEntryModal(page, titleRegex) {
  const soldModal = page.locator('form.modal-form .sold-modal, .sold-modal').first();
  await soldModal.waitFor({ state: 'visible', timeout: 2500 }).catch(() => {});
  if (await soldModal.isVisible({ timeout: 500 }).catch(() => false)) {
    return soldModal.locator('xpath=ancestor::form[1]').first().or(soldModal);
  }

  const formModal = page.locator('form.modal-form .nonregistered-modal, .nonregistered-modal').first();
  await formModal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await formModal.isVisible({ timeout: 1500 }).catch(() => false)) {
    return formModal.locator('xpath=ancestor::form[1]').first().or(formModal);
  }

  const modal = page.locator(
    '.modal, .dialog, [role="dialog"], .cdk-overlay-pane, .p-dialog',
  ).filter({ hasText: titleRegex }).last();
  await modal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) return modal;

  return page.locator('body').first();
}

async function submitEntryModal(page, modal, onLog) {
  const scopes = [
    nonRegisteredFormScope(page),
    soldFormScope(page),
    modal,
    page.locator('form.modal-form').first(),
  ];

  const submitCandidates = [];
  for (const scope of scopes) {
    submitCandidates.push(
      scope.locator('button.nonregistered-btn').filter({ hasText: /^Submit$/i }).first(),
      scope.locator('button.sold-btn').filter({ hasText: /^Submit$/i }).first(),
    );
  }
  submitCandidates.push(
    page.locator('button.nonregistered-btn, button.sold-btn').filter({ hasText: /^Submit$/i }).last(),
    page.getByRole('button', { name: /^Submit$/i }).last(),
  );

  for (const submit of submitCandidates) {
    if (!(await submit.isVisible({ timeout: 1200 }).catch(() => false))) continue;
    await submit.scrollIntoViewIfNeeded().catch(() => {});
    await submit.click({ timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(900);
    if (await waitForEntryModalClosed(page, 12000)) {
      if (onLog) onLog('Entry modal submitted and closed.');
      return true;
    }

    await page.evaluate(() => {
      const btn = document.querySelector('button.nonregistered-btn, button.sold-btn');
      btn?.click();
    }).catch(() => {});
    await page.waitForTimeout(900);
    if (await waitForEntryModalClosed(page, 8000)) {
      if (onLog) onLog('Entry modal submitted and closed (DOM click).');
      return true;
    }

    const errors = await nonRegisteredFormScope(page).locator('.modal-error').allTextContents().catch(() => []);
    const soldErrors = await soldFormScope(page).locator('.modal-error').allTextContents().catch(() => []);
    const messages = [...errors, ...soldErrors].map((t) => String(t || '').trim()).filter(Boolean);
    if (messages.length && onLog) onLog(`Modal validation: ${messages.join('; ')}`);
  }

  if (onLog) onLog('Submit button click did not close modal.');
  return false;
}

async function verifyInvoiceAttached(scope, page, filePath) {
  const fileName = path.basename(filePath);
  const shortName = fileName.replace(/\s+/g, ' ').trim();
  const escaped = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const uploadField = scope.locator(
    '#uploadInvoice, #soldUploadInvoice, input[formcontrolname="uploadInvoice"], input[readonly][placeholder*="Upload Invoice" i]',
  ).first();
  if (await uploadField.isVisible({ timeout: 1500 }).catch(() => false)) {
    const val = String(await uploadField.inputValue().catch(() => '') || '').trim();
    if (val && new RegExp(escaped, 'i').test(val)) return true;
  }

  const wrap = scope.locator('.nonregistered-upload-wrap, .sold-upload-wrap').first();
  if (await wrap.isVisible({ timeout: 800 }).catch(() => false)) {
    const text = String(await wrap.innerText().catch(() => '') || '');
    if (new RegExp(escaped, 'i').test(text)) return true;
    if (/Change/i.test(text) && /\.pdf/i.test(text)) return true;
  }

  if (await scope.getByText(new RegExp(escaped, 'i')).first().isVisible({ timeout: 800 }).catch(() => false)) {
    return true;
  }
  if (await page.getByText(new RegExp(escaped, 'i')).first().isVisible({ timeout: 800 }).catch(() => false)) {
    return true;
  }
  return false;
}

async function uploadInvoiceInModal(scope, filePath, onLog) {
  const uploadPath = await resolveUploadPdfPath(filePath, onLog);
  if (!uploadPath || !fs.existsSync(uploadPath)) {
    if (onLog) onLog(`Invoice file missing: ${filePath || '(none)'}`);
    return false;
  }

  const page = scope.page();
  const roots = [
    scope,
    nonRegisteredFormScope(page),
    soldFormScope(page),
    page.locator('.nonregistered-modal').first(),
    page.locator('.sold-modal').first(),
    page.locator('form.modal-form').first(),
  ];

  for (const root of roots) {
    const wrap = root.locator('.nonregistered-upload-wrap, .sold-upload-wrap').first();
    const fileInputs = wrap.locator('input[type="file"]')
      .or(root.locator('input[type="file"].file-input-hidden, input.file-input-hidden, input[type="file"]'));
    const count = await fileInputs.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const input = fileInputs.nth(i);
      try {
        await input.setInputFiles(uploadPath);
        await input.dispatchEvent('change').catch(() => {});
        await input.dispatchEvent('input').catch(() => {});
        await page.waitForTimeout(1200);
        if (await verifyInvoiceAttached(root, page, uploadPath)) {
          if (onLog) onLog(`Uploaded invoice: ${path.basename(uploadPath)}`);
          return true;
        }
      } catch {
        /* try next input */
      }
    }

    const uploadBtn = root.locator('button.upload-link-btn').filter({ hasText: /^(Upload|Change)$/i }).first();
    if (await uploadBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
      try {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          uploadBtn.click({ timeout: 4000 }),
        ]);
        await chooser.setFiles(uploadPath);
        await page.waitForTimeout(1200);
        if (await verifyInvoiceAttached(root, page, uploadPath)) {
          if (onLog) onLog(`Uploaded invoice via chooser: ${path.basename(uploadPath)}`);
          return true;
        }
      } catch (err) {
        if (onLog) onLog(`Invoice upload chooser failed: ${err.message}`);
      }
    }
  }

  if (onLog) onLog(`Invoice upload did not show filename on form: ${path.basename(uploadPath)}`);
  return false;
}

export async function fillSec5bEntryModal(page, row = {}, onLog) {
  const data = normalizeSec5bRowForPortal(row);
  const modal = await waitForEntryModal(
    page,
    /Plastic Raw Material|Procured from Non-Registered|Non-Registered Entity/i,
  );
  const scope = (await nonRegisteredFormScope(page).isVisible({ timeout: 2000 }).catch(() => false))
    ? nonRegisteredFormScope(page)
    : modal;

  if (onLog) onLog(`Filling Section 5b modal for ${data.entityName || 'purchase row'}...`);
  if (onLog) onLog(`Section 5b data: entity=${data.entityType}, material=${data.materialType}, pdf=${data.invoiceDoc || '(none)'}`);

  const entityOk = await fillPortalSelect(
    scope,
    '#entityType, select[formcontrolname="entityType"]',
    data.entityType,
    onLog,
    'Entity Type',
    PORTAL_SEC5_ENTITY_VALUES,
  );
  await fillByControlId(scope, 'entityName', data.entityName);
  await pickSearchableCountry(page, scope, data.country || 'India', onLog);
  await fillByControlId(scope, 'address', data.address);
  await fillByControlId(scope, 'mobileNumber', data.mobile);
  const materialOk = await fillPortalSelect(
    scope,
    '#plasticMaterialType, select[formcontrolname="plasticMaterialType"]',
    data.materialType,
    onLog,
    'Plastic Material Type',
    PORTAL_PLASTIC_MATERIAL_VALUES,
  );
  await fillPortalSelect(
    scope,
    '#categoryOfPlastic, select[formcontrolname="categoryOfPlastic"]',
    data.category,
    onLog,
    'Category Of Plastic',
  );
  await fillPortalSelect(
    scope,
    '#financialYear, select[formcontrolname="financialYear"]',
    data.financialYear,
    onLog,
    'Financial Year',
  );
  await fillByControlId(scope, 'date', data.date);
  await fillByControlId(scope, 'totalPlasticQuantity', data.quantity);
  await fillByControlId(scope, 'recycledPlasticContent', data.recycledPercent ?? '0');
  const uploaded = data.invoiceDoc
    ? await uploadInvoiceInModal(scope, data.invoiceDoc, onLog)
    : true;

  if (!entityOk || !materialOk) {
    if (onLog) onLog('Section 5b required Entity Type / Plastic Material Type not selected — skipping submit.');
    await closeEntryModal(page, onLog);
    return false;
  }
  if (!uploaded) {
    if (onLog) onLog('Section 5b invoice PDF not attached on portal — skipping submit.');
    await closeEntryModal(page, onLog);
    return false;
  }

  const ok = await submitEntryModal(page, modal, onLog);
  if (!ok) {
    await closeEntryModal(page, onLog);
    return false;
  }
  if (onLog) onLog(`Section 5b saved: ${data.entityName || data.quantity}`);
  return true;
}

export async function fillSec5dEntryModal(page, row = {}, onLog) {
  const modal = await waitForEntryModal(
    page,
    /Sold to UnRegistered PIBOs|Plastic Raw Material.*Sold|UnRegistered PIBOs/i,
  );
  const scope = (await soldFormScope(page).isVisible({ timeout: 2000 }).catch(() => false))
    ? soldFormScope(page)
    : modal;

  if (onLog) onLog(`Filling Section 5d modal for ${row.entityName || 'sale row'}...`);

  await fillPortalSelect(
    scope,
    '#soldEntityType, select[formcontrolname="entityType"]',
    row.entityType || 'Brand Owner',
    onLog,
    'Entity Type',
    PORTAL_SEC5_ENTITY_VALUES,
  );
  await fillByControlId(scope, 'soldEntityName', row.entityName);
  await fillByControlId(scope, 'soldAddress', row.address);
  await fillNativeSelect(
    scope,
    '#soldState, select[formcontrolname="state"]',
    row.state,
    onLog,
    'State',
  );
  await fillByControlId(scope, 'soldMobileNumber', row.mobile);
  await fillPortalSelect(
    scope,
    '#soldPlasticMaterialType, select[formcontrolname="plasticMaterialType"]',
    row.materialType || 'Others',
    onLog,
    'Plastic Material Type',
    PORTAL_PLASTIC_MATERIAL_VALUES,
  );
  await fillPortalSelect(
    scope,
    '#soldCategoryOfPlastic, select[formcontrolname="categoryOfPlastic"]',
    row.category,
    onLog,
    'Category of Plastic',
  );
  await fillPortalSelect(
    scope,
    '#soldFinancialYear, select[formcontrolname="financialYear"]',
    row.financialYear,
    onLog,
    'Financial Year',
  );
  await fillByControlId(scope, 'soldGst', row.gst);
  await fillByControlId(scope, 'soldBankAccountNo', row.bankAccount);
  await fillByControlId(scope, 'soldIfscCode', row.ifsc);
  await fillByControlId(scope, 'soldGstPaid', row.gstPaid);
  await fillByControlId(scope, 'soldGstEInvoiceNumber', row.invoiceNo);
  await fillByControlId(scope, 'soldTotalPlasticQuantity', row.quantity);
  await fillByControlId(scope, 'soldRecycledPlasticContent', row.recycledPercent ?? '0');

  const uploaded = row.invoiceDoc
    ? await uploadInvoiceInModal(scope, row.invoiceDoc, onLog)
    : true;
  if (!uploaded && row.invoiceDoc) {
    if (onLog) onLog('Section 5d invoice PDF not attached — skipping submit.');
    await closeEntryModal(page, onLog);
    return false;
  }

  const ok = await submitEntryModal(page, modal, onLog);
  if (!ok) {
    await closeEntryModal(page, onLog);
    return false;
  }
  if (onLog) onLog(`Section 5d saved: ${row.entityName || row.invoiceNo || row.quantity}`);
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

  await forceCloseAllEntryModals(page, onLog);

  let filled = 0;
  for (const row of entries) {
    try {
      await forceCloseAllEntryModals(page, onLog, 4);
      const block = sectionBlock(page, /5\s*d\).*Sold to UnRegistered PIBOs/i);
      const target = (await block.isVisible({ timeout: 1500 }).catch(() => false))
        ? block
        : page.locator('.table-field').filter({ hasText: /UnRegistered PIBOs/i }).last();

      const clicked = await clickAddNewRow(target, page, onLog, 'Section 5d');
      if (!clicked) continue;

      await page.waitForTimeout(700);
      const ok = await fillSec5dEntryModal(page, row, onLog);
      if (ok) filled += 1;
    } catch (err) {
      if (onLog) onLog(`Section 5d row failed: ${err.message}`);
      await forceCloseAllEntryModals(page, onLog).catch(() => {});
    }
  }

  if (onLog) onLog(`Section 5d filled ${filled}/${entries.length} row(s).`);
  return filled > 0;
}

export async function fillPartBSection5bRows(page, rows = [], onLog) {
  const entries = Array.isArray(rows)
    ? rows.map(normalizeSec5bRowForPortal).filter((row) => row?.entityName || row?.quantity)
    : [];
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
    try {
      await ensureNoOpenEntryModal(page, onLog);
      const block = sectionBlock(page, /5\s*b\).*Non-Registered Entity|Procured from Non-Registered/i);
      const clicked = await clickAddNewRow(block, page, onLog, 'Section 5b');
      if (!clicked) continue;

      await page.waitForTimeout(700);
      const ok = await fillSec5bEntryModal(page, row, onLog);
      if (ok) {
        filled += 1;
      } else {
        await closeEntryModal(page, onLog);
      }
    } catch (err) {
      if (onLog) onLog(`Section 5b row failed: ${err.message}`);
      await closeEntryModal(page, onLog).catch(() => {});
    }
  }

  await forceCloseAllEntryModals(page, onLog);
  if (onLog) onLog(`Section 5b filled ${filled}/${entries.length} row(s).`);
  return filled > 0;
}
