import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { withRegistrationDummyFallback, resolveRegistrationLoginCredentials } from '../db/registrationDummyData.js';
import { saveRegistrationDetails } from '../db/registrationDb.js';
import { ensurePdfUnderMaxSize } from '../utils/pdfCompressor.js';
import { getDb } from '../db/database.js';
import {
  getCaptchaImageDataUrl,
  fillCaptchaField,
  refreshCaptcha,
  attachCaptchaNetworkListenerToContext,
} from '../ocr_captcha/captchaPortal.js';
import { CPCB_CHROMIUM_ARGS, prepareCpcbBrowserPage } from './cpcbBrowserLaunch.js';
import {
  evaluateGstDetailsResponse,
  evaluateCompaniesApiResponse,
  formatInvalidGstError,
  isDuplicateAuthPersonMessage,
} from '../utils/cpcbGstVerify.js';
import {
  collectPortalAlerts,
  dismissPortalAlerts,
  isBlockingPortalError,
  waitForPortalBusy,
} from './portalErrorGuard.js';
import { harvestPortalToasts } from './portalToastWatcher.js';
import {
  fillPlasticConsumedGrid,
  resolvePlasticConsumedYears,
} from './portalPlasticConsumed.js';
import { getImporterReportingFinancialYears } from '../../shared/financialYearScope.js';
import {
  getBaseNameFromPath,
  registrationDocFileName,
  sanitizeCpcbPortalFileName,
} from '../../shared/cpcbPortalFileName.js';

let regBrowser = null;
let regContext = null;
let regPage = null;
let regMobile = null;
let regPayload = null;

function buildRegistrationDbPayload(ceprId, screenshotPath) {
  const data = regPayload || {};
  const loginCreds = resolveRegistrationLoginCredentials({
    email: data.email,
    mobile: data.mobile ?? regMobile,
    password: data.password,
  });
  return {
    applicant_type: 'PIBO',
    sub_applicant_type: 'Importer',
    cepr_id: ceprId,
    success_screenshot_path: screenshotPath,
    email: loginCreds.email,
    mobile: loginCreds.mobile,
    password: loginCreds.password,
    form_data_json: JSON.stringify({
      email: loginCreds.email,
      mobile: loginCreds.mobile,
      generalInfo: {
        typeOfBusiness: data.typeOfBusiness,
        typeOfCompany: data.typeOfCompany,
        registeredAddressLine1: data.registeredAddressLine1 || data.registeredAddress,
        registeredAddressLine2: data.registeredAddressLine2,
        district: data.district,
        stateUt: data.stateUt,
        cin: data.cin,
        authDesignation: data.authDesignation,
        password: loginCreds.password,
        confirmPassword: loginCreds.password,
        plasticConsumed: data.plasticConsumed,
        complianceStatus: data.complianceStatus,
        thicknessOfPlastic: data.thicknessOfPlastic,
      },
      autoData: {
        gstin: data.gstin,
        companyPan: data.companyPan,
        companyName: data.companyName,
        legalName: data.legalName,
        dateOfEstablishment: data.dateOfEstablishment,
        authPan: data.authPan,
        authName: data.authName,
        authDob: data.authDob,
        constitutionOfBusiness: data.constitutionOfBusiness,
        registeredAddress: data.registeredAddress,
        district: data.district,
        cin: data.cin,
        ctoNumber: data.ctoNumber,
        ctoValidity: data.ctoValidity,
        dateOfCommencement: data.dateOfCommencement,
      },
    }),
  };
}

const REGISTRATION_URL = 'https://epr.cpcb.gov.in/registration';

async function gotoCpcb(page, url, onLog, attempts = 3) {
  let lastError = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (onLog) onLog(`Opening CPCB portal (try ${i}/${attempts})...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(1500);
      return;
    } catch (err) {
      lastError = err;
      const timedOut = /TIMEOUT|ERR_CONNECTION|net::/i.test(err.message || '');
      if (onLog) onLog(`Portal navigation failed: ${err.message}`);
      if (!timedOut || i === attempts) break;
      if (onLog) onLog('Retrying CPCB portal in 3s...');
      await page.waitForTimeout(3000);
    }
  }
  throw new Error(
    `CPCB portal did not open (${url}). Check internet / VPN and that https://epr.cpcb.gov.in is reachable. Last error: ${lastError?.message || 'timeout'}`
  );
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function portalInput(page, formControlName) {
  return page.locator(`app-input[formcontrolname="${formControlName}"] input`).first();
}

function portalSelect(page, formControlName) {
  return page.locator(`app-input-select[formcontrolname="${formControlName}"] select`).first();
}

async function fillPortalInput(page, formControlName, value, onLog, label) {
  if (!value?.trim()) return;
  if (onLog) onLog(`Filling ${label || formControlName}...`);

  const input = portalInput(page, formControlName);
  await input.waitFor({ state: 'visible', timeout: 10000 });

  const editable = await input.isEditable().catch(() => false);
  if (!editable) {
    if (onLog) onLog(`${label || formControlName} is read-only — skipping`);
    return;
  }

  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.fill('');
  await input.pressSequentially(value.trim(), { delay: 25 });
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await input.blur();
  await page.waitForTimeout(300);
}

async function selectPortalDropdown(page, formControlName, optionText, onLog, label) {
  if (!optionText?.trim()) return;
  if (onLog) onLog(`Selecting ${label || formControlName}: ${optionText}`);

  const select = portalSelect(page, formControlName);
  await select.waitFor({ state: 'visible', timeout: 10000 });

  const ok = await selectDropdownOption(page, select, optionText);
  if (!ok) {
    throw new Error(`Could not select "${optionText}" for ${label || formControlName}`);
  }
  await page.waitForTimeout(800);
}

/** Find input or select near a visible label on the CPCB portal (fallback). */
async function findFieldByLabel(page, labelPattern) {
  const byLabel = page.getByLabel(labelPattern);
  if ((await byLabel.count()) > 0 && (await byLabel.first().isVisible().catch(() => false))) {
    const tag = await byLabel.first().evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
    return { type: tag === 'select' ? 'select' : 'input', locator: byLabel.first() };
  }

  const labelEl = page.locator('label').filter({ hasText: labelPattern }).first();

  if ((await labelEl.count()) === 0) return null;
  await labelEl.scrollIntoViewIfNeeded().catch(() => {});

  const appField = labelEl.locator('xpath=ancestor::app-input[1] | ancestor::app-input-select[1]').first();
  if ((await appField.count()) > 0) {
    const select = appField.locator('select').first();
    if ((await select.count()) > 0 && (await select.isVisible().catch(() => false))) {
      return { type: 'select', locator: select };
    }
    const input = appField.locator('input:not([type="hidden"])').first();
    if ((await input.count()) > 0 && (await input.isVisible().catch(() => false))) {
      return { type: 'input', locator: input };
    }
  }

  for (let level = 1; level <= 7; level += 1) {
    let container = labelEl;
    for (let i = 0; i < level; i += 1) {
      container = container.locator('xpath=..');
    }

    const select = container.locator('select, mat-select, [role="combobox"]').first();
    if ((await select.count()) > 0 && (await select.isVisible().catch(() => false))) {
      return { type: 'select', locator: select };
    }

    const input = container
      .locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
      .first();
    if ((await input.count()) > 0 && (await input.isVisible().catch(() => false))) {
      return { type: 'input', locator: input };
    }
  }

  return null;
}

async function selectDropdownOption(page, selectLocator, optionText) {
  if (!optionText?.trim()) return false;

  const tagName = await selectLocator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');

  if (tagName === 'select') {
    try {
      await selectLocator.selectOption({ label: optionText });
      return true;
    } catch {
      try {
        await selectLocator.selectOption({ label: new RegExp(escapeRegex(optionText), 'i') });
        return true;
      } catch {
        /* fall through to custom dropdown */
      }
    }
  }

  await selectLocator.scrollIntoViewIfNeeded().catch(() => {});
  await selectLocator.click();
  await page.waitForTimeout(600);

  const optionLocator = page.locator('mat-option, .mat-option, [role="option"], li, option').filter({
    hasText: new RegExp(`^\\s*${escapeRegex(optionText)}\\s*$`, 'i'),
  });

  if ((await optionLocator.count()) > 0) {
    await optionLocator.first().click();
    return true;
  }

  const partialLocator = page.locator('mat-option, .mat-option, [role="option"], li, option').filter({
    hasText: new RegExp(escapeRegex(optionText), 'i'),
  });

  if ((await partialLocator.count()) > 0) {
    await partialLocator.first().click();
    return true;
  }

  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

async function selectByLabel(page, labelPattern, optionText, onLog) {
  if (!optionText?.trim()) return;
  if (onLog) onLog(`Selecting ${labelPattern}: ${optionText}`);

  const field = await findFieldByLabel(page, labelPattern);
  if (!field || field.type !== 'select') {
    throw new Error(`Dropdown not found for ${labelPattern}`);
  }

  const ok = await selectDropdownOption(page, field.locator, optionText);
  if (!ok) throw new Error(`Could not select "${optionText}" for ${labelPattern}`);
  await page.waitForTimeout(800);
}

async function fillInputByLabel(page, labelPattern, value, onLog) {
  if (!value?.trim()) return;
  if (onLog) onLog(`Filling ${labelPattern}...`);

  const field = await findFieldByLabel(page, labelPattern);
  if (!field || field.type !== 'input') {
    throw new Error(`Input not found for ${labelPattern}`);
  }

  const input = field.locator;
  const editable = await input.isEditable().catch(() => false);
  if (!editable) {
    if (onLog) onLog(`${labelPattern} appears read-only — skipping`);
    return;
  }

  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.fill('');
  await input.pressSequentially(value.trim(), { delay: 25 });
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await input.blur();
  await page.waitForTimeout(300);
}

export async function uploadDocumentByLabel(page, labelText, filePath, onLog, options = {}) {
  const { optional = false, uploadBaseName = '' } = options;
  if (!filePath) return false;

  const tempDir = os.tmpdir();
  const rawName = getBaseNameFromPath(filePath);
  const ext = path.extname(rawName).toLowerCase() || '.pdf';
  const safeUploadName = uploadBaseName
    ? registrationDocFileName(uploadBaseName, ext)
    : sanitizeCpcbPortalFileName(rawName, 'upload');
  const safePath = path.join(tempDir, safeUploadName.replace(/[<>:"/\\|?*]/g, '_'));
  let finalUploadPath = filePath;

  if (!fs.existsSync(filePath)) {
    if (onLog) onLog(`File not found for ${labelText}: ${filePath}. Will not upload a dummy PDF.`);
    if (optional) return false;
    throw new Error(`File not found for ${labelText}: ${filePath}`);
  } else {
    const isPdf = filePath.toLowerCase().endsWith('.pdf');
    const sizeBytes = fs.statSync(filePath).size;
    const MAX_SIZE = 1 * 1024 * 1024; // 1 MB limit

    if (isPdf && sizeBytes > MAX_SIZE) {
      if (onLog) onLog(`Compressing ${labelText} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) to under 1MB using Ghostscript...`);
      const result = await ensurePdfUnderMaxSize(filePath, safePath, MAX_SIZE);
      if (result.success && fs.existsSync(safePath)) {
        const newSize = fs.statSync(safePath).size;
        if (onLog) onLog(`Compression successful. New size: ${(newSize / 1024 / 1024).toFixed(2)} MB.`);
        finalUploadPath = safePath;
      } else {
        if (onLog) onLog(`Compression failed or file missing. Copying to safe name.`);
        fs.copyFileSync(filePath, safePath);
        finalUploadPath = safePath;
      }
    } else {
      fs.copyFileSync(filePath, safePath);
      finalUploadPath = safePath;
    }
  }

  if (onLog) onLog(`Uploading ${labelText} from ${safeUploadName}...`);

  const labelRegex = new RegExp(labelText, 'i');
  const maxAttempts = optional ? 1 : 3;
  let lastErr = null;
  let controlMissing = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    controlMissing = false;
    const labelEl = page.getByText(labelRegex).first();
    await labelEl.waitFor({ state: 'visible', timeout: optional ? 3000 : attempt === 1 ? 8000 : 12000 });

    let button = null;
    let fileInput = null;
    let currentEl = labelEl;
    for (let i = 0; i < 6; i++) {
      currentEl = currentEl.locator('xpath=..');
      
      // Look for a file input directly within this wrapper
      const inputFile = currentEl.locator('input[type="file"]').first();
      if (await inputFile.count().catch(() => 0) > 0) {
        fileInput = inputFile;
        break;
      }

      // Look for the exact "Upload" text (link/button)
      const btn = currentEl.getByText('Upload', { exact: true }).first();
      const fallbackBtn = currentEl.locator('.upload-button, a:has-text("Upload"), button:has-text("Upload")').first();
      
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        button = btn;
        break;
      } else if (await fallbackBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        button = fallbackBtn;
        break;
      }
    }

    if (!button && !fileInput) {
      // Fallback: search globally if the container search failed
      const globalLabel = page.locator('label').filter({ hasText: labelRegex }).first();
      if (await globalLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
        // Try finding next sibling or nearest element
        const globalBtn = globalLabel.locator('xpath=..//..').locator('.upload-button, a:has-text("Upload"), button:has-text("Upload")').first();
        if (await globalBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          button = globalBtn;
        }
      }
    }

    if (fileInput) {
      await fileInput.setInputFiles(finalUploadPath);
      await page.waitForTimeout(2000);
      if (onLog) onLog(`${labelText} uploaded successfully (direct file input).`);
    } else if (button) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        button.click(),
      ]);
      await fileChooser.setFiles(finalUploadPath);
      await page.waitForTimeout(2000);
      if (onLog) onLog(`${labelText} uploaded successfully (clicked button).`);
    } else {
      controlMissing = true;
      throw new Error(`Could not find Upload button or file input near ${labelText}`);
    }
    const uploadAlerts = await collectPortalAlerts(page);
    if (uploadAlerts.length) {
      await dismissPortalAlerts(page, onLog);
      throw new Error(uploadAlerts[0]);
    }
    return true;
  } catch (err) {
    lastErr = err;
    if (optional) break;
    if (onLog) onLog(`Failed to upload ${labelText} (try ${attempt}/${maxAttempts}): ${err.message}`);
    if (attempt < maxAttempts) await page.waitForTimeout(1500);
  }
  }

  // On steps without an upload control for this label (e.g. General Information),
  // uploading is handled later on the Supporting Documents step.
  if (optional) {
    if (onLog) {
      onLog(
        controlMissing
          ? `No upload control for ${labelText} on this step — will upload on Supporting Documents.`
          : `Skipping ${labelText} upload on this step: ${lastErr?.message || 'not available'}`
      );
    }
    return false;
  }

  throw lastErr || new Error(`Failed to upload ${labelText}`);
}

async function readPortalValue(locator) {
  try {
    if ((await locator.count()) === 0) return '';
    return String((await locator.inputValue()) || '').trim();
  } catch {
    return '';
  }
}

/** Selected option text, ignoring the "Select" placeholder option. */
async function readPortalSelection(locator) {
  try {
    if ((await locator.count()) === 0) return '';
    return await locator.evaluate((el) => {
      const option = el.selectedOptions?.[0] || el.options?.[el.selectedIndex];
      const text = (option?.textContent || '').trim();
      return /^select\b/i.test(text) ? '' : text;
    });
  } catch {
    return '';
  }
}

/** Required General Information fields that are still empty on the portal. */
async function findEmptyGeneralInfoFields(page, data) {
  const addressLine1 = data.registeredAddressLine1 || data.registeredAddress;
  const checks = [
    ['Type of Business', 'select', 'typeOfBusiness', data.typeOfBusiness],
    ['Type of Company', 'select', 'typeOfCompany', data.typeOfCompany],
    ['Registered Address Line 1', 'input', 'registeredAddressLine1', addressLine1],
    ['District', 'select', 'district', data.district],
    ['Designation', 'input', 'designation', data.authDesignation],
    ['Password', 'input', 'password', data.password],
    ['Confirm Password', 'input', 'confirmPassword', data.password],
  ];

  const empty = [];
  for (const [label, kind, controlName, expected] of checks) {
    if (!String(expected || '').trim()) continue;
    const value =
      kind === 'select'
        ? await readPortalSelection(portalSelect(page, controlName))
        : await readPortalValue(portalInput(page, controlName));
    if (!value) empty.push(label);
  }
  return empty;
}

/** Fill Step 2 — General Information on CPCB portal after User Verification. */
async function fillGeneralInformation(page, data, onLog) {
  if (onLog) onLog('Waiting for General Information step...');

  await page.waitForTimeout(2500);
  await portalSelect(page, 'typeOfBusiness').waitFor({ state: 'visible', timeout: 20000 });

  const addressLine1 = data.registeredAddressLine1 || data.registeredAddress;

  // One field failing must not abort the whole step — the verification pass below
  // re-fills whatever is still empty.
  const fieldErrors = [];
  const fillStep = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      fieldErrors.push(`${label}: ${err.message}`);
      if (onLog) onLog(`Could not set ${label}: ${err.message}. Continuing with other fields.`);
    }
  };

  const fillCoreFields = async () => {
    await fillStep('Type of Business', () =>
      selectPortalDropdown(page, 'typeOfBusiness', data.typeOfBusiness, onLog, 'Type of Business')
    );
    await fillStep('Type of Company', () =>
      selectPortalDropdown(page, 'typeOfCompany', data.typeOfCompany, onLog, 'Type of Company')
    );
    await fillStep('Registered Address Line 1', () =>
      fillPortalInput(page, 'registeredAddressLine1', addressLine1, onLog, 'Registered Address Line 1')
    );

    if (data.registeredAddressLine2?.trim()) {
      await fillStep('Registered Address Line 2', () =>
        fillPortalInput(
          page,
          'registeredAddressLine2',
          data.registeredAddressLine2,
          onLog,
          'Registered Address Line 2'
        )
      );
    }

    if (data.cin?.trim()) {
      await fillStep('Company CIN Number', () =>
        fillPortalInput(page, 'companyCinCardNumber', data.cin, onLog, 'Company CIN Number')
      );
    }

    if (data.stateUt?.trim()) {
      const stateSelect = portalSelect(page, 'stateOrUT');
      const stateDisabled = await stateSelect.isDisabled().catch(() => true);
      if (!stateDisabled) {
        await fillStep('State/UT', async () => {
          await selectPortalDropdown(page, 'stateOrUT', data.stateUt, onLog, 'State/UT');
          await page.waitForTimeout(1500);
        });
      } else if (onLog) {
        onLog('State/UT pre-filled from GST — skipping');
      }
    }

    if (data.district?.trim()) {
      // District options load after State/UT resolves.
      await fillStep('District', async () => {
        await page.waitForTimeout(800);
        await selectPortalDropdown(page, 'district', data.district, onLog, 'District');
      });
    }

    await fillStep('Designation', () =>
      fillPortalInput(page, 'designation', data.authDesignation, onLog, 'Designation')
    );

    if (data.password?.trim()) {
      await fillStep('Password', () =>
        fillPortalInput(page, 'password', data.password, onLog, 'Password')
      );
      await fillStep('Confirm Password', () =>
        fillPortalInput(page, 'confirmPassword', data.password, onLog, 'Confirm Password')
      );
    }
  };

  await fillCoreFields();

  if (onLog) {
    onLog(`[DEBUG] plasticConsumed: ${JSON.stringify(data.plasticConsumed)}`);
    onLog(`[DEBUG] complianceStatus: ${data.complianceStatus}`);
    onLog(`[DEBUG] thicknessOfPlastic: ${data.thicknessOfPlastic}`);
  }

  if (data.plasticConsumed) {
    if (onLog) onLog('Filling 3c) Total Quantity of Plastic Consumed...');
    const pcYears = resolvePlasticConsumedYears(data.plasticConsumed);
    await fillPlasticConsumedGrid(
      page,
      data.plasticConsumed,
      pcYears.length ? pcYears : getImporterReportingFinancialYears(),
      onLog,
    );
  }

  if (data.complianceStatus?.trim()) {
    if (onLog) onLog(`Selecting 3d) Status of compliance: ${data.complianceStatus}`);
    
    // Bulletproof: Find the select element that has a 'Yes' option, and is near the 3d text
    let complianceSelect = page.locator('select').filter({ hasText: /Yes/i }).first();
    
    if ((await complianceSelect.count().catch(() => 0)) === 0) {
      complianceSelect = page.locator('xpath=//*[contains(., "Status of compliance") or contains(., "3d)")]/following::select[1]').first();
    }
    
    await complianceSelect.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const count = await complianceSelect.count().catch(() => 0);
    if (count > 0) {
      await complianceSelect.scrollIntoViewIfNeeded();
      await complianceSelect.selectOption({ label: data.complianceStatus });
      await complianceSelect.dispatchEvent('change');
      await page.waitForTimeout(300);
    } else {
      if (onLog) onLog('Warning: Could not find compliance status dropdown');
    }
  }

  if (data.thicknessOfPlastic?.trim()) {
    if (onLog) onLog(`Filling 3e) Thickness of Plastic: ${data.thicknessOfPlastic}`);
    
    // Bulletproof: Find the label then the input next to it
    let label3e = page.getByText(/3e\).*Thickness of Plastic|Thickness of Plastic Packaging/i).first();
    let thicknessInput = page.locator('input[type="text"], input[inputmode="numeric"], input[inputmode="decimal"]').filter({ rightOf: label3e }).first();
    
    if ((await thicknessInput.count().catch(() => 0)) === 0) {
      thicknessInput = page.locator('input[type="text"], input[inputmode="numeric"], input[inputmode="decimal"]').filter({ below: label3e }).first();
    }
    if ((await thicknessInput.count().catch(() => 0)) === 0) {
      thicknessInput = page.locator('xpath=//*[contains(., "Thickness of Plastic") or contains(., "3e)")]/following::input[1]').first();
    }

    await thicknessInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const count = await thicknessInput.count().catch(() => 0);
    if (count > 0) {
      await thicknessInput.scrollIntoViewIfNeeded();
      await thicknessInput.click();
      await thicknessInput.fill('');
      await thicknessInput.pressSequentially(data.thicknessOfPlastic, { delay: 10 });
      await thicknessInput.dispatchEvent('input');
      await thicknessInput.dispatchEvent('change');
      await thicknessInput.blur();
      await page.waitForTimeout(300);
    } else {
      if (onLog) onLog('Warning: Could not find thickness input field');
    }
  }

  // Some portal variants expose document slots here; when they are absent the
  // Supporting Documents step handles them, so a miss must not fail this step.
  const companyPanPath = data.companyPanDocumentPath || data.panDocumentPath;
  if (companyPanPath) {
    await uploadDocumentByLabel(page, 'Company PAN', companyPanPath, onLog, {
      optional: true,
    });
  }
  if (data.gstDocumentPath) {
    const unitGstDone = await uploadDocumentByLabel(page, 'Unit GST', data.gstDocumentPath, onLog, {
      optional: true,
    });
    if (!unitGstDone) {
      await uploadDocumentByLabel(page, 'GST', data.gstDocumentPath, onLog, { optional: true });
    }
  }
  if (data.cinDocumentPath) {
    await uploadDocumentByLabel(page, 'CIN', data.cinDocumentPath, onLog, { optional: true });
  }

  let empty = await findEmptyGeneralInfoFields(page, data);
  if (empty.length) {
    if (onLog) onLog(`Fields still empty: ${empty.join(', ')}. Re-filling before Continue...`);
    await dismissPortalAlerts(page, onLog);
    await fillCoreFields();
    empty = await findEmptyGeneralInfoFields(page, data);
  }

  if (empty.length) {
    throw new Error(
      `General Information not filled: ${empty.join(', ')}${
        fieldErrors.length ? ` (${fieldErrors.join(' | ')})` : ''
      }`
    );
  }

  const portalErr = await checkPortalError(page);
  if (portalErr) throw new Error(portalErr);

  if (onLog) onLog('General Information filled on portal');
}

const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;

/** PAN the Supporting Doc step asks the document for ("...following Company PAN XXXXX1234X"). */
async function readRequestedPanFromPortal(page) {
  try {
    const text = await page.evaluate(() => {
      const inputValues = Array.from(document.querySelectorAll('input'))
        .map((el) => el.value || '')
        .join(' ');
      return `${document.body?.innerText || ''} ${inputValues}`;
    });
    const upper = String(text).toUpperCase();
    const labelled = upper.match(/COMPANY PAN[^A-Z0-9]{0,40}([A-Z]{5}[0-9]{4}[A-Z])/);
    if (labelled) return labelled[1];
    const match = upper.match(PAN_RE);
    return match ? match[0] : '';
  } catch {
    return '';
  }
}

/** Company PAN document from the DB — never the authorised person's PAN. */
async function findCompanyPanDocument(requestedPan) {
  try {
    const db = getDb();
    const rows = await db.all(
      'SELECT doc_type, file_path, document_number FROM company_documents ORDER BY created_at DESC'
    );
    const usable = (rows || []).filter((r) => r.file_path && fs.existsSync(r.file_path));
    if (!usable.length) return null;

    // An IEC number is the company PAN, so matching on the number alone can pick
    // the IEC certificate — only PAN cards qualify here.
    const panDocs = usable.filter((r) => r.doc_type === 'company_pan' || r.doc_type === 'pan');
    if (!panDocs.length) return null;

    const wanted = String(requestedPan || '').toUpperCase();
    if (wanted) {
      const exact = panDocs.find(
        (r) => String(r.document_number || '').toUpperCase() === wanted
      );
      if (exact) return exact;
    }
    return panDocs.find((r) => r.doc_type === 'company_pan') || panDocs[0] || null;
  } catch {
    return null;
  }
}

function resolvePanDocumentPath(customPath) {
  const candidates = [
    customPath,
    path.join(os.homedir(), 'Downloads', 'pan.pdf'),
    path.join(os.homedir(), 'Downloads', 'pan'),
  ].filter((p) => p && String(p).trim());

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0] || path.join(os.homedir(), 'Downloads', 'pan.pdf');
}

async function waitForSupportingDocStep(page, onLog) {
  const tabCandidates = [
    page.locator('*').filter({ hasText: /^Supporting Doc\.?$/i }),
    page.getByText(/^Supporting Doc\.?$/i),
  ];

  for (const tabLocator of tabCandidates) {
    const tab = tabLocator.first();
    try {
      if (await tab.isVisible({ timeout: 3000 })) {
        await tab.scrollIntoViewIfNeeded();
        await tab.click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        break;
      }
    } catch {
      /* tab may auto-activate */
    }
  }

  await page
    .getByText(/Additional Document|Drag & Drop|Captcha Code|Enter Captcha/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });

  if (onLog) onLog('Supporting Documents tab active');
}

async function resolveCompaniesSubmitFailure(page, companiesResponse) {
  if (companiesResponse) {
    try {
      const body = await companiesResponse.json();
      const evaluated = evaluateCompaniesApiResponse(body, companiesResponse.status());
      if (!evaluated.isRegistrationAllowed) return evaluated.message;
    } catch {
      /* fall through to toast check */
    }
  }
  return checkPortalError(page);
}

async function clickGeneralInfoContinue(page, onLog) {
  if (onLog) onLog('Submitting General Information — clicking Continue...');
  await page.waitForTimeout(800);

  await page
    .locator('form')
    .first()
    .evaluate((form) => {
      form.querySelectorAll('input, select, textarea').forEach((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    })
    .catch(() => {});

  await page.waitForTimeout(600);

  const candidates = [
    page.locator('.final-submit-signup-form button[type="submit"]'),
    page.locator('form button[type="submit"]').filter({ hasText: /Continue/i }),
    page.locator('.signup-btn-fmt').filter({ hasText: /Continue/i }),
    page.getByRole('button', { name: /^Continue$/i }),
  ];

  for (const locator of candidates) {
    const btn = locator.first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await btn.scrollIntoViewIfNeeded();

      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (await btn.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(500);
      }

      if (!(await btn.isEnabled().catch(() => false))) continue;

      const companiesResponsePromise = page.waitForResponse(
        (res) => res.url().includes('/api/v1/companies') && res.request().method() === 'POST',
        { timeout: 20000 }
      ).catch(() => null);

      await btn.click({ timeout: 10000 });
      await waitForPortalBusy(page);

      const companiesResponse = await companiesResponsePromise;
      const submitFailure = await resolveCompaniesSubmitFailure(page, companiesResponse);
      if (submitFailure) throw new Error(submitFailure);

      const continueAlerts = await collectPortalAlerts(page);
      if (continueAlerts.length) {
        await dismissPortalAlerts(page, onLog);
        throw new Error(continueAlerts[0]);
      }

      await page.waitForTimeout(1000);

      const moved = await page
        .getByText(/Supporting Doc|Additional Document|Captcha Code|Drag & Drop/i)
        .first()
        .isVisible({ timeout: 8000 })
        .catch(() => false);

      if (moved) {
        await waitForSupportingDocStep(page, onLog);
        return;
      }

      await page.locator('form').first().evaluate((form) => form.requestSubmit()).catch(() => {});

      const retryCompaniesResponse = await page.waitForResponse(
        (res) => res.url().includes('/api/v1/companies') && res.request().method() === 'POST',
        { timeout: 10000 }
      ).catch(() => null);
      const retryFailure = await resolveCompaniesSubmitFailure(page, retryCompaniesResponse);
      if (retryFailure) throw new Error(retryFailure);

      await page.waitForTimeout(1500);

      if (
        await page
          .getByText(/Supporting Doc|Additional Document|Captcha Code|Drag & Drop/i)
          .first()
          .isVisible({ timeout: 8000 })
          .catch(() => false)
      ) {
        await waitForSupportingDocStep(page, onLog);
        return;
      }
    } catch (err) {
      if (isBlockingPortalError(err?.message)) throw err;
      /* try next selector */
    }
  }

  throw new Error('Could not submit General Information — check required fields on portal');
}

async function clickSupportingDocContinue(page, onLog) {
  if (onLog) onLog('Clicking Continue on Supporting Documents...');

  const candidates = [
    page.locator('button[type="submit"]').filter({ hasText: /Continue/i }),
    page.locator('.signup-btn-fmt').filter({ hasText: /Continue/i }),
    page.getByRole('button', { name: /^Continue$/i }),
  ];

  for (const locator of candidates) {
    const btn = locator.last();
    try {
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await btn.scrollIntoViewIfNeeded();
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click({ timeout: 10000 });
        await page.waitForTimeout(2500);
        return;
      }
    } catch {
      /* try next */
    }
  }

  throw new Error('Could not click Continue on Supporting Documents');
}

async function isRegistrationSuccessVisible(page, timeoutMs = 3000) {
  return page
    .getByText(/Registration Completed Successfully/i)
    .first()
    .isVisible({ timeout: timeoutMs })
    .catch(() => false);
}

async function getCaptchaInputValue(page) {
  const inp = page
    .locator('app-captcha input.captcha-input, input[placeholder="Enter Captcha"]')
    .first();
  return (await inp.inputValue().catch(() => '')).trim();
}

async function clearCaptchaField(page) {
  const inp = page
    .locator('app-captcha input.captcha-input, input[placeholder="Enter Captcha"]')
    .first();
  await inp.fill('').catch(() => {});
}

// Captcha OCR autofill disabled — user enters captcha on frontend (see submitRegistrationCaptcha).

async function extractCeprIdFromPage(page) {
  const idLine = page.getByText(/CEPR\s*ID/i).first();
  if (await idLine.isVisible({ timeout: 3000 }).catch(() => false)) {
    const lineText = await idLine.innerText({ timeout: 3000 }).catch(() => '');
    const match = lineText.match(/([A-Z]\d{6}-\d+)/);
    if (match) return match[1].trim();
  }

  const pageText = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
  const idMatch = pageText.match(/CEPR\s*ID\s*[:：]?\s*([A-Z]\d{6}-\d+)/i);
  if (idMatch) return idMatch[1].trim();

  const fallback = pageText.match(/\b([A-Z]\d{6}-\d{8})\b/);
  return fallback ? fallback[1].trim() : '';
}

async function captureRegistrationSuccess(page, onLog, { alreadyVisible = false } = {}) {
  if (onLog) onLog('Capturing registration success...');

  if (!alreadyVisible) {
    const visible = await isRegistrationSuccessVisible(page, 20000);
    if (!visible) {
      throw new Error('Registration success screen did not appear — verify captcha on portal');
    }
  }

  await page.waitForTimeout(800);

  const ceprId = await extractCeprIdFromPage(page);

  const { app } = await import('electron');
  const dir = path.join(app.getPath('userData'), 'registration-screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const screenshotPath = path.join(dir, `registration-success-${Date.now()}.png`);

  let saved = false;
  const dialogCandidates = [
    page.locator('[role="dialog"]').filter({ hasText: /Registration Completed Successfully/i }).first(),
    page.locator('.modal, .cdk-overlay-pane, .mat-dialog-container').filter({ hasText: /Registration Completed Successfully/i }).first(),
    page.getByText(/Registration Completed Successfully/i).first(),
  ];

  for (const dialog of dialogCandidates) {
    if (!(await dialog.isVisible({ timeout: 2000 }).catch(() => false))) continue;
    try {
      await dialog.screenshot({ path: screenshotPath, timeout: 10000 });
      saved = true;
      break;
    } catch {
      /* try next */
    }
  }

  if (!saved) {
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10000 }).catch(async () => {
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10000 });
    });
  }

  if (onLog) {
    onLog(`CEPR ID captured: ${ceprId || 'not found'} | Screenshot saved`);
  }

  return { ceprId, screenshotPath };
}

async function uploadPanAndGetCaptcha(page, data, onLog) {
  await page
    .getByText(/Supporting Doc|Additional Document|Company PAN/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });

  const requestedPan = await readRequestedPanFromPortal(page);
  if (onLog && requestedPan) onLog(`Portal is asking for the document of PAN ${requestedPan}`);

  const companyPanDoc = await findCompanyPanDocument(requestedPan);
  const panPath = resolvePanDocumentPath(
    companyPanDoc?.file_path || data.companyPanDocumentPath || data.panDocumentPath
  );

  if (!fs.existsSync(panPath)) {
    throw new Error(`PAN document not found at ${panPath}`);
  }

  if (onLog) {
    if (!companyPanDoc) {
      onLog(
        `Warning: no Company PAN document found in the app${
          requestedPan ? ` for ${requestedPan}` : ''
        } — using ${path.basename(panPath)}`
      );
    } else if (
      requestedPan &&
      String(companyPanDoc.document_number || '').toUpperCase() !== requestedPan
    ) {
      onLog(
        `Warning: uploading ${companyPanDoc.doc_type} (${companyPanDoc.document_number || 'no number'}) — no document matches ${requestedPan}`
      );
    }
  }

  if (onLog) onLog(`Uploading Company PAN document (${path.basename(panPath)})...`);

  await page.waitForTimeout(1000);

  const fileInputs = page.locator('input[type="file"]');
  const fileInputCount = await fileInputs.count();

  if (fileInputCount > 0) {
    const targetInput = fileInputCount === 1 ? fileInputs.first() : fileInputs.last();
    await targetInput.setInputFiles(panPath);
  } else {
    const browse = page.getByText(/^Browse$/i).first();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      browse.click(),
    ]);
    await fileChooser.setFiles(panPath);
  }

  await page.waitForTimeout(2500);

  const uploadedName = path.basename(panPath);
  const uploadedVisible = await page
    .getByText(new RegExp(uploadedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    .first()
    .isVisible({ timeout: 10000 })
    .catch(() => false);

  if (onLog) {
    onLog(
      uploadedVisible
        ? `PAN document uploaded: ${uploadedName}`
        : `PAN file sent to portal: ${uploadedName} (verify on Supporting Doc tab)`
    );
  }

  if (onLog) onLog('Enter captcha in the app to finish registration');
  return getCaptchaImageDataUrl(page, onLog);
}

/** YYYY-MM-DD → DD-MM-YYYY for CPCB text date fields */
function toPortalDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return `${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}-${dmy[3]}`;
  return s;
}

async function assertDateFieldEnabled(input, context = 'Date field') {
  const disabled = await input.isDisabled().catch(() => false);
  const cls = (await input.getAttribute('class').catch(() => '')) || '';
  if (disabled || /input-disabled|disabled/i.test(cls)) {
    throw new Error(
      `${context} is disabled — GST verification did not unlock the form (e.g. Cancelled or inactive GST on CPCB portal).`
    );
  }
}

async function fillDateField(page, value, { index = 0, label = null } = {}) {
  if (!value) return;
  const isoValue = value;
  const portalValue = toPortalDate(value);

  if (label) {
    const byLabel = page.getByLabel(new RegExp(label, 'i'));
    if (await byLabel.isVisible().catch(() => false)) {
      await assertDateFieldEnabled(byLabel, label);
      const inputType = await byLabel.getAttribute('type').catch(() => '');
      await byLabel.fill(inputType === 'date' ? isoValue : portalValue, { timeout: 5000 });
      await byLabel.blur();
      return;
    }
  }

  const dateInput = page.locator('input[type="date"]').nth(index);
  if (await dateInput.isVisible().catch(() => false)) {
    await assertDateFieldEnabled(dateInput, 'Date of Establishment');
    await dateInput.fill(isoValue, { timeout: 5000 });
    return;
  }

  const textDate = page.getByPlaceholder(/dd-mm-yyyy/i).nth(index);
  if (await textDate.isVisible().catch(() => false)) {
    await assertDateFieldEnabled(textDate, 'Date of Establishment');
    await textDate.fill('');
    await textDate.pressSequentially(portalValue, { delay: 30 });
    await textDate.blur();
  }
}

function isSuccessPortalMessage(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return /success|verified|submitted|saved|registered|otp has been|otp sent|valid otp|sent successfully|pan details/i.test(t);
}

function isFailurePortalMessage(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/gst status is cancelled|gst status is canceled|gst.*cancelled|gst.*canceled|gst.*inactive|gst.*suspended/i.test(t)) {
    return true;
  }
  if (isSuccessPortalMessage(t) && !/invalid|incorrect|failed|something went wrong|cancelled|canceled/i.test(t)) {
    return false;
  }
  return /something went wrong|please try again|try again after|failed|invalid otp|incorrect otp|unable to|not valid|invalid pan|invalid gst|cancelled|canceled|inactive|suspended|already exists|conflict/i.test(t);
}

async function readPortalToastText(page) {
  const texts = await readAllPortalToastTexts(page);
  return texts[0] || '';
}

async function readAllPortalToastTexts(page) {
  await harvestPortalToasts(page).catch(() => {});
  const texts = [];
  const seen = new Set();
  const selectors = [
    '.toast-error',
    '.toast-success',
    '.toast-message',
    '#toast-container .toast',
    '.ngx-toastr',
    '.toast-container .toast',
    '[role="alert"]',
    '.alert-danger',
    '.mat-mdc-snack-bar-label',
    '.mat-snack-bar-container',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const item = loc.nth(i);
        if (!(await item.isVisible({ timeout: 100 }).catch(() => false))) continue;
        const text = (await item.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
        if (text && !seen.has(text)) {
          seen.add(text);
          texts.push(text);
        }
      }
    } catch {
      /* try next */
    }
  }
  try {
    const fallback = page.getByText(/Something went wrong|Please try again after sometime|Gst Status is|already exists|Authorised Person PAN/i);
    const count = await fallback.count();
    for (let i = 0; i < count; i++) {
      const item = fallback.nth(i);
      if (!(await item.isVisible({ timeout: 100 }).catch(() => false))) continue;
      const text = (await item.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
      if (text && !seen.has(text)) {
        seen.add(text);
        texts.push(text);
      }
    }
  } catch {
    /* ignore */
  }
  return texts;
}

async function isGstVerifiedOnPortal(page) {
  const verifiedChip = page.getByText(/^Verified$/i).first();
  if (await verifiedChip.isVisible({ timeout: 1500 }).catch(() => false)) return true;

  const dateInput = page.locator('input[type="date"]').first();
  if (await dateInput.isVisible().catch(() => false)) {
    const locked = await dateInput.isDisabled().catch(() => true);
    if (!locked) return true;
  }

  const companyName = page.getByPlaceholder(/Enter Company Name/i).first();
  if (await companyName.isVisible().catch(() => false)) {
    const val = await companyName.inputValue().catch(() => '');
    if (String(val).trim().length > 2 && await companyName.isEnabled().catch(() => false)) return true;
  }
  return false;
}

/**
 * The portal drops a full-screen app-loader over the form while it talks to the
 * GST API; clicking through it just burns Playwright's actionability timeout.
 */
async function clickPortalVerify(page, onLog) {
  await waitForPortalBusy(page);

  const btn = page.getByRole('button', { name: /Verify/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });

  for (let i = 0; i < 30; i += 1) {
    if (await btn.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  if (!(await btn.isEnabled().catch(() => false))) {
    throw new Error('Verify button stayed disabled — portal is still busy.');
  }

  try {
    await btn.click({ timeout: 8000 });
    return;
  } catch {
    if (onLog) onLog('Verify click blocked by portal loader — waiting and retrying.');
  }

  await waitForPortalBusy(page);
  try {
    await btn.click({ timeout: 8000 });
  } catch {
    // Dispatching straight on the element ignores the overlay hit-test.
    await btn.dispatchEvent('click');
  }
}

async function checkPortalError(page) {
  try {
    const texts = await readAllPortalToastTexts(page);
    for (const text of texts) {
      if (isFailurePortalMessage(text)) return text;
    }
    return null;
  } catch {
    return null;
  }
}

async function waitForGstVerifyOutcome(page, gstin, onLog) {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/gst/details') && res.request().method() === 'POST',
    { timeout: 20000 }
  ).catch(() => null);

  await page.getByRole('button', { name: /Verify/i }).first().click();

  const gstResponse = await responsePromise;
  if (gstResponse) {
    try {
      const body = await gstResponse.json();
      const evaluated = evaluateGstDetailsResponse(body, gstin);
      if (!evaluated.isRegistrationAllowed) {
        throw new Error(evaluated.message);
      }
      if (onLog && evaluated.portalStatus) {
        onLog(`GST verified — portal status: ${evaluated.portalStatus}`);
      }
    } catch (err) {
      if (err.message.includes('CPCB portal') || err.message.includes('Registration cannot proceed')) {
        throw err;
      }
    }
  }

  await page.waitForTimeout(1500);
  const outcome = await waitForPortalOutcome(page, { timeoutMs: 8000 });
  if (outcome.error) {
    if (/cancelled|canceled|inactive|suspended/i.test(outcome.error)) {
      throw new Error(formatInvalidGstError(gstin, outcome.error.replace(/gst status is\s*/i, '').trim()));
    }
    throw new Error(outcome.error);
  }

  const dateInput = page.locator('input[type="date"]').first();
  if (await dateInput.isVisible().catch(() => false)) {
    const disabled = await dateInput.isDisabled().catch(() => false);
    if (disabled) {
      const toastErr = await checkPortalError(page);
      throw new Error(
        toastErr && isFailurePortalMessage(toastErr)
          ? formatInvalidGstError(gstin, toastErr.replace(/gst status is\s*/i, '').trim())
          : `GST verification did not unlock the form for ${gstin}. The GST may be Cancelled or inactive on CPCB portal.`
      );
    }
  }
}

async function waitForPortalOutcome(page, { timeoutMs = 8000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const err = await checkPortalError(page);
    if (err) return { error: err };
    await page.waitForTimeout(400);
  }
  return { error: await checkPortalError(page) };
}

async function isOtpSectionVerified(page, otpFieldIndex) {
  const otpInputs = page.getByPlaceholder(/Enter OTP/i);
  const count = await otpInputs.count();
  if (otpFieldIndex >= count) return false;

  const otpInput = otpInputs.nth(otpFieldIndex);

  const disabled = await otpInput.isDisabled().catch(() => false);
  const ariaDisabled = (await otpInput.getAttribute('disabled').catch(() => null)) != null
    || (await otpInput.getAttribute('aria-disabled').catch(() => '')) === 'true';
  const cls = (await otpInput.getAttribute('class').catch(() => '')) || '';
  if (disabled || ariaDisabled || /input-disabled|disabled/i.test(cls)) {
    return true;
  }

  for (let level = 1; level <= 6; level += 1) {
    let ancestor = otpInput;
    for (let i = 0; i < level; i += 1) {
      ancestor = ancestor.locator('xpath=..');
    }
    const verified = ancestor.getByText(/^Verified$/i).first();
    if (await verified.isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function clickContinueButton(page, onLog) {
  if (onLog) onLog('Clicking Continue...');
  await page.waitForTimeout(1000);

  const candidates = [
    page.getByRole('button', { name: /^Continue$/i }),
    page.locator('button').filter({ hasText: /^Continue$/i }),
    page.locator('[type="submit"]').filter({ hasText: /^Continue$/i }),
    page.getByText(/^Continue$/i),
  ];

  for (const locator of candidates) {
    const btn = locator.first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      await btn.scrollIntoViewIfNeeded();

      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (await btn.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(1000);
      }

      if (await btn.isEnabled().catch(() => false)) {
        await btn.click({ timeout: 10000 });
        await page.waitForTimeout(2500);
        if (onLog) onLog('Continue clicked — moving to General Information');
        return;
      }
    } catch {
      /* try next selector */
    }
  }

  throw new Error('Could not click Continue button — ensure email and mobile OTP are verified');
}

/** Fill OTP field and click the Verify button in the same row/section. */
async function fillOtpAndVerify(page, otp, otpFieldIndex = 0, onLog) {
  const otpStr = String(otp || '').trim();
  if (!otpStr) throw new Error('OTP is required');

  if (await isOtpSectionVerified(page, otpFieldIndex)) {
    if (onLog) {
      onLog(`${otpFieldIndex === 0 ? 'Email' : 'Mobile'} OTP already verified — skipping`);
    }
    return;
  }

  if (onLog) onLog(`Entering OTP (${otpFieldIndex === 0 ? 'Email' : 'Mobile'})...`);

  const otpInputs = page.getByPlaceholder(/Enter OTP/i);
  await otpInputs.first().waitFor({ state: 'visible', timeout: 15000 });
  const count = await otpInputs.count();
  if (otpFieldIndex >= count) {
    throw new Error(`OTP field ${otpFieldIndex + 1} not found on portal`);
  }

  const otpInput = otpInputs.nth(otpFieldIndex);
  if (await isOtpSectionVerified(page, otpFieldIndex)) {
    if (onLog) onLog(`${otpFieldIndex === 0 ? 'Email' : 'Mobile'} OTP field is locked — already verified`);
    return;
  }

  await otpInput.scrollIntoViewIfNeeded();
  const canType = await otpInput.isEnabled().catch(() => false);
  if (!canType) {
    if (onLog) onLog(`${otpFieldIndex === 0 ? 'Email' : 'Mobile'} OTP input is disabled — treating as verified`);
    return;
  }
  await otpInput.click({ timeout: 8000 });
  await otpInput.fill('');
  await otpInput.pressSequentially(otpStr, { delay: 40 });
  await otpInput.dispatchEvent('input');
  await otpInput.dispatchEvent('change');
  await otpInput.blur();
  await page.waitForTimeout(400);

  if (onLog) onLog('Clicking Verify button...');

  let clicked = false;

  // Strategy 1: Verify in same parent container as OTP input
  for (let level = 1; level <= 4 && !clicked; level += 1) {
    try {
      let ancestor = otpInput;
      for (let i = 0; i < level; i += 1) {
        ancestor = ancestor.locator('xpath=..');
      }
      const verifyBtn = ancestor.getByRole('button', { name: /^Verify$/i }).first();
      if (await verifyBtn.isVisible({ timeout: 800 }) && await verifyBtn.isEnabled()) {
        await verifyBtn.click({ timeout: 8000 });
        clicked = true;
      }
    } catch {
      /* try next level */
    }
  }

  // Strategy 2: First enabled Verify on page (email section usually only enabled one)
  if (!clicked) {
    const verifyButtons = page.getByRole('button', { name: /^Verify$/i });
    const btnCount = await verifyButtons.count();
    for (let i = 0; i < btnCount && !clicked; i += 1) {
      const btn = verifyButtons.nth(i);
      try {
        if (await btn.isVisible() && await btn.isEnabled()) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click({ timeout: 8000 });
          clicked = true;
        }
      } catch {
        /* try next */
      }
    }
  }

  // Strategy 3: button element with Verify text near OTP
  if (!clicked) {
    const nearVerify = page.locator('button').filter({ hasText: /^Verify$/i }).nth(otpFieldIndex);
    if (await nearVerify.isEnabled()) {
      await nearVerify.click({ timeout: 8000 });
      clicked = true;
    }
  }

  if (!clicked) {
    if (await isOtpSectionVerified(page, otpFieldIndex)) {
      if (onLog) onLog('Verify button gone — section already verified');
      return;
    }
    throw new Error('Could not click Verify button — check CPCB portal OTP section');
  }

  if (onLog) onLog('OTP submitted to portal — waiting for result...');
  const outcome = await waitForPortalOutcome(page, { timeoutMs: 8000 });
  if (outcome.error) {
    throw new Error(outcome.error);
  }

  const verifiedAt = Date.now();
  let verified = await isOtpSectionVerified(page, otpFieldIndex);
  while (!verified && Date.now() - verifiedAt < 12000) {
    await page.waitForTimeout(500);
    verified = await isOtpSectionVerified(page, otpFieldIndex);
  }
  if (!verified) {
    const lateErr = await checkPortalError(page);
    throw new Error(lateErr || 'CPCB portal did not verify OTP. Please try again.');
  }
  if (onLog) onLog(`${otpFieldIndex === 0 ? 'Email' : 'Mobile'} OTP verified on portal`);
}

/** Fill mobile on CPCB portal and click Get OTP. */
async function requestMobileOtp(page, mobile, onLog) {
  const mobileStr = String(mobile || '').replace(/\D/g, '');
  if (!mobileStr || mobileStr.length < 10) {
    throw new Error('Valid 10-digit mobile number is required');
  }
  regMobile = mobileStr;

  if (onLog) onLog(`Entering Mobile Number (${mobileStr})...`);

  const mobileLocator = page.getByPlaceholder(/Enter Mobile Number/i);
  await mobileLocator.waitFor({ state: 'visible', timeout: 15000 });
  await mobileLocator.scrollIntoViewIfNeeded();
  await mobileLocator.click();
  await mobileLocator.fill('');
  await mobileLocator.pressSequentially(mobileStr, { delay: 40 });
  await mobileLocator.dispatchEvent('input');
  await mobileLocator.dispatchEvent('change');
  await mobileLocator.blur();
  await page.waitForTimeout(600);

  if (onLog) onLog('Clicking Get OTP for mobile...');

  let clicked = false;

  for (let level = 1; level <= 5 && !clicked; level += 1) {
    try {
      let ancestor = mobileLocator;
      for (let i = 0; i < level; i += 1) {
        ancestor = ancestor.locator('xpath=..');
      }
      const getOtp = ancestor.getByText(/^Get OTP$/i).first();
      if (await getOtp.isVisible({ timeout: 800 })) {
        await getOtp.click({ timeout: 8000 });
        clicked = true;
      }
    } catch {
      /* try next */
    }
  }

  if (!clicked) {
    const getOtpBtns = page.getByText(/^Get OTP$/i);
    const count = await getOtpBtns.count();
    for (let i = count - 1; i >= 0 && !clicked; i -= 1) {
      try {
        const btn = getOtpBtns.nth(i);
        if (await btn.isVisible() && await btn.isEnabled()) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click({ timeout: 8000 });
          clicked = true;
        }
      } catch {
        /* try next */
      }
    }
  }

  if (!clicked) {
    throw new Error('Could not click Get OTP for mobile — enter mobile on portal manually');
  }

  if (onLog) onLog('Get OTP clicked — waiting for portal result...');
  const outcome = await waitForPortalOutcome(page, { timeoutMs: 8000 });
  if (outcome.error) throw new Error(outcome.error);

  if (onLog) onLog('Mobile OTP sent — check your phone');
}

export async function startRegistrationFlow(data, onLog) {
  try {
    data = withRegistrationDummyFallback(data);
    regPayload = data;
    if (onLog) onLog('Starting registration flow...');
    
    // Launch browser
    regBrowser = await chromium.launch({ headless: false, args: CPCB_CHROMIUM_ARGS });
    regContext = await regBrowser.newContext({ viewport: null });
    regPage = await regContext.newPage();
    await prepareCpcbBrowserPage(regPage);
    attachCaptchaNetworkListenerToContext(regContext);
    const { attachPortalToastWatcherToContext } = await import('./portalToastWatcher.js');
    await attachPortalToastWatcherToContext(regContext).catch(() => {});
    
    if (onLog) onLog('Navigating to CPCB portal...');
    await gotoCpcb(regPage, REGISTRATION_URL, onLog);
    
    // Fill GST
    if (onLog) onLog('Entering GST Number...');
    const gstLocator = regPage.getByPlaceholder(/Enter Company GST Number/i);
    await gstLocator.fill('');
    await gstLocator.pressSequentially(data.gstin, { delay: 50 });
    await gstLocator.blur();
    
    if (onLog) onLog('Verifying GST on CPCB portal...');
    await waitForGstVerifyOutcome(regPage, data.gstin, onLog);
    
    // Date of Establishment
    if (onLog) onLog('Entering Date of Establishment...');
    await fillDateField(regPage, data.dateOfEstablishment, { index: 0 });
    
    // Company Name (if not auto-filled)
    if (onLog) onLog('Entering Company Name...');
    const nameLocator = regPage.getByPlaceholder(/Enter Company Name/i);
    if (await nameLocator.isEditable()) {
      await nameLocator.fill(data.companyName);
    }
    
    // Authorize Person PAN
    if (onLog) onLog('Entering Authorize Person PAN...');
    const authPanLocator = regPage.getByPlaceholder(/Enter PAN Number/i);
    await authPanLocator.fill(''); // clear first
    await authPanLocator.pressSequentially(data.authPan, { delay: 50 });
    await authPanLocator.blur(); // Trigger validation
    
    // Authorised Person Name
    if (onLog) onLog('Entering Authorised Person Name...');
    const authNameLocator = regPage.getByPlaceholder(/Enter Name/i);
    await authNameLocator.fill('');
    await authNameLocator.pressSequentially(data.authName, { delay: 50 });
    await authNameLocator.blur();
    
    // Date of Birth — from Person PAN extraction
    if (onLog) onLog(`Entering Date of Birth...${data.authDob ? ` (${toPortalDate(data.authDob)})` : ' (missing — upload Person PAN with DOB visible)'}`);
    if (!data.authDob) {
      throw new Error('Date of Birth not found. Re-upload Person PAN card — DOB must be visible on the card.');
    }
    await fillDateField(regPage, data.authDob, { index: 1, label: 'Date of Birth' });
    
    // Submit Auth Person
    if (onLog) onLog('Submitting User Verification...');
    await regPage.getByRole('button', { name: /Submit/i }).first().click();
    
    await regPage.waitForTimeout(2000);

    const portalErr = await checkPortalError(regPage);
    if (portalErr) throw new Error(portalErr);

    // Email Address
    if (onLog) onLog('Entering Email Address...');
    const emailLocator = regPage.getByPlaceholder(/Enter Email Address/i);
    await emailLocator.fill('');
    await emailLocator.pressSequentially(data.email, { delay: 50 });
    await emailLocator.blur();
    
    // Click Get OTP
    if (onLog) onLog('Requesting Email OTP...');
    await regPage.getByText('Get OTP').first().click();
    await regPage.waitForTimeout(2000); // wait for otp to send
    
    // We will pause here and return to frontend to ask for Email OTP.
    if (onLog) onLog('Waiting for Email OTP from user...');
    
    return { success: true, step: 'WAITING_EMAIL_OTP' };
    
  } catch (err) {
    if (onLog) onLog('Error: ' + err.message);
    if (regBrowser) {
      await regBrowser.close();
      regBrowser = null;
    }
    return { success: false, error: err.message };
  }
}

export async function submitEmailOtp(otp, mobile, onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    regPage.setDefaultTimeout(20000);

    await fillOtpAndVerify(regPage, otp, 0, onLog);

    if (mobile) {
      await requestMobileOtp(regPage, mobile, onLog);
    } else if (onLog) {
      onLog('Warning: Mobile number not provided — OTP not requested');
    }

    return { success: true, step: 'WAITING_MOBILE_OTP' };
  } catch (err) {
    if (onLog) onLog('Email OTP error: ' + err.message);
    return { success: false, error: err.message };
  }
}

export async function resendEmailOtp(onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    if (onLog) onLog('Clicking Resend Email OTP...');
    await regPage.getByText('Resend OTP').first().click();
    await regPage.waitForTimeout(2000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function submitRegistrationCaptcha(captchaText, onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');

    const text = String(captchaText || '').trim();
    if (!text) {
      return { success: false, error: 'Please enter captcha' };
    }

    if (onLog) onLog('Filling captcha from user input...');
    await clearCaptchaField(regPage);
    await fillCaptchaField(regPage, text);
    await regPage.waitForTimeout(600);

    await clickSupportingDocContinue(regPage, onLog);
    await regPage.waitForTimeout(2000);

    if (await isRegistrationSuccessVisible(regPage, 15000)) {
      const successData = await captureRegistrationSuccess(regPage, onLog, { alreadyVisible: true });
      const ceprId = successData?.ceprId || null;
      const screenshotPath = successData?.screenshotPath || null;

      if (ceprId || screenshotPath) {
        await saveRegistrationDetails(buildRegistrationDbPayload(ceprId, screenshotPath));
        if (onLog) onLog(`Saved to DB — CEPR ID: ${ceprId || 'N/A'}`);
      }

      return {
        success: true,
        step: 'REGISTRATION_COMPLETE',
        ceprId,
        screenshotPath,
      };
    }

    const portalErr = await checkPortalError(regPage);
    if (portalErr && /captcha|invalid|incorrect|mismatch/i.test(portalErr)) {
      await clearCaptchaField(regPage);
      const captchaData = await getCaptchaImageDataUrl(regPage, onLog);
      return {
        success: false,
        error: portalErr || 'Invalid captcha. Please try again.',
        captchaImage: captchaData.captchaImage,
      };
    }

    if (await isRegistrationSuccessVisible(regPage, 8000)) {
      const successData = await captureRegistrationSuccess(regPage, onLog, { alreadyVisible: true });
      const ceprId = successData?.ceprId || null;
      const screenshotPath = successData?.screenshotPath || null;

      if (ceprId || screenshotPath) {
        await saveRegistrationDetails(buildRegistrationDbPayload(ceprId, screenshotPath));
      }

      return {
        success: true,
        step: 'REGISTRATION_COMPLETE',
        ceprId,
        screenshotPath,
      };
    }

    await clearCaptchaField(regPage);
    const captchaData = await getCaptchaImageDataUrl(regPage, onLog);
    return {
      success: false,
      error: portalErr || 'Captcha verification failed. Please try again.',
      captchaImage: captchaData.captchaImage,
    };
  } catch (err) {
    if (onLog) onLog('Captcha submit error: ' + err.message);
    let captchaImage;
    try {
      if (regPage) {
        const captchaData = await getCaptchaImageDataUrl(regPage, onLog);
        captchaImage = captchaData.captchaImage;
      }
    } catch {
      /* keep browser open */
    }
    return { success: false, error: err.message, captchaImage };
  }
}

export async function refreshRegistrationCaptcha(onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    if (onLog) onLog('Refreshing captcha...');
    await refreshCaptcha(regPage);
    await clearCaptchaField(regPage);
    const captchaData = await getCaptchaImageDataUrl(regPage, onLog);
    return { success: true, captchaImage: captchaData.captchaImage };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function submitMobileOtp(payload, onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    regPage.setDefaultTimeout(60000);

    const mobile = payload?.mobile;
    const otp = payload?.otp;
    const data = withRegistrationDummyFallback({ ...regPayload, ...payload });

    const mobileLocator = regPage.getByPlaceholder(/Enter Mobile Number/i);
    const mobileVal = (await mobileLocator.inputValue().catch(() => '')).replace(/\D/g, '');

    if (!mobileVal || mobileVal.length < 10) {
      await requestMobileOtp(regPage, mobile || regMobile, onLog);
    }

    if (onLog) onLog('Entering Mobile OTP...');
    await fillOtpAndVerify(regPage, otp, 1, onLog);

    const portalErr = await checkPortalError(regPage);
    if (portalErr) throw new Error(portalErr);

    await clickContinueButton(regPage, onLog);

    let generalInfoError = null;
    let supportingDocError = null;
    let filledGeneral = false;
    let submittedGeneral = false;
    let completedSupporting = false;
    let ceprId = null;
    let screenshotPath = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await waitForPortalBusy(regPage);
        await dismissPortalAlerts(regPage, onLog);
        await fillGeneralInformation(regPage, data, onLog);
        filledGeneral = true;
        await clickGeneralInfoContinue(regPage, onLog);
        submittedGeneral = true;
        generalInfoError = null;
        break;
      } catch (err) {
        if (isDuplicateAuthPersonMessage(err.message)) throw err;
        generalInfoError = err.message;
        if (onLog) onLog(`General Information attempt ${attempt}/3 failed: ${err.message}. Re-filling required fields.`);
        await dismissPortalAlerts(regPage, onLog);
        await regPage.waitForTimeout(1500);
      }
    }

    if (filledGeneral && submittedGeneral && !generalInfoError) {
      try {
        const captchaData = await uploadPanAndGetCaptcha(regPage, data, onLog);
        return {
          success: true,
          step: 'WAITING_CAPTCHA',
          captchaImage: captchaData.captchaImage,
          warning: generalInfoError || undefined,
        };
      } catch (err) {
        supportingDocError = err.message;
        if (onLog) onLog('Supporting Documents warning: ' + err.message);
      }
    }

    let step = 'USER_VERIFICATION_DONE';
    if (ceprId) {
      step = 'REGISTRATION_COMPLETE';
    } else if (completedSupporting) {
      step = 'SUPPORTING_DOC_COMPLETE';
    } else if (submittedGeneral || filledGeneral) {
      step = 'GENERAL_INFO_FILLED';
    }

    const warning = [generalInfoError, supportingDocError].filter(Boolean).join(' | ') || undefined;

    return {
      success: true,
      step,
      ceprId,
      screenshotPath,
      warning,
    };
  } catch (err) {
    if (onLog) onLog('Mobile OTP error: ' + err.message);
    return {
      success: false,
      error: err.message,
      errorCode: isDuplicateAuthPersonMessage(err.message) ? 'DUPLICATE_AUTH_PERSON' : undefined,
    };
  }
}

export async function resendMobileOtp(onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    if (onLog) onLog('Resending Mobile OTP...');

    if (regMobile) {
      await requestMobileOtp(regPage, regMobile, onLog);
      return { success: true };
    }

    const resendBtns = regPage.getByText(/^Resend OTP$/i);
    const count = await resendBtns.count();
    if (count > 1) {
      await resendBtns.nth(count - 1).click();
    } else if (count === 1) {
      await resendBtns.first().click();
    } else {
      throw new Error('Resend OTP not found for mobile');
    }
    await regPage.waitForTimeout(2000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function getRegSession() {
  try {
    if (regPage?.isClosed?.()) {
      regPage = null;
      regContext = null;
      regBrowser = null;
    }
  } catch {
    regPage = null;
    regContext = null;
    regBrowser = null;
  }
  return { browser: regBrowser, page: regPage, context: regContext };
}

export async function closeRegistrationSession() {
  if (regBrowser) {
    await regBrowser.close();
    regBrowser = null;
    regContext = null;
    regPage = null;
  }
  return { success: true };
}
