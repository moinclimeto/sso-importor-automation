import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  generateSimpImportDetailsExcelBuffer,
  generateSimpSupplyDetailsExcelBuffer,
  validateSimpRawMaterialSupplyAgainstImport,
  validateSimpImportCoveringRequiredYears,
  prepareSimpImportRowsForPortal,
  prepareSimpSupplyRowsForPortal,
  validateSimpSupplyPortalRows,
  SIMP_IMPORT_EXCEL_FILE_NAME,
  SIMP_SUPPLY_EXCEL_FILE_NAME,
} from '../../shared/simpRawMaterialPartB.js';
import { uploadDocumentByLabel } from './cpcbRegistration.js';
import {
  collectPortalAlerts,
  dismissPortalAlerts,
  fillUntilPortalAccepts,
  waitForPortalBusy,
} from './portalErrorGuard.js';
import { panFromGstin, unitGstMatchesCompanyPan } from '../../shared/entityRegistrationTypes.js';
import { registrationDocFileName } from '../../shared/cpcbPortalFileName.js';
import { notifyPaymentReview } from './paymentReviewBridge.js';
import { resolveSimpImportDetailsForAutomation, resolveSimpSupplyDetailsForAutomation } from './registrationPartBData.js';

function pickExistingPath(...candidates) {
  for (const c of candidates) {
    const p = String(c || '').trim();
    if (p && fs.existsSync(p)) return p;
  }
  return '';
}

function labelExactRegex(labelExact) {
  return new RegExp(`^\\s*${String(labelExact).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?\\s*$`, 'i');
}

async function uploadRowForLabel(page, labelExact) {
  const byTitle = page.locator(`label[title="${labelExact}"]`).first();
  const byText = page.locator('label').filter({ hasText: labelExactRegex(labelExact) }).first();
  const labelEl = (await byTitle.isVisible({ timeout: 600 }).catch(() => false)) ? byTitle : byText;
  await labelEl.waitFor({ state: 'visible', timeout: 8000 });
  await labelEl.scrollIntoViewIfNeeded().catch(() => {});

  const v2 = labelEl.locator('xpath=ancestor::app-input-with-upload-v2[1]');
  if (await v2.count().catch(() => 0)) return v2.first();
  const v1 = labelEl.locator('xpath=ancestor::app-input-with-upload[1]');
  if (await v1.count().catch(() => 0)) return v1.first();

  return labelEl.locator(
    'xpath=ancestor::*[.//input[@type="file"] and not(self::form) and not(self::app-simp-form-config) and not(self::body)][1]',
  ).first();
}

async function rowHasVisibleView(row) {
  const candidates = row.locator('a, button, span, div').filter({ hasText: /^\s*View\s*$/i });
  const n = await candidates.count().catch(() => 0);
  for (let i = 0; i < n; i += 1) {
    if (await candidates.nth(i).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function uploadRowForLabelContains(page, labelRe) {
  const slot = page.locator('app-input-with-upload-v2, app-input-with-upload')
    .filter({ hasText: labelRe })
    .first();
  if (await slot.count().catch(() => 0)) {
    await slot.waitFor({ state: 'visible', timeout: 10000 });
    await slot.scrollIntoViewIfNeeded().catch(() => {});
    return slot;
  }
  const labelEl = page.locator('label, .input-label').filter({ hasText: labelRe }).first();
  await labelEl.waitFor({ state: 'visible', timeout: 10000 });
  await labelEl.scrollIntoViewIfNeeded().catch(() => {});
  const v2 = labelEl.locator('xpath=ancestor::app-input-with-upload-v2[1]');
  if (await v2.count().catch(() => 0)) return v2.first();
  const v1 = labelEl.locator('xpath=ancestor::app-input-with-upload[1]');
  if (await v1.count().catch(() => 0)) return v1.first();
  return labelEl.locator(
    'xpath=ancestor::*[.//input[@type="file"] and not(self::form) and not(self::app-simp-form-config) and not(self::body)][1]',
  ).first();
}

async function uploadToInputWithUploadV2(page, labelExact, filePath, onLog, uploadBaseName = 'person_pan', options = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    if (onLog) onLog(`${labelExact}: no PDF on disk — ${filePath || '(empty path)'}`);
    return false;
  }
  const safeFile = prepareTempUploadFile(filePath, uploadBaseName);
  const contains = Boolean(options.contains);
  const labelRe = new RegExp(String(labelExact).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  let row;
  try {
    row = contains
      ? await uploadRowForLabelContains(page, labelRe)
      : await uploadRowForLabel(page, labelExact);
  } catch (err) {
    try {
      row = await uploadRowForLabelContains(page, labelRe);
    } catch (err2) {
      if (onLog) onLog(`${labelExact}: upload row not found — ${err2.message || err.message}`);
      return false;
    }
  }

  await row.scrollIntoViewIfNeeded().catch(() => {});
  if (await rowHasVisibleView(row)) {
    if (onLog) onLog(`"${labelExact}" already has View — leaving existing PDF.`);
    return true;
  }

  const fileInput = row.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 8000 });
  await fileInput.setInputFiles(safeFile);
  await fileInput.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }).catch(() => {});

  const uploadBtn = row.locator('a, button, span').filter({ hasText: /^\s*Upload\s*$/i }).first();
  if (await uploadBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    const chooserWait = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
    await uploadBtn.click({ force: true }).catch(() => {});
    const chooser = await chooserWait;
    if (chooser) await chooser.setFiles(safeFile);
  }

  await page.waitForTimeout(1200);
  await waitForPortalBusy(page, 15000);
  let viewed = await rowHasVisibleView(row);

  if (!viewed && await uploadBtn.count().catch(() => 0)) {
    const chooserWait = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await uploadBtn.click({ force: true }).catch(() => {});
    const chooser = await chooserWait;
    if (chooser) {
      await chooser.setFiles(safeFile);
      await page.waitForTimeout(1200);
      await waitForPortalBusy(page, 15000);
    }
    viewed = await rowHasVisibleView(row);
  }

  if (onLog) {
    onLog(viewed
      ? `"${labelExact}" PDF uploaded (View is visible on this slot).`
      : `"${labelExact}" PDF did not show View on this slot — portal is still waiting for this file.`);
  }
  return viewed;
}

async function uploadSlotHasView(page, labelExact) {
  try {
    const row = await uploadRowForLabel(page, labelExact);
    return rowHasVisibleView(row);
  } catch {
    return false;
  }
}

function prepareTempUploadFile(filePath, safeBaseName = 'doc') {
  if (!filePath || !fs.existsSync(filePath)) return filePath;
  const ext = path.extname(filePath).toLowerCase() || '.pdf';
  const safeName = registrationDocFileName(safeBaseName, ext);
  const safePath = path.join(os.tmpdir(), safeName.replace(/[<>:"/\\|?*]/g, '_'));
  fs.copyFileSync(filePath, safePath);
  return safePath;
}

async function setAngularValue(locator, wanted) {
  const value = String(wanted ?? '');
  if (!(await locator.isVisible({ timeout: 1500 }).catch(() => false))) return false;
  if (await locator.isDisabled().catch(() => false)) return false;
  if ((await locator.getAttribute('readonly')) !== null) return false;

  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ force: true }).catch(() => {});
  await locator.evaluate((el, next) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const assign = (v) => {
      if (setter) setter.call(el, v);
      else el.value = v;
    };
    assign('');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    assign(next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

  let actual = String(await locator.inputValue().catch(() => '')).trim();
  if (actual !== value.trim()) {
    await locator.fill(value).catch(() => {});
    await locator.dispatchEvent('input').catch(() => {});
    await locator.dispatchEvent('change').catch(() => {});
    actual = String(await locator.inputValue().catch(() => '')).trim();
  }
  await locator.blur().catch(() => {});
  actual = String(await locator.inputValue().catch(() => '')).trim();
  return actual.replace(/\s+/g, ' ') === value.trim().replace(/\s+/g, ' ');
}

function labelRegexOf(labelPattern) {
  return labelPattern instanceof RegExp ? labelPattern : new RegExp(labelPattern, 'i');
}

async function editableFieldForLabel(page, labelPattern) {
  const labelRegex = labelRegexOf(labelPattern);

  const uploadHost = page.locator('app-input-with-upload-v2').filter({
    has: page.locator('label.upload-label, label').filter({ hasText: labelRegex }),
  }).first();
  if (await uploadHost.isVisible({ timeout: 600 }).catch(() => false)) {
    const field = uploadHost.locator('input.input-field:not([readonly]):not(.input-readonly)').first();
    if (await field.isVisible({ timeout: 400 }).catch(() => false)) return field;
  }

  const inputHost = page.locator('app-custom-input').filter({
    has: page.locator('label.input-label, label').filter({ hasText: labelRegex }),
  }).first();
  if (await inputHost.isVisible({ timeout: 600 }).catch(() => false)) {
    const field = inputHost.locator('input.input-field:not([readonly]):not(.input-readonly)').first();
    if (await field.isVisible({ timeout: 400 }).catch(() => false)) return field;
  }

  const areaWrap = page.locator('div.textarea-wrapper').filter({
    has: page.locator('label.textarea-label, label').filter({ hasText: labelRegex }),
  }).first();
  if (await areaWrap.isVisible({ timeout: 600 }).catch(() => false)) {
    const field = areaWrap.locator('textarea.textarea-field:not([readonly]):not(.textarea-readonly)').first();
    if (await field.isVisible({ timeout: 400 }).catch(() => false)) return field;
  }

  return null;
}

async function fillInputByLabel(page, labelPattern, value, onLog, name) {
  if (value === undefined || value === null || value === '') return false;
  const wanted = String(value).trim();
  const field = await editableFieldForLabel(page, labelPattern);
  if (!field) {
    if (onLog) onLog(`${name}: editable portal field not found.`);
    return false;
  }
  const ok = await setAngularValue(field, wanted);
  if (onLog) onLog(ok ? `Filled ${name}: ${wanted}` : `${name} did not stick on portal (Angular did not accept value).`);
  return ok;
}

async function readFieldValue(page, labelPattern) {
  const field = await editableFieldForLabel(page, labelPattern);
  if (!field) return '';
  return String(await field.inputValue().catch(() => '')).trim();
}

async function fillNativeOrCustomSelect(page, labelPattern, optionValue, onLog, name) {
  if (!optionValue) return false;
  const wanted = String(optionValue).trim();
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelRegex = labelPattern instanceof RegExp ? labelPattern : new RegExp(labelPattern, 'i');

  // Portal already fills Type of Business / Type of Company (disabled). Never touch them.
  if (/type of business|type of company/i.test(String(name || '')) || /type of business|type of company/i.test(String(labelPattern))) {
    if (onLog) onLog(`Skipping prefilled ${name || 'select'} — already filled on portal.`);
    return false;
  }

  const customSelect = page.locator('app-custom-select').filter({
    has: page.locator('label.select-label, label').filter({ hasText: labelRegex }),
  }).first();

  if (await customSelect.isVisible({ timeout: 1500 }).catch(() => false)) {
    await customSelect.scrollIntoViewIfNeeded().catch(() => {});

    const nativeSelect = customSelect.locator('select').first();
    if (await nativeSelect.isVisible({ timeout: 500 }).catch(() => false)) {
      const disabled = await nativeSelect.isDisabled().catch(() => false);
      if (disabled) {
        if (onLog) onLog(`Skipping ${name}: select is disabled/prefilled on portal.`);
        return false;
      }
      try {
        await nativeSelect.selectOption({ label: wanted });
        await nativeSelect.dispatchEvent('change');
        if (onLog) onLog(`Selected ${name}: ${wanted}`);
        return true;
      } catch {
        try {
          await nativeSelect.selectOption({ value: wanted });
          await nativeSelect.dispatchEvent('change');
          if (onLog) onLog(`Selected ${name} by value: ${wanted}`);
          return true;
        } catch {}
      }
    }

    // Custom dropdown trigger (click to open)
    const trigger = customSelect.locator('.select-display, .custom-select-container, .select-box, .dropdown-wrapper, .select-field-wrapper, .selected-item, div[role="button"], input, span.arrow-icon, svg').first();
    if (await trigger.isVisible({ timeout: 800 }).catch(() => false)) {
      await trigger.click({ force: true }).catch(() => {});
    } else {
      await customSelect.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(350);

    // Look for option item in DOM (inside wrapper or in portal overlay)
    const optionLoc = page.locator('.option-item, .option, .dropdown-item, .ng-option, mat-option, li, div[role="option"]').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i'),
    }).first();

    if (await optionLoc.isVisible({ timeout: 2000 }).catch(() => false)) {
      await optionLoc.scrollIntoViewIfNeeded().catch(() => {});
      await optionLoc.click({ force: true });
      await page.waitForTimeout(300);
      if (onLog) onLog(`Selected ${name}: ${wanted}`);
      return true;
    }

    // Fuzzy option search
    const fuzzyOpt = page.locator('.option-item, .option, .dropdown-item, .ng-option, mat-option, li, div[role="option"], div, span').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i'),
    }).last();
    if (await fuzzyOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
      await fuzzyOpt.scrollIntoViewIfNeeded().catch(() => {});
      await fuzzyOpt.click({ force: true });
      await page.waitForTimeout(300);
      if (onLog) onLog(`Selected ${name}: ${wanted}`);
      return true;
    }

    // Press Escape to close dropdown if not matched
    await page.keyboard.press('Escape').catch(() => {});
  }

  const selects = page.locator('select:visible:not([disabled]):not(.select-readonly)');
  const count = await selects.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const s = selects.nth(i);
    if (await s.isDisabled().catch(() => true)) continue;
    const options = await s.locator('option').allTextContents().catch(() => []);
    const match = options.find((t) => new RegExp(`^\\s*${escaped}\\s*$`, 'i').test(String(t || '').trim()));
    if (match) {
      await s.selectOption({ label: match.trim() }).catch(() => {});
      await s.dispatchEvent('change').catch(() => {});
      if (onLog) onLog(`Selected ${name}: ${match.trim()}`);
      return true;
    }
  }

  return false;
}

/**
 * Uploads a document near a specific label text.
 */
async function uploadNearLabel(page, labelPattern, filePath, onLog, optional = true) {
  if (!filePath || !fs.existsSync(filePath)) {
    if (onLog && !optional) onLog(`No valid file path provided for upload near: ${labelPattern}`);
    return false;
  }
  try {
    const safeFile = prepareTempUploadFile(filePath, 'doc_upload');
    return await uploadDocumentByLabel(page, labelPattern, safeFile, onLog, { optional });
  } catch (err) {
    if (onLog) onLog(`Upload failed near ${labelPattern}: ${err.message}`);
    return false;
  }
}

async function isSimpPartAReady(page, onLog) {
  const addr = await readFieldValue(page, /Plant\s*\/\s*Unit Address/i);
  const gst = await readFieldValue(page, /Plant\/Unit GST/i);
  const cap = await readFieldValue(page, /Total Capital Invested/i);
  const cinView = await uploadSlotHasView(page, 'CIN');
  const personPanView = await uploadSlotHasView(page, 'PAN No.');
  const missing = [];
  if (!addr) missing.push('Plant / Unit Address');
  if (!gst) missing.push('Plant/Unit GST');
  if (!cap) missing.push('Capital Invested');
  if (!cinView) missing.push('CIN PDF');
  if (!personPanView) missing.push('Authorized Person PAN PDF');
  if (missing.length) {
    if (onLog) onLog(`Portal Part A still incomplete: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

async function clickSimpNextIfPartMoved(page, nextHeadingPattern, onLog) {
  const nextBtn = page.locator('button.custom-btn, app-custom-button button, button').filter({
    hasText: /^\s*(Next|Save\s*&\s*Next)\s*$/i,
  }).first();
  if (!(await nextBtn.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await nextBtn.click({ force: true });
  await page.waitForTimeout(1000);
  await waitForPortalBusy(page);
  const moved = await page.getByText(nextHeadingPattern).first().isVisible({ timeout: 4000 }).catch(() => false);
  if (!moved && onLog) onLog('Next clicked but portal did not leave this step (required fields still invalid).');
  return moved;
}

/**
 * Part A: General Information for SIMP Importer of Raw Material
 */
export async function fillSimpPartA(page, data = {}, onLog) {
  if (onLog) onLog('Filling SIMP Part A: General Information (white fields + document uploads)...');

  await page.locator('app-simp-form-config, form.application-form').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

  const plantState = data.plantState || data.unitState || data.state || (Array.isArray(data.operatingStates) ? data.operatingStates[0] : '');
  const unitGst = String(data.unitGst || '').trim();
  const commencementYear = String(data.yearOfCommencement || '').trim();
  const capitalInvested = String(data.capitalInvested || '').trim();
  const isSame = Boolean(data.isSameAsRegisteredAddress ?? data.sameAsRegisteredAddress ?? true);
  const plantAddress = String(data.plantAddress || data.registeredAddress || '').trim();

  const missingInApp = [];
  if (!String(plantState || '').trim()) missingInApp.push('Plant / Unit State');
  if (!isSame && !plantAddress) missingInApp.push('Plant / Unit Address');
  if (!unitGst) missingInApp.push('Plant/Unit GST');
  if (!commencementYear) missingInApp.push('Year of Commencement of Production');
  if (!capitalInvested) missingInApp.push('Total Capital Invested');
  if (missingInApp.length) {
    throw new Error(`SIMP Part A is incomplete in the app (${missingInApp.join(', ')}). Fill these fields on New Application, then start automation.`);
  }

  const companyPan = String(data.companyPan || data.pan || panFromGstin(data.gstin || data.gst) || '').toUpperCase();
  if (unitGst && !unitGstMatchesCompanyPan(unitGst, companyPan, data.gstin || data.gst)) {
    throw new Error(
      `Plant/Unit GST verification will fail: PAN in ${unitGst} (${panFromGstin(unitGst)}) does not match company PAN (${companyPan || panFromGstin(data.gstin)}). Enter a GSTIN for the same PAN, then retry.`,
    );
  }

  if (onLog) {
    onLog(
      'Leaving prefilled portal fields: Legal Name, Trade Name, Type of Business, Registered Address, GST number, Company PAN number, CIN number, Type of Company, Authorized Name/Designation/Mobile/Email/PAN number.',
    );
  }

  await fillNativeOrCustomSelect(page, /Plant\s*\/\s*Unit State/i, plantState, onLog, 'Plant / Unit State');

  const sameCheckbox = page.locator('#sameAsRegistered').first();
  if (await sameCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isChecked = await sameCheckbox.isChecked().catch(() => false);
    if (isSame && !isChecked) {
      await sameCheckbox.check({ force: true }).catch(() => sameCheckbox.click({ force: true }));
      if (onLog) onLog('Checked "Same as Registered Address"');
      await page.waitForTimeout(500);
    } else if (!isSame && isChecked) {
      await sameCheckbox.uncheck({ force: true }).catch(() => sameCheckbox.click({ force: true }));
      if (onLog) onLog('Unchecked "Same as Registered Address"');
      await page.waitForTimeout(500);
    }
  }

  let addrOnPortal = await readFieldValue(page, /Plant\s*\/\s*Unit Address/i);
  if (!addrOnPortal && plantAddress) {
    await fillInputByLabel(page, /Plant\s*\/\s*Unit Address/i, plantAddress, onLog, 'Plant / Unit Address');
  }

  await fillInputByLabel(page, /Plant\/Unit GST/i, unitGst, onLog, 'Plant / Unit GST');
  await fillNativeOrCustomSelect(page, /Year of Commencement/i, commencementYear, onLog, 'Year of Commencement');
  await fillInputByLabel(page, /Total Capital Invested|Capital Invested/i, capitalInvested, onLog, 'Capital Invested (Rs in Crores)');

  const dicRegistered = /^yes$/i.test(String(data.dicRegistered || '')) ? 'Yes' : 'No';
  await fillNativeOrCustomSelect(page, /Registered with the DIC or DCSSI/i, dicRegistered, onLog, 'DIC / DCSSI Registration');

  const gstDoc = pickExistingPath(data.gstDoc, data.gstinDoc, data.gstDocumentPath);
  const unitGstDoc = pickExistingPath(data.unitGstDoc);
  const panDoc = pickExistingPath(data.companyPanDoc, data.panDoc, data.companyPanDocumentPath, data.panDocumentPath);
  const cinDoc = pickExistingPath(data.cinDoc, data.cinDocumentPath);
  const dicDoc = pickExistingPath(data.dicRegistrationDoc);
  const personPanDoc = pickExistingPath(data.personPanDoc, data.authPanDoc, data.personPanDocumentPath);

  if (gstDoc) {
    await uploadToInputWithUploadV2(page, 'GST', gstDoc, onLog, 'gst');
  }
  if (unitGstDoc) {
    await uploadToInputWithUploadV2(page, 'Plant/Unit GST', unitGstDoc, onLog, 'unit_gst');
  }
  if (panDoc) {
    await uploadToInputWithUploadV2(page, 'Company PAN', panDoc, onLog, 'company_pan');
  }
  if (!cinDoc) {
    throw new Error('Company CIN PDF is missing in the app. Upload CIN on New Application, then start automation.');
  }
  const cinOk = await uploadToInputWithUploadV2(page, 'CIN', cinDoc, onLog, 'cin');
  if (!cinOk) {
    throw new Error('Company CIN PDF did not attach on the portal CIN slot. Check the cin file and retry.');
  }
  if (dicRegistered === 'Yes' && dicDoc) {
    await uploadNearLabel(page, 'Supporting Document', dicDoc, onLog, true);
  } else if (onLog && dicRegistered !== 'Yes') {
    onLog('DIC / DCSSI is No — skipping supporting document upload.');
  }

  const authHeading = page.getByRole('heading', { name: /Authorized Person details/i }).or(
    page.getByText(/Authorized Person details/i)
  ).first();
  await authHeading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  if (!personPanDoc) {
    throw new Error('Authorized Person PAN PDF is missing in the app. Upload person PAN on New Application, then start automation.');
  }
  const panOk = await uploadToInputWithUploadV2(page, 'PAN No.', personPanDoc, onLog, 'person_pan');
  if (!panOk) {
    throw new Error('Authorized Person PAN PDF did not attach on the portal PAN No. slot. Check the person_pan file and retry.');
  }

  await page.waitForTimeout(1000);
  if (onLog) onLog('Part A (SIMP) white fields and document uploads completed.');
}

/**
 * CPCB SIMP Part B: click the matching table's Upload Excel → attach .xlsx in app-upload-excel → Upload.
 * Must not reuse leftover PDF file inputs from Part A (`doc_upload.pdf`).
 */
async function closeExcelUploadModal(page) {
  const modal = page.locator('app-upload-excel').filter({ hasText: /Upload Excel|Choose File/i });
  if (!(await modal.first().isVisible({ timeout: 400 }).catch(() => false))) return;
  const closeBtn = modal.locator('button, a, span, i').filter({ hasText: /^\s*(×|x|Close)\s*$/i }).first();
  if (await closeBtn.isVisible({ timeout: 400 }).catch(() => false)) {
    await closeBtn.click({ force: true }).catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await modal.first().waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
}

async function clickTableUploadExcel(page, sectionText, onLog, sectionName) {
  const heading = page.getByText(sectionText).first();
  await heading.waitFor({ state: 'visible', timeout: 15000 });
  await heading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);

  const followingBtn = heading.locator(
    'xpath=following::button[contains(normalize-space(.), "Upload Excel")][1]',
  );
  if (await followingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await followingBtn.click({ force: true });
    return;
  }

  const buttons = page.getByRole('button', { name: /^\s*Upload Excel\s*$/i });
  const count = await buttons.count().catch(() => 0);
  const index = /producers|supplied|sales/i.test(sectionName) ? Math.min(1, Math.max(0, count - 1)) : 0;
  if (count < 1) throw new Error(`No Upload Excel button found for ${sectionName}`);
  await buttons.nth(index).click({ force: true });
  if (onLog) onLog(`Opened Excel modal for ${sectionName} (Upload Excel #${index + 1} of ${count}).`);
}

async function attachXlsxInExcelModal(page, tempPath, onLog, sectionName) {
  const modal = page.locator('app-upload-excel').filter({
    hasText: /Upload Excel|Choose File|Download Excel Template/i,
  }).last();
  await modal.waitFor({ state: 'visible', timeout: 12000 });

  const inputs = modal.locator('input[type="file"]');
  const inputCount = await inputs.count();
  let excelInput = null;
  for (let i = 0; i < inputCount; i += 1) {
    const input = inputs.nth(i);
    const accept = String(await input.getAttribute('accept') || '');
    if (/pdf/i.test(accept) && !/xls|sheet|excel|csv/i.test(accept)) continue;
    excelInput = input;
    if (/xls|sheet|excel|csv/i.test(accept)) break;
  }
  if (!excelInput && inputCount) excelInput = inputs.last();
  if (!excelInput) {
    throw new Error(`${sectionName}: Excel modal has no file input`);
  }

  await excelInput.setInputFiles([]);
  await excelInput.setInputFiles(tempPath);
  await excelInput.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }).catch(() => {});
  await page.waitForTimeout(400);

  let shown = await modal.innerText().catch(() => '');
  if (!/\.xlsx|\.xls/i.test(shown)) {
    const chooserWait = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
    const chooseBtn = modal.getByText(/Choose File/i).first();
    if (await chooseBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await chooseBtn.click({ force: true }).catch(() => {});
    }
    const chooser = await chooserWait;
    if (chooser) await chooser.setFiles(tempPath);
    await page.waitForTimeout(400);
    shown = await modal.innerText().catch(() => '');
  }

  if (/\.pdf\b/i.test(shown) && !/\.xlsx|\.xls/i.test(shown)) {
    throw new Error(
      `${sectionName}: portal Excel modal still shows a PDF (doc_upload.pdf) instead of ${path.basename(tempPath)}.`,
    );
  }
  if (onLog) onLog(`${sectionName}: Excel file attached (${path.basename(tempPath)}).`);

  const uploadBtn = modal.locator('button').filter({ hasText: /^\s*Upload\s*$/i }).first();
  await uploadBtn.click({ force: true });
  await page.waitForTimeout(1200);
  await waitForPortalBusy(page, 25000);
  await modal.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

async function uploadExcelViaPortalModal(page, sectionText, excelBuffer, tempFileName, onLog, sectionName) {
  const stamp = Date.now();
  const safeName = String(tempFileName || 'simp-part-b.xlsx').replace(/[<>:"/\\|?*]/g, '_');
  const tempPath = path.join(os.tmpdir(), `${stamp}-${safeName}`);
  fs.writeFileSync(tempPath, Buffer.from(excelBuffer));

  try {
    await closeExcelUploadModal(page);
    await clickTableUploadExcel(page, sectionText, onLog, sectionName);
    await attachXlsxInExcelModal(page, tempPath, onLog, sectionName);

    const alerts = await collectPortalAlerts(page);
    if (alerts.length) {
      throw new Error(alerts[0]);
    }
    if (onLog) onLog(`Uploaded Excel for ${sectionName}: ${path.basename(tempPath)}`);
    return true;
  } catch (err) {
    if (onLog) onLog(`Excel upload failed for ${sectionName}: ${err.message}`);
    throw err;
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

/**
 * Part B: Bulk Data Upload for SIMP Importer of Raw Material
 */
export async function fillSimpPartB(page, data = {}, onLog) {
  if (onLog) onLog('Filling SIMP Part B: Bulk Data Upload (Import & Supply)...');

  const importRows = prepareSimpImportRowsForPortal(
    await resolveSimpImportDetailsForAutomation({
      existing: data.simpImportDetails,
      gstin: data.gstin || data.unitGst || '',
      onLog,
    }),
    { fallbackContact: data.mobile || data.authMobile || '' },
  );
  const supplyRows = prepareSimpSupplyRowsForPortal(
    await resolveSimpSupplyDetailsForAutomation({
      existing: data.simpSupplyDetails,
      gstin: data.gstin || data.unitGst || '',
      onLog,
    }),
    { fallbackContact: data.mobile || data.authMobile || '' },
  );

  const yearIssues = validateSimpImportCoveringRequiredYears(importRows);
  if (yearIssues.length) {
    throw new Error(yearIssues.map((issue) => issue.message).join(' | '));
  }

  const supplyFieldIssues = validateSimpSupplyPortalRows(supplyRows);
  if (supplyFieldIssues.length) {
    throw new Error(supplyFieldIssues.map((issue) => issue.message).join(' | '));
  }

  const validationIssues = validateSimpRawMaterialSupplyAgainstImport(importRows, supplyRows);
  if (validationIssues.length > 0) {
    const errorMsg = validationIssues.map((i) => i.message).join(' | ');
    if (onLog) onLog(`SIMP Part B Validation Error: ${errorMsg}`);
    throw new Error(`SIMP Part B Validation Failed: ${errorMsg}`);
  }

  if (importRows.length > 0) {
    if (onLog) onLog(`Generating Import Details Excel for ${importRows.length} record(s)...`);
    const importExcel = await generateSimpImportDetailsExcelBuffer(importRows);
    await uploadExcelViaPortalModal(
      page,
      /Import Details of last two Financial Years/i,
      importExcel,
      SIMP_IMPORT_EXCEL_FILE_NAME,
      onLog,
      'Import Details',
    );
  } else if (onLog) {
    onLog('No Import Details records to upload.');
  }

  if (!supplyRows.length) {
    throw new Error(
      'SIMP Part B sales table is empty. CPCB needs at least one row in “List of Producers and Quantum of Raw Materials supplied…”. Add sales rows in Part B (or publish Doc Processor sales), then Register again.',
    );
  }
  if (onLog) onLog(`Generating Importer Sales Excel for ${supplyRows.length} record(s)...`);
  const supplyExcel = await generateSimpSupplyDetailsExcelBuffer(supplyRows, {
    fallbackContact: data.mobile || data.authMobile || '',
  });
  await uploadExcelViaPortalModal(
    page,
    /List of Producers and Quantum of Raw Materials supplied|Producers and Quantum/i,
    supplyExcel,
    SIMP_SUPPLY_EXCEL_FILE_NAME,
    onLog,
    'Producers/Sellers Supplied',
  );

  await page.waitForTimeout(1500);
  if (onLog) onLog('Part B (SIMP) bulk upload completed.');
}

async function isSimpPartCReady(page, onLog) {
  try {
    const row = await uploadRowForLabelContains(page, /Please Upload Signature|Signature \(Only PDF File\)/i);
    const viewed = await rowHasVisibleView(row);
    if (!viewed && onLog) onLog('Part C Signature still has no View — portal will block Confirm.');
    return viewed;
  } catch (err) {
    if (onLog) onLog(`Part C Signature slot not found: ${err.message}`);
    return false;
  }
}

async function submitApplicationModalVisible(page) {
  const dialog = page.getByRole('dialog').filter({
    hasText: /Submit Application|Do you want to submit application/i,
  }).first();
  if (await dialog.isVisible({ timeout: 800 }).catch(() => false)) return true;
  return page.locator('button.submit-pay-btn:not(.submit-pay-btn-no)').filter({
    hasText: /^\s*Yes\s*$/i,
  }).first().isVisible({ timeout: 400 }).catch(() => false);
}

async function stillOnSimpPartC(page) {
  if (await submitApplicationModalVisible(page)) return false;
  const url = String(page.url() || '');
  if (/payment-breakdown|payu|webcheckoutpro/i.test(url)) return false;
  const gps = await page.getByText(/GPS Location of the unit/i).first().isVisible({ timeout: 1500 }).catch(() => false);
  return gps && /simp\/importer\/application/i.test(url);
}

async function locateSimpPartCConfirmButton(page) {
  const afterBack = page.locator('app-custom-button').filter({ hasText: /^\s*Back\s*$/i }).locator(
    'xpath=following::app-custom-button[1]',
  ).locator('button.custom-btn, button').filter({ hasText: /^\s*Confirm\s*$/i }).first();
  if (await afterBack.count().catch(() => 0)) return afterBack;

  const host = page.locator('app-custom-button').filter({
    has: page.locator('button.custom-btn.btn-primary, button.custom-btn'),
  }).filter({ hasText: /^\s*Confirm\s*$/i }).last();
  const inner = host.locator('button.custom-btn, button').first();
  if (await inner.count().catch(() => 0)) return inner;

  return page.getByRole('button', { name: /^\s*Confirm\s*$/i }).last();
}

async function fireAngularClick(locator) {
  await locator.evaluate((el) => {
    const host = el.closest('app-custom-button') || el;
    const btn = el.tagName === 'BUTTON' ? el : (host.querySelector('button') || el);
    const fire = (node) => {
      if (!node) return;
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, composed: true }));
      if (typeof node.click === 'function') node.click();
    };
    fire(btn);
    if (host !== btn) fire(host);
  }).catch(() => {});
}

async function clickSubmitApplicationYes(page, onLog, timeoutMs = 20000) {
  const yes = page.locator('button.submit-pay-btn:not(.submit-pay-btn-no)').filter({
    hasText: /^\s*Yes\s*$/i,
  }).first().or(page.getByRole('button', { name: /^\s*Yes\s*$/i }).last());

  const prompt = page.getByText(/Do you want to submit application/i).first();
  const title = page.getByText(/Submit Application/i).first();
  const appeared = await yes.isVisible({ timeout: timeoutMs }).catch(() => false)
    || await prompt.isVisible({ timeout: 1500 }).catch(() => false)
    || await title.isVisible({ timeout: 1500 }).catch(() => false);
  if (!appeared) return false;

  if (!(await yes.isVisible({ timeout: 4000 }).catch(() => false))) return false;
  await yes.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await yes.click({ timeout: 8000 });
  } catch {
    await yes.click({ force: true }).catch(() => {});
    await yes.evaluate((el) => el.click()).catch(() => {});
  }
  if (onLog) onLog('Clicked Yes on Submit Application popup.');
  notifyPaymentReview({
    step: 'submit-modal',
    message: 'Submit Application — Yes clicked. Opening payment page…',
  });
  await page.waitForTimeout(1000);
  await waitForPortalBusy(page, 30000);
  return true;
}

async function clickSimpPartCConfirm(page, onLog) {
  await waitForPortalBusy(page, 15000);

  if (await clickSubmitApplicationYes(page, onLog, 1500)) return true;
  if (/payment-breakdown/i.test(page.url())) return true;

  const confirmBtn = await locateSimpPartCConfirmButton(page);
  await confirmBtn.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  if (!(await confirmBtn.count().catch(() => 0))) {
    if (onLog) onLog('Part C Confirm button not found.');
    return false;
  }

  await confirmBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  const disabled = await confirmBtn.isDisabled().catch(() => false);
  if (disabled) {
    if (onLog) onLog('Part C Confirm is disabled — portal is still waiting for a required field.');
    return false;
  }

  if (onLog) onLog('Clicking Part C Confirm...');
  try {
    await confirmBtn.click({ timeout: 5000 });
  } catch {
    const box = await confirmBtn.boundingBox().catch(() => null);
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    else await confirmBtn.click({ force: true, timeout: 4000 }).catch(() => {});
  }

  await page.waitForTimeout(800);
  await waitForPortalBusy(page, 30000);

  if (await clickSubmitApplicationYes(page, onLog, 18000)) return true;

  if (/payment-breakdown/i.test(page.url())) {
    if (onLog) onLog('Confirm accepted — payment-breakdown page opened.');
    return true;
  }

  if (/\/onboarding\/applications/i.test(page.url())) {
    if (onLog) onLog('Confirm saved a DRAFT. Opening it from Applications list for payment…');
    return true;
  }

  if (onLog) onLog('Still on Part C after Confirm. Portal did not show Submit Application.');
  return false;
}

/**
 * Part C: GPS Location & Documents for SIMP Importer of Raw Material
 */
export async function fillSimpPartC(page, data = {}, onLog) {
  if (onLog) onLog('Filling SIMP Part C: GPS Location & Documents...');

  await page.waitForTimeout(800);
  await waitForPortalBusy(page, 15000);
  await page.getByText(/GPS Location of the unit|Please Upload Signature|Cover Letter/i)
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .catch(() => {});

  const latitude = String(data.latitude || data.lat || '').trim();
  const longitude = String(data.longitude || data.lng || data.long || '').trim();

  if (latitude) {
    await fillInputByLabel(page, /Latitude/i, latitude, onLog, 'GPS Latitude');
  }
  if (longitude) {
    await fillInputByLabel(page, /Longitude/i, longitude, onLog, 'GPS Longitude');
  }

  const coverLetter = pickExistingPath(
    data.partCCoveringLetter,
    data.coveringLetter,
    data.coveringLetterDoc,
  );
  const signature = pickExistingPath(
    data.partCSignature,
    data.signature,
    data.signatureDoc,
    data.signaturePath,
  );
  const selfDeclaration = pickExistingPath(
    data.partCAuditedStatement,
    data.selfDeclaration,
    data.auditedStatement,
    data.selfDeclarationDoc,
  );

  if (coverLetter) {
    await uploadToInputWithUploadV2(page, 'Cover Letter', coverLetter, onLog, 'covering_letter', { contains: true });
  }

  if (!signature) {
    throw new Error('Part C Signature PDF is missing in the app. Upload Signature on Part C, then Register again.');
  }
  const signatureOk = await uploadToInputWithUploadV2(
    page,
    'Please Upload Signature',
    signature,
    onLog,
    'signature',
    { contains: true },
  );
  if (!signatureOk) {
    const retry = await uploadToInputWithUploadV2(
      page,
      'Signature (Only PDF File)',
      signature,
      onLog,
      'signature',
      { contains: true },
    );
    if (!retry) {
      throw new Error('Part C Signature did not attach on CPCB (View is still missing). Check the signature PDF and retry.');
    }
  }

  if (selfDeclaration) {
    await uploadToInputWithUploadV2(
      page,
      'Self Declaration',
      selfDeclaration,
      onLog,
      'self_declaration',
      { contains: true },
    );
  }

  await page.waitForTimeout(800);
  if (onLog) onLog('Part C (SIMP) location & documents filled.');
}

import { getDb } from '../db/database.js';

/**
 * Complete SIMP Importer of Raw Material Registration Flow
 */
export async function runSimpRawMaterialApplicationFlow(page, formData = {}, onLog) {
  if (onLog) onLog('Starting SIMP -> Importer of Raw Material application flow...');

  // Merge latest documents from database
  let mergedData = { ...formData };
  try {
    const db = getDb();
    const docs = await db.all('SELECT doc_type, file_path, document_number FROM company_documents ORDER BY created_at DESC');
    if (docs && docs.length) {
      const companyPanDoc = docs.find((d) => d.doc_type === 'company_pan');
      const personPanDoc = docs.find((d) => d.doc_type === 'person_pan');
      const gstDoc = docs.find((d) => d.doc_type === 'gst');
      const unitGstDoc = docs.find((d) => d.doc_type === 'unit_gst');
      const cinDoc = docs.find((d) => d.doc_type === 'cin');
      const udyamDoc = docs.find((d) => d.doc_type === 'udyam' || d.doc_type === 'supporting_category_doc');
      const dicDoc = docs.find((d) => d.doc_type === 'dic' || d.doc_type === 'dic_registration');
      const coverDoc = docs.find((d) => d.doc_type === 'covering_letter');
      const signDoc = docs.find((d) => d.doc_type === 'signature');
      const selfDeclDoc = docs.find((d) => d.doc_type === 'self_declaration');

      mergedData = {
        ...mergedData,
        companyPanDoc: pickExistingPath(mergedData.companyPanDoc, mergedData.companyPanDocumentPath, mergedData.panDoc, companyPanDoc?.file_path),
        personPanDoc: pickExistingPath(mergedData.personPanDoc, mergedData.personPanDocumentPath, mergedData.authPanDoc, personPanDoc?.file_path),
        gstDoc: pickExistingPath(mergedData.gstDoc, mergedData.gstinDoc, mergedData.gstDocumentPath, gstDoc?.file_path),
        unitGstDoc: pickExistingPath(mergedData.unitGstDoc, unitGstDoc?.file_path),
        cinDoc: pickExistingPath(mergedData.cinDoc, mergedData.cinDocumentPath, cinDoc?.file_path),
        cinDocumentPath: pickExistingPath(mergedData.cinDocumentPath, mergedData.cinDoc, cinDoc?.file_path),
        typeOfCompanyDoc: pickExistingPath(mergedData.typeOfCompanyDoc, udyamDoc?.file_path),
        dicRegistrationDoc: pickExistingPath(mergedData.dicRegistrationDoc, dicDoc?.file_path),
        partCCoveringLetter: pickExistingPath(mergedData.partCCoveringLetter, coverDoc?.file_path),
        partCSignature: pickExistingPath(mergedData.partCSignature, signDoc?.file_path),
        partCAuditedStatement: pickExistingPath(mergedData.partCAuditedStatement, selfDeclDoc?.file_path),
        companyPan: companyPanDoc?.document_number || mergedData.companyPan,
        personPan: personPanDoc?.document_number || mergedData.personPan,
        gstin: gstDoc?.document_number || mergedData.gstin,
        unitGst: mergedData.unitGst || unitGstDoc?.document_number,
        cin: cinDoc?.document_number || mergedData.cin,
      };
    }
  } catch (dbErr) {
    if (onLog) onLog(`Note: DB document lookup skipped: ${dbErr.message}`);
  }

  // Step 1: Part A
  await fillUntilPortalAccepts(page, {
    stepName: 'Part A (SIMP)',
    onLog,
    fillFn: () => fillSimpPartA(page, mergedData, onLog),
    isReadyFn: () => isSimpPartAReady(page, onLog),
    saveFn: () => clickSimpNextIfPartMoved(page, /Import Details of last two Financial Years|Import Details/i, onLog),
  });

  // Step 2: Part B
  await fillUntilPortalAccepts(page, {
    stepName: 'Part B (SIMP)',
    onLog,
    fillFn: () => fillSimpPartB(page, mergedData, onLog),
    saveFn: () => clickSimpNextIfPartMoved(page, /GPS Location|Latitude|Cover Letter|Part C/i, onLog),
  });

  // Step 3: Part C Confirm, then payment (or resume latest DRAFT)
  try {
    await fillUntilPortalAccepts(page, {
      stepName: 'Part C (SIMP)',
      onLog,
      fillFn: () => fillSimpPartC(page, mergedData, onLog),
      isReadyFn: () => isSimpPartCReady(page, onLog),
      saveFn: () => clickSimpPartCConfirm(page, onLog),
    });
  } catch (err) {
    if (onLog) onLog(`Part C did not submit from the form (${err.message}). Continuing from Applications / DRAFT…`);
  }

  await continueSimpPaymentFromCurrentPage(page, onLog);
}

async function continueSimpPaymentFromCurrentPage(page, onLog) {
  const { handlePaymentPopupsAndOpenPayu } = await import('./fillRegistrationForms.js');
  const { openFirstDraftApplication } = await import('./resumeDraftApplication.js');

  if (/payment-breakdown/i.test(page.url())) {
    if (onLog) onLog('Already on payment-breakdown. Continuing payment…');
    await handlePaymentPopupsAndOpenPayu(page, onLog);
    return;
  }

  if (await clickSubmitApplicationYes(page, onLog, 2500)) {
    await handlePaymentPopupsAndOpenPayu(page, onLog);
    return;
  }

  const onAppsList = /\/onboarding\/applications/i.test(page.url())
    || await page.getByText(/Application for Importer Facility|All Application/i).first().isVisible({ timeout: 2000 }).catch(() => false);

  if (onAppsList) {
    if (onLog) onLog('Opening latest DRAFT from Applications list to finish payment…');
    notifyPaymentReview({
      step: 'draft-resume',
      message: 'Draft saved. Opening latest DRAFT to continue payment…',
    });
    await openFirstDraftApplication(page, onLog, { rowIndex: 0 });
  }

  const partCTab = page.getByText(/Part C:\s*Signature/i).first();
  if (await partCTab.isVisible({ timeout: 8000 }).catch(() => false)) {
    if (onLog) onLog('Opening Part C: Signature on the draft…');
    await partCTab.click();
    await waitForPortalBusy(page, 20000);
    await page.waitForTimeout(800);
  }

  if (/payment-breakdown/i.test(page.url())) {
    await handlePaymentPopupsAndOpenPayu(page, onLog);
    return;
  }

  const confirmBtn = page.locator('button.custom-btn, app-custom-button button').filter({
    hasText: /^\s*Confirm\s*$/i,
  }).first();
  if (await confirmBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
    await clickSimpPartCConfirm(page, onLog);
  }

  if (onLog) onLog('Submitting application and opening payment…');
  await handlePaymentPopupsAndOpenPayu(page, onLog);
}
