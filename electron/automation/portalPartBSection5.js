import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  PORTAL_PLASTIC_MATERIAL_VALUES,
  PORTAL_SEC5_ENTITY_VALUES,
  normalizeSec5bRowForPortal,
  normalizeSec5dRowForPortal,
  toInputDate,
} from '../../shared/partBSection5.js';
import {
  getBaseNameFromPath,
  sanitizeCpcbPortalFileName,
} from '../../shared/cpcbPortalFileName.js';
import { CPCB_MAX_UPLOAD_BYTES, ensurePdfUnderMaxSize } from '../utils/pdfCompressor.js';
import {
  collectPortalAlerts,
  dismissPortalAlerts,
  waitForPortalBusy,
} from './portalErrorGuard.js';

async function fillPortalSelect(scope, selector, optionLabel, onLog, fieldName, valueMap = {}) {
  if (!optionLabel) return false;
  const page = scope.page();
  const select = scope.locator(selector).first();
  const hasSelect = (await select.count().catch(() => 0)) > 0;
  if (!hasSelect) {
    if (onLog) onLog(`${fieldName} select not found (${selector})`);
    return false;
  }

  const visible = await select.isVisible({ timeout: 2500 }).catch(() => false);
  if (!visible) {
    const inDom = await select.evaluate((el) => !!el).catch(() => false);
    if (!inDom) {
      if (onLog) onLog(`${fieldName} select not visible (${selector})`);
      return false;
    }
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
        await waitForPortalBusy(page, 12000).catch(() => {});
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
    await waitForPortalBusy(page, 12000).catch(() => {});
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
  await waitForPortalBusy(page, 15000).catch(() => {});

  const hidden = await page.evaluate(() => {
    let count = 0;
    const hide = (el) => {
      if (!(el instanceof HTMLElement)) return;
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      count += 1;
    };
    document.querySelectorAll('app-loader, .loader-wrapper, .loader-overlay').forEach(hide);
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

  const rawName = getBaseNameFromPath(filePath);
  const safeName = sanitizeCpcbPortalFileName(rawName, 'sec5_invoice');
  const tempPath = path.join(os.tmpdir(), `cpcb-sec5-${Date.now()}-${safeName}`);

  try {
    const size = fs.statSync(filePath).size;
    if (size > CPCB_MAX_UPLOAD_BYTES) {
      const result = await ensurePdfUnderMaxSize(filePath, tempPath);
      if (onLog) {
        onLog(`PDF prepared for upload (${Math.round((result.sizeBytes || size) / 1024)}KB${result.compressed ? ', compressed' : ''}).`);
        if (result.warning) onLog(result.warning);
      }
      if (result.filePath && fs.existsSync(result.filePath)) return result.filePath;
    }

    fs.copyFileSync(filePath, tempPath);
    if (onLog && safeName !== rawName) {
      onLog(`Invoice renamed for CPCB upload: ${rawName} → ${safeName}`);
    }
    return tempPath;
  } catch (err) {
    if (onLog) onLog(`PDF prepare failed: ${err.message}`);
    return filePath;
  }
}

async function clickThroughLoader(page, locator, onLog, label = 'Control') {
  await waitForPortalBusy(page, 25000);
  await locator.scrollIntoViewIfNeeded().catch(() => {});

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await waitForPortalBusy(page, 20000);
    try {
      await locator.click({ timeout: 8000 });
      return true;
    } catch (err) {
      const blocked = /intercepts pointer events|Timeout/i.test(err.message || '');
      if (blocked && attempt < 4) {
        if (onLog) onLog(`${label} blocked by portal loader — retry ${attempt}/4...`);
        await page.waitForTimeout(700);
        continue;
      }
      try {
        await locator.evaluate((el) => el.click());
        return true;
      } catch {
        if (onLog) onLog(`${label} click failed: ${err.message}`);
        return false;
      }
    }
  }
  return false;
}

async function pickSearchableCountry(page, scope, country = 'India', onLog) {
  try {
    await waitForPortalBusy(page, 20000);

    const trigger = scope.locator('#country.searchable-trigger, app-searchable-select button.searchable-trigger').first();
    if (!(await trigger.isVisible({ timeout: 2500 }).catch(() => false))) {
      return pickDropdownOption(page, scope, /Country/i, country);
    }

    const currentLabel = String(await trigger.innerText().catch(() => '') || '').trim();
    if (new RegExp(`^\\s*${String(country).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(currentLabel)) {
      if (onLog) onLog(`Country already set: ${currentLabel}`);
      return true;
    }

    const opened = await clickThroughLoader(page, trigger, onLog, 'Country dropdown');
    if (!opened) return pickDropdownOption(page, scope, /Country/i, country);

    await page.waitForTimeout(220);

    const search = page.locator(
      '.searchable-dropdown input, .searchable-panel input, .searchable-options input, input[placeholder*="Search country" i]'
    ).last();
    if (await search.isVisible({ timeout: 1200 }).catch(() => false)) {
      await search.fill('');
      await search.fill(country);
      await page.waitForTimeout(150);
    }

    const option = page.locator('.searchable-option, .dropdown-option, [role="option"], li, button, div').filter({
      hasText: new RegExp(`^\\s*${String(country).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'),
    }).first();
    if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clickThroughLoader(page, option, onLog, `Country option (${country})`);
      if (onLog) onLog(`Selected country: ${country}`);
      await waitForPortalBusy(page, 12000);
      return true;
    }

    const fallback = page.getByText(new RegExp(`^${String(country).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')).last();
    if (await fallback.isVisible({ timeout: 1200 }).catch(() => false)) {
      await clickThroughLoader(page, fallback, onLog, `Country option (${country})`);
      if (onLog) onLog(`Selected country: ${country}`);
      await waitForPortalBusy(page, 12000);
      return true;
    }
    return false;
  } catch (err) {
    if (onLog) onLog(`Country selection failed: ${err.message}`);
    return false;
  }
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

async function waitForSoldEntryModal(page, onLog, timeoutMs = 12000) {
  const sold = soldFormScope(page);
  try {
    await sold.waitFor({ state: 'visible', timeout: timeoutMs });
    await page.locator('#soldEntityName, #soldRegistrationType, #soldEntityType').first()
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .catch(() => {});
    await page.waitForTimeout(400);
  } catch {
    if (onLog) onLog('Section 5d modal (sold-modal) did not open.');
    return null;
  }

  const form = sold.locator('xpath=ancestor::form[1]').first();
  if ((await form.count().catch(() => 0)) > 0) {
    return form;
  }
  return sold;
}

async function waitForNonRegisteredEntryModal(page, onLog, timeoutMs = 12000) {
  const modal = nonRegisteredFormScope(page);
  try {
    await modal.waitFor({ state: 'visible', timeout: timeoutMs });
    await page.locator('#entityName, #entityType, #registrationType').first()
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .catch(() => {});
    await waitForPortalBusy(page, 15000);
    await page.waitForTimeout(400);
  } catch {
    if (onLog) onLog('Section 5b modal (nonregistered-modal) did not open.');
    return null;
  }

  const form = modal.locator('xpath=ancestor::form[1]').first();
  if ((await form.count().catch(() => 0)) > 0) {
    return form;
  }
  return modal;
}

async function waitForEntryModal(page, titleRegex, kind = 'auto') {
  if (kind === 'sold') {
    return waitForSoldEntryModal(page, null);
  }
  if (kind === 'nonregistered') {
    return waitForNonRegisteredEntryModal(page, null);
  }

  const sold = await waitForSoldEntryModal(page, null, 2500);
  if (sold) return sold;
  return waitForNonRegisteredEntryModal(page, null, 8000);
}

async function findVisibleUploadWrap(page) {
  const selector = [
    '.sold-modal .sold-upload-wrap',
    '.sold-modal .nonregistered-upload-wrap',
    '.nonregistered-modal .nonregistered-upload-wrap',
    'form.modal-form .sold-upload-wrap',
    'form.modal-form .nonregistered-upload-wrap',
  ].join(', ');
  const wraps = page.locator(selector);
  const count = await wraps.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const wrap = wraps.nth(i);
    if (await wrap.isVisible({ timeout: 400 }).catch(() => false)) {
      return wrap;
    }
  }
  return wraps.first();
}

async function entryModalUploadWrap(page) {
  return findVisibleUploadWrap(page);
}

function entryModalUploadButton(wrap) {
  return wrap.locator('button.upload-link-btn').first();
}

async function isUploadComplete(page, uploadPath, onLog) {
  const wrap = await entryModalUploadWrap(page);
  if (!(await wrap.isVisible({ timeout: 1500 }).catch(() => false))) {
    return false;
  }

  const text = String(await wrap.innerText().catch(() => '') || '');
  if (/Change/i.test(text) && /\.pdf/i.test(text)) {
    if (onLog) onLog(`Upload already attached in modal (${path.basename(uploadPath)}).`);
    return true;
  }

  return verifyInvoiceAttached(wrap, page, uploadPath);
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
      scope.locator('button.nonregistered-btn').first(),
      scope.locator('button.sold-btn').first(),
    );
  }
  submitCandidates.push(
    page.locator('button.nonregistered-btn, button.sold-btn').last(),
    page.getByRole('button', { name: /Submit/i }).last(),
  );

  for (const submit of submitCandidates) {
    if (!(await submit.count().catch(() => 0))) continue;
    if (!(await submit.isVisible({ timeout: 1200 }).catch(() => false))) continue;
    await waitForPortalBusy(page, 20000);
    await submit.scrollIntoViewIfNeeded().catch(() => {});
    const clicked = await clickThroughLoader(page, submit, onLog, 'Submit');
    if (!clicked) {
      await submit.evaluate((el) => el.click()).catch(() => {});
    }
    await page.waitForTimeout(900);
    if (await waitForEntryModalClosed(page, 12000)) {
      if (onLog) onLog('Entry modal submitted and closed.');
      return true;
    }

    await waitForPortalBusy(page, 15000);
    await submit.evaluate((el) => el.click()).catch(() => {});
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

async function portalUploadFailedVisible(page) {
  return page.getByText(/failed to fetch|something went wrong/i).first()
    .isVisible({ timeout: 600 })
    .catch(() => false);
}

function isCpcbUploadResponse(response) {
  const url = String(response.url() || '').toLowerCase();
  const method = String(response.request().method() || '').toUpperCase();
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return false;
  if (/upload|document|file|attachment|invoice|media|blob|storage|s3|minio/.test(url)) return true;
  const contentType = String(response.request().headers()['content-type'] || '').toLowerCase();
  return contentType.includes('multipart/form-data');
}

async function waitForCpcbUploadResponse(page, timeoutMs = 45000) {
  try {
    return await page.waitForResponse(
      (resp) => isCpcbUploadResponse(resp) && resp.status() >= 200 && resp.status() < 300,
      { timeout: timeoutMs },
    );
  } catch {
    return null;
  }
}

async function confirmUploadSucceeded(page, uploadPath, onLog, uploadResponse = null) {
  await waitForPortalBusy(page, 8000).catch(() => {});
  await page.waitForTimeout(uploadResponse ? 400 : 1200);

  const alerts = await collectPortalAlerts(page);
  const uploadAlert = alerts.find((msg) => /failed to fetch|something went wrong|invalid filename|upload failed|try again/i.test(msg));
  if (uploadAlert) {
    await dismissPortalAlerts(page, onLog);
    if (onLog) onLog(`CPCB upload rejected: ${uploadAlert}`);
    return false;
  }

  if (await portalUploadFailedVisible(page)) {
    if (onLog) onLog('CPCB upload failed — portal showed error toast.');
    return false;
  }

  if (uploadResponse) {
    if (onLog) onLog(`CPCB upload API confirmed (${uploadResponse.status()}): ${path.basename(uploadPath)}`);
    return true;
  }

  const wrap = await entryModalUploadWrap(page);
  const changeBtn = entryModalUploadButton(wrap);
  const btnText = String(await changeBtn.innerText().catch(() => '') || '').trim();
  if (/Change/i.test(btnText) && (await changeBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    if (onLog) onLog(`Upload confirmed — Change button visible: ${path.basename(uploadPath)}`);
    return true;
  }

  if (await isUploadComplete(page, uploadPath, onLog)) {
    return true;
  }

  return false;
}

async function pickFileViaChooser(page, trigger, uploadPath, onLog, label = 'Upload') {
  const responsePromise = waitForCpcbUploadResponse(page, 45000);
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      trigger.click({ timeout: 5000 }),
    ]);
    await chooser.setFiles(uploadPath);
  } catch (err) {
    if (onLog) onLog(`${label} click failed (${err.message}) — trying DOM click...`);
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        trigger.evaluate((el) => el.click()),
      ]);
      await chooser.setFiles(uploadPath);
    } catch (domErr) {
      if (onLog) onLog(`${label} file chooser failed: ${domErr.message}`);
      return null;
    }
  }

  const response = await responsePromise;
  return response;
}

async function uploadViaPortalChooser(page, uploadPath, onLog) {
  const wrap = await entryModalUploadWrap(page);
  if (!(await wrap.isVisible({ timeout: 3500 }).catch(() => false))) {
    if (onLog) onLog('Section 5 upload area not visible in modal.');
    return false;
  }

  if (await isUploadComplete(page, uploadPath, onLog)) {
    return true;
  }

  await wrap.scrollIntoViewIfNeeded().catch(() => {});

  const uploadBtn = entryModalUploadButton(wrap);
  const fileInput = wrap.locator('input[type="file"]').first();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const btnText = String(await uploadBtn.innerText().catch(() => '') || '').trim();
    const wantsUpload = /Upload/i.test(btnText) || !btnText;

    if (wantsUpload && (await uploadBtn.isVisible({ timeout: 1500 }).catch(() => false))) {
      const response = await pickFileViaChooser(
        page,
        uploadBtn,
        uploadPath,
        onLog,
        `Upload button (try ${attempt})`,
      );
      if (await confirmUploadSucceeded(page, uploadPath, onLog, response)) {
        return true;
      }
    } else if (onLog) {
      onLog(`Upload button state: "${btnText || '(empty)'}" (try ${attempt})`);
    }

    if (await fileInput.count().catch(() => 0)) {
      const responsePromise = waitForCpcbUploadResponse(page, 20000);
      try {
        await fileInput.setInputFiles(uploadPath);
        await fileInput.evaluate((el) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } catch (err) {
        if (onLog) onLog(`Hidden file input attempt ${attempt} failed: ${err.message}`);
      }
      const response = await responsePromise;
      if (await confirmUploadSucceeded(page, uploadPath, onLog, response)) {
        return true;
      }
    }

    if (onLog) onLog(`Section 5 invoice upload retry ${attempt}/2...`);
    await page.waitForTimeout(800);
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
  if (await uploadViaPortalChooser(page, uploadPath, onLog)) {
    return true;
  }

  if (onLog) {
    onLog(`Invoice upload did not complete on CPCB portal: ${path.basename(uploadPath)}`);
  }
  return false;
}

export async function fillSec5bEntryModal(page, row = {}, onLog) {
  const data = normalizeSec5bRowForPortal(row);
  const modal = await waitForNonRegisteredEntryModal(page, onLog);
  if (!modal) {
    await closeEntryModal(page, onLog);
    return false;
  }
  const scope = nonRegisteredFormScope(page);

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
  if (entityOk) {
    await waitForPortalBusy(page, 20000);
    await page.waitForTimeout(350);
  }
  await fillByControlId(scope, 'entityName', data.entityName);
  const countryOk = await pickSearchableCountry(page, scope, data.country || 'India', onLog);
  if (!countryOk && onLog) onLog(`Country not selected — continuing with default (${data.country || 'India'}).`);
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
  const data = normalizeSec5dRowForPortal(row);
  const modal = await waitForSoldEntryModal(page, onLog);
  if (!modal) {
    await closeEntryModal(page, onLog);
    return false;
  }
  const scope = soldFormScope(page);

  if (onLog) onLog(`Filling Section 5d modal for ${data.entityName || 'sale row'}...`);
  if (onLog) onLog(`Section 5d data: entity=${data.entityType}, material=${data.materialType}, pdf=${data.invoiceDoc || '(none)'}`);

  const entityOk = await fillPortalSelect(
    scope,
    '#soldEntityType, select[formcontrolname="entityType"]',
    data.entityType || 'Brand Owner',
    onLog,
    'Entity Type',
    PORTAL_SEC5_ENTITY_VALUES,
  );
  await fillByControlId(scope, 'soldEntityName', data.entityName);
  await fillByControlId(scope, 'soldAddress', data.address);
  await fillNativeSelect(
    scope,
    '#soldState, select[formcontrolname="state"]',
    data.state,
    onLog,
    'State',
  );
  await fillByControlId(scope, 'soldMobileNumber', data.mobile);
  const materialOk = await fillPortalSelect(
    scope,
    '#soldPlasticMaterialType, select[formcontrolname="plasticMaterialType"]',
    data.materialType || 'Others',
    onLog,
    'Plastic Material Type',
    PORTAL_PLASTIC_MATERIAL_VALUES,
  );
  const categoryOk = await fillPortalSelect(
    scope,
    '#soldCategoryOfPlastic, select[formcontrolname="categoryOfPlastic"]',
    data.category,
    onLog,
    'Category of Plastic',
  );
  const yearOk = await fillPortalSelect(
    scope,
    '#soldFinancialYear, select[formcontrolname="financialYear"]',
    data.financialYear,
    onLog,
    'Financial Year',
  );
  await fillByControlId(scope, 'soldGst', data.gst);
  await fillByControlId(scope, 'soldBankAccountNo', data.bankAccount);
  await fillByControlId(scope, 'soldIfscCode', data.ifsc);
  await fillByControlId(scope, 'soldGstPaid', data.gstPaid);
  await fillByControlId(scope, 'soldGstEInvoiceNumber', data.invoiceNo);
  await fillByControlId(scope, 'soldTotalPlasticQuantity', data.quantity);
  await fillByControlId(scope, 'soldRecycledPlasticContent', data.recycledPercent ?? '0');

  const uploaded = data.invoiceDoc
    ? await uploadInvoiceInModal(scope, data.invoiceDoc, onLog)
    : true;

  if (!entityOk || !materialOk || !categoryOk || !yearOk) {
    if (onLog) onLog('Section 5d required dropdowns not selected — skipping submit.');
    await closeEntryModal(page, onLog);
    return false;
  }
  if (!uploaded) {
    if (onLog) onLog('Section 5d invoice PDF not attached — skipping submit.');
    await closeEntryModal(page, onLog);
    return false;
  }

  const ok = await submitEntryModal(page, modal, onLog);
  if (!ok) {
    await closeEntryModal(page, onLog);
    return false;
  }
  if (onLog) onLog(`Section 5d saved: ${data.entityName || data.invoiceNo || data.quantity}`);
  return true;
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

      await page.waitForTimeout(1200);
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

      await waitForPortalBusy(page, 15000);
      await page.waitForTimeout(900);
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
