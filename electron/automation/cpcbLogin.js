import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { getRegSession, uploadDocumentByLabel } from './cpcbRegistration.js';
import { resolveRegistrationLoginCredentials } from '../db/registrationDummyData.js';
import { getRegistrationDetails } from '../db/registrationDb.js';
import { getDb } from '../db/database.js';
import {
  getCaptchaImageDataUrl,
  fillCaptchaField,
  refreshCaptcha,
} from './captchaPortal.js';
import {
  fillRemainingPartA,
  fillPartBSection4,
  fillPartBSection5,
  fillPartC
} from './fillRegistrationForms.js';

const LOGIN_URL = 'https://epr.cpcb.gov.in/login';
const DASHBOARD_URL = 'https://epr.cpcb.gov.in/dashboard';

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let loginBrowser = null;
let loginPage = null;

export function getLoginSession() {
  const reg = getRegSession();
  if (reg.page) {
    return { browser: reg.browser, page: reg.page, reusedRegistrationBrowser: true };
  }
  if (loginPage && !loginPage.isClosed()) {
    return { browser: loginBrowser, page: loginPage, reusedRegistrationBrowser: false };
  }
  return { browser: null, page: null, reusedRegistrationBrowser: false };
}

async function ensureLoginPage(onLog) {
  const existing = getLoginSession();
  if (existing.page) return existing;

  if (onLog) onLog('Opening CPCB browser for login (Persistent Session)...');
  const userDataDir = path.join(os.tmpdir(), 'playwright_cpcb_login_session');
  
  // Launch persistent context which keeps session cookies across restarts
  loginBrowser = await chromium.launchPersistentContext(userDataDir, { headless: false, args: ['--start-maximized'] });
  
  const pages = loginBrowser.pages();
  if (pages.length > 0) {
    loginPage = pages[0];
  } else {
    loginPage = await loginBrowser.newPage();
  }
  
  return { browser: loginBrowser, page: loginPage, reusedRegistrationBrowser: false };
}

function loginInput(page, formControlName) {
  return page.locator(`app-input[formcontrolname="${formControlName}"] input`).first();
}

async function clearLoginCaptchaField(page) {
  const inp = page.locator('app-captcha input.captcha-input, input[placeholder="Enter Captcha"]').first();
  await inp.fill('').catch(() => {});
}

async function checkLoginPortalError(page) {
  try {
    await page.waitForTimeout(800);
    const toastSelectors = [
      '.overlay-container',
      '.cdk-overlay-container .mat-snack-bar-container',
      '[role="alert"]',
      '.toast-error',
      '.mat-mdc-snack-bar-label',
    ];
    for (const sel of toastSelectors) {
      const el = page.locator(sel);
      const count = await el.count();
      for (let i = 0; i < count; i += 1) {
        const item = el.nth(i);
        if (!(await item.isVisible({ timeout: 300 }).catch(() => false))) continue;
        const text = (await item.innerText().catch(() => '')).trim();
        if (!text) continue;
        if (/success|verified|otp sent|otp has been/i.test(text)) continue;
        if (/invalid|captcha|incorrect|error|failed|valid 6 digit|enter a valid/i.test(text)) {
          return text.replace(/\n/g, ' ');
        }
      }
    }
    const toast = page.locator('.error-block').filter({ hasText: /.+/ });
    if (await toast.first().isVisible({ timeout: 500 }).catch(() => false)) {
      const text = (await toast.first().innerText().catch(() => '')).trim();
      if (text && /invalid|captcha|incorrect|error|failed|otp/i.test(text)) {
        return text.replace(/\n/g, ' ');
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function navigateToLoginPage(page, onLog) {
  const loginNow = page.getByRole('button', { name: /Login Now/i });
  if (await loginNow.isVisible({ timeout: 3000 }).catch(() => false)) {
    if (onLog) onLog('Clicking Login Now on registration success screen...');
    await loginNow.click();
    await page.waitForTimeout(2500);
  }

  const currentUrl = page.url() || '';
  if (!/\/login/i.test(currentUrl)) {
    if (onLog) onLog('Navigating to CPCB login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);
  }
}

async function fillLoginCredentials(page, ceprId, password, onLog) {
  if (onLog) onLog('Filling CEPR User ID and Password...');

  await page
    .locator('input[placeholder="Enter CEPR User ID"], app-input[formcontrolname="userId"] input')
    .first()
    .waitFor({ state: 'visible', timeout: 20000 });

  const userInput = loginInput(page, 'userId');
  const passInput = loginInput(page, 'password');

  const userField = (await userInput.count()) > 0
    ? userInput
    : page.locator('input[placeholder="Enter CEPR User ID"]').first();
  const passField = (await passInput.count()) > 0
    ? passInput
    : page.locator('input[placeholder="Password"], input[type="password"]').first();

  await userField.click();
  await userField.fill('');
  await userField.pressSequentially(ceprId, { delay: 30 });
  await userField.dispatchEvent('input');
  await userField.dispatchEvent('change');
  await userField.blur();

  await passField.click();
  await passField.fill('');
  await passField.pressSequentially(password, { delay: 30 });
  await passField.dispatchEvent('input');
  await passField.dispatchEvent('change');
  await passField.blur();

  await page.waitForTimeout(400);
}

async function clickGetOtp(page, onLog) {
  if (onLog) onLog('Clicking Get OTP...');

  const candidates = [
    page.locator('.login-form button[type="submit"], form button[type="submit"]').filter({ hasText: /Login|Get OTP/i }).first(),
    page.getByRole('button', { name: /^(Login|Get OTP)$/i }).first(),
    page.locator('.final-submit-signup-form button[type="submit"]').first(),
    page.locator('button').filter({ hasText: /^(Login|Get OTP)$/i }).first(),
  ];

  for (const btn of candidates) {
    try {
      if (await btn.isVisible({ timeout: 3000 }) && await btn.isEnabled().catch(() => false)) {
        await btn.click({ timeout: 10000 });
        await page.waitForTimeout(2500);
        return;
      }
    } catch {
      /* try next */
    }
  }

  throw new Error('Could not click Get OTP on login page');
}

async function isLoginOtpModalVisible(page, timeoutMs = 3000) {
  try {
    const loc = page.locator('app-otp-modal, [role="dialog"], .cdk-overlay-pane, .mat-dialog-container, .modal-content').filter({ hasText: /OTP Sent Successfully|Enter the 6-digit OTP/i }).first();
    await loc.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch (e) {
    return false;
  }
}

async function findLoginOtpModalRoot(page) {
  const candidates = [
    page.locator('app-otp-modal'),
    page.locator('[role="dialog"]').filter({ hasText: /OTP Sent Successfully|Enter the 6-digit OTP/i }),
    page.locator('.cdk-overlay-pane, .mat-dialog-container, .modal-content').filter({
      hasText: /OTP Sent Successfully|Enter the 6-digit OTP/i,
    }),
  ];

  for (const loc of candidates) {
    const el = loc.first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      return el;
    }
  }

  return page.locator('*').filter({ hasText: /OTP Sent Successfully/i }).first();
}

async function locateLoginOtpInputs(page) {
  const selectors = [
    'app-otp-modal ng-otp-input input.otp-input',
    'app-otp-modal input.otp-input[type="tel"]',
    'ng-otp-input input.otp-input',
    'app-otp-modal input.otp-input',
    '[role="dialog"] input.otp-input',
    '.mat-dialog-container input.otp-input',
    'input.otp-input',
  ];

  for (const selector of selectors) {
    const set = page.locator(selector);
    const visible = [];
    const count = await set.count();
    for (let i = 0; i < count; i += 1) {
      const input = set.nth(i);
      if (await input.isVisible().catch(() => false)) {
        visible.push(input);
      }
    }
    if (visible.length >= 6) {
      return visible.slice(0, 6);
    }
  }

  const modal = await findLoginOtpModalRoot(page);
  const modalInputs = modal.locator('input.otp-input, input[type="tel"]');
  const visible = [];
  const count = await modalInputs.count();
  for (let i = 0; i < count; i += 1) {
    const input = modalInputs.nth(i);
    if (await input.isVisible().catch(() => false)) {
      visible.push(input);
    }
  }
  if (visible.length >= 6) {
    return visible.slice(0, 6);
  }

  return null;
}

async function fillOtpViaDom(page, digits) {
  return page.evaluate((otp) => {
    const inputs = Array.from(
      document.querySelectorAll(
        'app-otp-modal ng-otp-input input.otp-input, app-otp-modal input.otp-input, ng-otp-input input.otp-input'
      )
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });

    if (inputs.length < 6) {
      return { ok: false, combined: '', count: inputs.length };
    }

    const boxes = inputs.slice(0, 6);
    for (let i = 0; i < 6; i += 1) {
      const el = boxes[i];
      el.focus();
      el.value = otp[i];
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: otp[i], inputType: 'insertText' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: otp[i], code: `Digit${otp[i]}` }));
    }
    boxes[5].blur();

    const combined = boxes.map((el) => String(el.value || '').trim()).join('').replace(/\D/g, '');
    return { ok: combined === otp, combined, count: boxes.length };
  }, digits);
}

async function fillSingleOtpBox(input, digit) {
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click({ timeout: 5000 });
  await input.fill('');
  await input.press(digit);
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await input.dispatchEvent('keyup');
}

async function readOtpBoxesValue(page) {
  return page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll(
        'app-otp-modal ng-otp-input input.otp-input, app-otp-modal input.otp-input, ng-otp-input input.otp-input'
      )
    ).filter((el) => el.offsetParent !== null);
    return inputs
      .slice(0, 6)
      .map((el) => String(el.value || '').trim())
      .join('')
      .replace(/\D/g, '');
  });
}

async function clickVerifyLoginOtp(page, onLog) {
  if (onLog) onLog('Clicking Verify OTP...');

  const candidates = [
    page.locator('app-otp-modal button[type="submit"]').first(),
    page.locator('app-otp-modal form button.signup-btn-fmt').first(),
    page.getByRole('button', { name: /^Verify OTP$/i }).first(),
  ];

  for (const btn of candidates) {
    try {
      if (await btn.isVisible({ timeout: 3000 }) && await btn.isEnabled().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ timeout: 10000 });
        await page.waitForTimeout(2500);
        return;
      }
    } catch {
      /* try next */
    }
  }

  const formLoc = page.locator('app-otp-modal form, [role="dialog"] form, .mat-dialog-container form, .modal-content form').first();
  if (await formLoc.isVisible().catch(() => false)) {
    await formLoc.evaluate((form) => {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
  }
  await page.waitForTimeout(2500);
}

async function fillLoginOtp(page, otp, onLog) {
  const digits = String(otp || '').replace(/\D/g, '');
  if (digits.length !== 6) {
    throw new Error('Login OTP must be 6 digits');
  }

  if (onLog) onLog('Entering login OTP on portal...');
  
  const rootLoc = page.locator('app-otp-modal, [role="dialog"], .cdk-overlay-pane, .mat-dialog-container, .modal-content').filter({ hasText: /OTP Sent Successfully|Enter the 6-digit OTP/i }).first();
  await rootLoc.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);

  let combined = '';

  const domResult = await fillOtpViaDom(page, digits);
  combined = domResult.combined || '';
  if (onLog) {
    onLog(`OTP DOM fill: ${combined || 'empty'} (${domResult.count || 0} boxes)`);
  }

  if (combined !== digits) {
    const boxes = await locateLoginOtpInputs(page);
    if (boxes?.length === 6) {
      if (onLog) onLog('Trying per-box OTP fill...');
      for (let i = 0; i < 6; i += 1) {
        await fillSingleOtpBox(boxes[i], digits[i]);
        await page.waitForTimeout(120);
      }
      combined = await readOtpBoxesValue(page);
    }
  }

  if (combined !== digits) {
    if (onLog) onLog('Trying OTP wrapper keyboard type...');
    const wrapper = page.locator('.ng-otp-input-wrapper, .otp-container, [role="dialog"] .ng-otp-input-wrapper').first();
    if (await wrapper.isVisible({ timeout: 2000 }).catch(() => false)) {
      await wrapper.click();
      await page.waitForTimeout(200);
      await page.keyboard.type(digits, { delay: 120 });
      combined = await readOtpBoxesValue(page);
    }
  }

  if (combined !== digits) {
    throw new Error(`Could not fill OTP on portal (got "${combined || 'empty'}")`);
  }

  if (onLog) onLog(`OTP filled on portal: ${combined}`);
  await page.waitForTimeout(400);
  await clickVerifyLoginOtp(page, onLog);
}

async function clickContinueAfterLoginVerify(page, onLog) {
  const verified = await page
    .getByText(/User Verified Successfully/i)
    .first()
    .isVisible({ timeout: 15000 })
    .catch(() => false);

  if (!verified) {
    throw new Error('User verification success screen not shown');
  }

  if (onLog) onLog('User verified — clicking Continue...');

  const continueCandidates = [
    page.getByRole('button', { name: /^(Continue|OK|Proceed|Close)$/i }),
    page.locator('button, a').filter({ hasText: /^(Continue|OK|Proceed|Close)$/i }),
    page.getByText(/^(Continue|OK)$/i),
    page.locator('.swal2-confirm, .btn-success, .btn-primary').filter({ hasText: /^(OK|Continue)$/i })
  ];

  for (const locator of continueCandidates) {
    const btn = locator.last();
    try {
      if (await btn.isVisible({ timeout: 3000 }) && await btn.isEnabled().catch(() => true)) {
        if (onLog) onLog('Found Continue button, clicking...');
        await btn.click({ timeout: 5000, force: true });
        await page.waitForTimeout(3000);
        return;
      }
    } catch {
      /* try next */
    }
  }

  // If we couldn't find a standard button, try pressing Enter or Escape
  await page.keyboard.press('Enter').catch(() => {});
  await page.waitForTimeout(2000);

}

function isAuthenticatedUrl(url = '') {
  return /\/(onboarding|dashboard|home)\b/i.test(url);
}

async function waitForDashboard(page, onLog) {
  if (onLog) onLog('Waiting for CPCB dashboard/home...');

  try {
    // Wait for a short time to see if Angular routes automatically
    await page.waitForURL(/\/(onboarding|dashboard|home)/i, { timeout: 8000 });
  } catch {
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      if (onLog) onLog('Still on login page. Reloading to force session detection...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      try {
        await page.waitForURL(/\/(onboarding|dashboard|home)/i, { timeout: 15000 });
      } catch (err) {
        if (onLog) onLog('Navigating to dashboard directly...');
        await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
    } else {
      if (onLog) onLog('Navigating to dashboard directly...');
      await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
  }

  await page.waitForTimeout(2000);
}

function getApplicantTypeModal(page) {
  return page
    .locator('[role="dialog"]')
    .filter({ hasText: /Applicant Type|Please select your application type/i })
    .last();
}

async function selectRadioByLabelInModal(page, modal, labelText, onLog) {
  const text = String(labelText || '').trim();
  if (!text) throw new Error('Radio label is required');

  if (onLog) onLog(`Selecting "${text}"...`);

  const labels = modal.locator('label').filter({
    hasText: new RegExp(`^\\s*${escapeRegex(text)}\\s*$`, 'i'),
  });
  const labelCount = await labels.count();

  for (let i = 0; i < labelCount; i += 1) {
    const label = labels.nth(i);
    if (await label.isVisible().catch(() => false)) {
      await label.scrollIntoViewIfNeeded().catch(() => {});
      await label.click({ timeout: 8000 });
      await page.waitForTimeout(800);
      return;
    }
  }

  const row = modal.locator('div').filter({ hasText: new RegExp(escapeRegex(text), 'i') }).first();
  const radio = row.locator('input[type="radio"]').first();
  if (await radio.isVisible({ timeout: 3000 }).catch(() => false)) {
    await radio.click({ timeout: 8000 });
    await page.waitForTimeout(800);
    return;
  }

  throw new Error(`Could not select option "${text}" in Applicant Type modal`);
}

async function clickPlasticWasteRegister(page, onLog) {
  if (onLog) onLog('Clicking Register on Plastic Waste Management...');

  // Find the exact text "Plastic Waste Management" and go to its parent container to find the Register button
  const plasticHeading = page.locator('h1, h2, h3, h4, h5, div, span, p').filter({ hasText: /^Plastic Waste Management$/i }).last();
  
  if (await plasticHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Traverse up to find a container that has the 'Register' button inside it, specifically looking for button.card-btn
    const registerBtn = plasticHeading.locator('xpath=ancestor::div[.//button[contains(translate(text(), "REGISTER", "register"), "register")]][1]').locator('button.card-btn, button').filter({ hasText: /Register/i }).first();
    
    if (await registerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (onLog) onLog('Found Plastic Waste Register button. Clicking...');
      await registerBtn.scrollIntoViewIfNeeded().catch(() => {});
      await registerBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      return;
    }
  }

  if (onLog) onLog('Could not strictly verify Plastic Waste container. Clicking the first Register button as fallback...');
  const fallbackEl = page.locator('button.card-btn').filter({ hasText: /Register/i }).first();
  await fallbackEl.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  
  if (await fallbackEl.isVisible().catch(() => false)) {
    await fallbackEl.scrollIntoViewIfNeeded().catch(() => {});
    await fallbackEl.click({ timeout: 5000 });
    await page.waitForTimeout(1500);
  } else {
    throw new Error('Could not find the Register button on the dashboard');
  }
}

async function clickOnboardingButton(modal, page, onLog) {
  if (onLog) onLog('Clicking Onboarding...');

  const btn = modal.locator('button[type="submit"]').filter({ hasText: /Onboarding/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(3000);
}

async function startApplicationOnboarding(page, onLog) {
  const regResult = await getRegistrationDetails();
  const applicantType = regResult.data?.applicant_type || 'PIBO';
  const subApplicantType = regResult.data?.sub_applicant_type || 'Importer';

  if (onLog) {
    onLog(`Starting application onboarding — ${applicantType} / ${subApplicantType}`);
  }

  await waitForDashboard(page, onLog);
  await clickPlasticWasteRegister(page, onLog);

  const modal = getApplicantTypeModal(page);
  await modal.waitFor({ state: 'visible', timeout: 15000 });

  // Select PIBO (first main option)
  const typeRadio = modal.locator('input[formcontrolname="type"]').first();
  await typeRadio.waitFor({ state: 'visible', timeout: 10000 });
  // Ensure we click the element, force if needed
  await typeRadio.click({ force: true, timeout: 5000 });
  await page.waitForTimeout(800);

  // Wait for the sub-options to appear
  await modal
    .getByText(/Please select one of the following|Recycler|Cement Co-processing|Importer|Producer|Brand Owner/i)
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});

  // Select Importer (second sub-option: Producer, Importer, Brand Owner)
  // We use nth(1) since Importer is typically the second radio button
  const subTypeRadios = modal.locator('input[formcontrolname="typeCategory"]');
  const subTypeCount = await subTypeRadios.count();
  
  if (subTypeCount > 1) {
    // Usually it's: 0=Producer, 1=Importer, 2=Brand Owner
    await subTypeRadios.nth(1).click({ force: true, timeout: 5000 });
  } else {
    // Fallback to text selection if formcontrolname is missing
    await selectRadioByLabelInModal(page, modal, subApplicantType, onLog);
  }
  await clickOnboardingButton(modal, page, onLog);

  // POST-ONBOARDING FLOW: 'All Applications' -> 'New Application' -> 'x'
  if (onLog) onLog('Waiting for post-onboarding dashboard...');
  await page.waitForTimeout(3000);

  const allAppsBtn = page.locator('button.applicant-btn').filter({ hasText: /All Applications/i }).first();
  await allAppsBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

  if (await allAppsBtn.isVisible().catch(() => false)) {
    if (onLog) onLog('Found "All Applications" button. Clicking it...');
    await allAppsBtn.click({ timeout: 10000 });
    await page.waitForTimeout(1500);

    const newAppBtn = page.locator('button.action-btn.btn-design').filter({ hasText: /New Application/i }).first();
    await newAppBtn.waitFor({ state: 'visible', timeout: 10000 });
    await newAppBtn.click({ timeout: 10000 });
    await page.waitForTimeout(1500);

    const closeBtn = page.locator('button.close-btn').first();
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (onLog) onLog('Closing popup...');
      await closeBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
    }

    try {
      const db = getDb();
      const docs = await db.all('SELECT doc_type, file_path, document_number FROM company_documents ORDER BY created_at DESC');
      
      const iecDoc = docs.find(d => d.doc_type === 'iec');
      if (iecDoc && iecDoc.document_number) {
        if (onLog) onLog(`Filling IEC Number: ${iecDoc.document_number}...`);
        
        // Wait longer because the Angular form might take time to render after popup close
        // Use :visible to avoid matching hidden mobile/desktop elements
        const iecInput = page.locator('input[placeholder="Enter IEC Number"]:visible, input[formcontrolname="iec_code"]:visible').first();
        
        try {
          // waitFor avoids the issue where .first() locks onto a hidden element early
          await iecInput.waitFor({ state: 'visible', timeout: 20000 });
          await iecInput.fill(iecDoc.document_number);
          await iecInput.dispatchEvent('input'); // Trigger Angular change detection
          await iecInput.dispatchEvent('change');
          await page.waitForTimeout(1000);
          if (onLog) onLog('IEC Number filled successfully.');
        } catch (e) {
          if (onLog) onLog('IEC Input field not found on this form - continuing...');
        }
      }

      // Auto-upload the rest of the documents (Company PAN, Person PAN, GST, CIN, Udyam) on the New Application dashboard
      const companyPanDoc = docs.find(d => d.doc_type === 'company_pan');
      const personPanDoc = docs.find(d => d.doc_type === 'person_pan');
      const gstDoc = docs.find(d => d.doc_type === 'gst');
      const cinDoc = docs.find(d => d.doc_type === 'cin');
      const udyamDoc = docs.find(d => d.doc_type === 'udyam');

      // Upload Company PAN
      if (companyPanDoc && companyPanDoc.file_path) {
        if (onLog) onLog('Attempting to upload Company PAN on dashboard...');
        await uploadDocumentByLabel(page, 'Company PAN', companyPanDoc.file_path, onLog);
        // If there's no separate Person PAN, try uploading Company PAN to the generic 'PAN *' field as well
        if (!personPanDoc) {
          await uploadDocumentByLabel(page, '^\\s*PAN\\s*\\*?\\s*$', companyPanDoc.file_path, onLog);
        }
      }

      // Upload Person PAN
      if (personPanDoc && personPanDoc.file_path) {
        if (onLog) onLog('Attempting to upload Person PAN on dashboard...');
        await uploadDocumentByLabel(page, '^\\s*PAN\\s*\\*?\\s*$', personPanDoc.file_path, onLog);
        // If there's no Company PAN, also try uploading the Person PAN to the 'Company PAN' field
        if (!companyPanDoc) {
          await uploadDocumentByLabel(page, 'Company PAN', personPanDoc.file_path, onLog);
        }
      }
      if (gstDoc && gstDoc.file_path) {
        if (onLog) onLog('Attempting to upload GST on dashboard...');
        await uploadDocumentByLabel(page, 'Unit GST', gstDoc.file_path, onLog);
        // Safely match "GST *" ignoring leading/trailing spaces
        await uploadDocumentByLabel(page, '^\\s*GST\\s*\\*?\\s*$', gstDoc.file_path, onLog);
      }
      if (cinDoc && cinDoc.file_path) {
        if (onLog) onLog('Attempting to upload CIN on dashboard...');
        await uploadDocumentByLabel(page, 'CIN', cinDoc.file_path, onLog);
      }
      if (udyamDoc && udyamDoc.file_path) {
        if (onLog) onLog('Attempting to upload Udyam/MSME on dashboard...');
        await uploadDocumentByLabel(page, 'Supporting document for company category', udyamDoc.file_path, onLog);
      }

      let mergedGeneralInfo = {};
      let mergedAutoData = {};
      try {
        const regDetails = await db.get('SELECT form_data_json, details_of_products_produced_marketed, representative_picture_of_plastic_packaging FROM registration_details ORDER BY _internal_id DESC LIMIT 1');
        
        if (regDetails && regDetails.form_data_json) {
          const parsed = JSON.parse(regDetails.form_data_json);
          
          // The UI saves generalInfo and autoData merged into the root of the JSON object
          // So 'parsed' contains all our fields directly.
          mergedGeneralInfo = parsed || {};
          mergedAutoData = parsed || {};
          
          if (!mergedAutoData.detailsOfProductsPath && regDetails.details_of_products_produced_marketed) {
             mergedAutoData.detailsOfProductsPath = regDetails.details_of_products_produced_marketed;
          }
          if (!mergedAutoData.representativePicturePath && regDetails.representative_picture_of_plastic_packaging) {
             mergedAutoData.representativePicturePath = regDetails.representative_picture_of_plastic_packaging;
          }
        }
      } catch (err) {
        if (onLog) onLog('Failed to fetch fields from DB: ' + err.message);
      }

      const operatingStates = Array.isArray(mergedGeneralInfo.operatingStates) ? mergedGeneralInfo.operatingStates : [];
      const hasProductionFacility = mergedGeneralInfo.hasProductionFacility || '';
      const capitalInvested = mergedGeneralInfo.capitalInvested || '';
      const yearOfCommencement = mergedGeneralInfo.yearOfCommencement || '';
      const detailsOfProducts = mergedAutoData.detailsOfProductsPath || mergedGeneralInfo.partCAuditedStatement || ''; // Using fallback or actual path
      const representativePicture = mergedAutoData.representativePicturePath || mergedGeneralInfo.partCCoveringLetter || ''; // Using fallback or actual path

      // Upload newly added files
      if (detailsOfProducts) {
        if (onLog) onLog('Attempting to upload Details of products produced/marketed...');
        await uploadDocumentByLabel(page, 'Details \\( Type & Quantity \\) of products produced/marketed', detailsOfProducts, onLog);
      }

      if (representativePicture) {
        if (onLog) onLog('Attempting to upload Representative picture...');
        await uploadDocumentByLabel(page, 'Representative picture of Plastic Packaging / Plastic packaging for commodities covering different EPR categories', representativePicture, onLog);
      }

      if (operatingStates.length > 0) {
        if (onLog) onLog('Attempting to select Operating States...');
        let foundDropdown = false;
        
        // Find the multiselect dropdown for states
        let dropdownContainer = page.locator('div.selected-items').filter({ hasText: /Select states/i }).first();
        let arrowBtn = page.locator('svg.dropdown-icon').first();

        // If not found by text (e.g. already has a state selected), try finding it near the label
        if (!(await dropdownContainer.isVisible({ timeout: 2000 }).catch(() => false))) {
           const stateLabel = page.locator('label, div').filter({ hasText: 'Select States/UTs in which the Importer is Operating' }).last();
           // Go up to a common wrapper (like a row or form-group) and find the dropdown inside
           dropdownContainer = stateLabel.locator('xpath=ancestor::div[contains(@class, "row") or contains(@class, "form-group") or contains(@class, "col")][1]//div[contains(@class, "selected-items")]').first();
           arrowBtn = dropdownContainer.locator('xpath=..//svg[contains(@class, "dropdown-icon")]').first();
        }
        
        if (await dropdownContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Click the container div to open the dropdown
          await dropdownContainer.click({ force: true, timeout: 3000 }).catch(async () => {
             await arrowBtn.click({ force: true }).catch(() => {});
          });
          foundDropdown = true;
        } else if (await arrowBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await arrowBtn.click({ force: true, timeout: 3000 }).catch(() => {});
          foundDropdown = true;
        } else {
          if (onLog) onLog('ERROR: Could not find or open States dropdown. Saving screenshot to states_dropdown_error.png');
          await page.screenshot({ path: 'states_dropdown_error.png', fullPage: true }).catch(() => {});
        }

        if (foundDropdown) {
          await page.waitForTimeout(1000);
          
          for (const state of operatingStates) {
            // Type the state into the search bar to filter the list and make it visible
            const searchInput = page.locator('input.search-input, input[placeholder="Select states"], input[placeholder="Search"]').first();
            if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              await searchInput.click();
              await searchInput.fill('');
              await page.keyboard.press('Control+A');
              await page.keyboard.press('Backspace');
              await searchInput.fill(state);
              // Wait for Angular to filter the list
              await page.waitForTimeout(600);
            } else {
               if (onLog) onLog('WARNING: Search input not found inside dropdown. Proceeding without search...');
            }

            // Find any visible option in the dropdown that contains the state text
            let optionRow = page.locator('.ng-option, .dropdown-item, li, mat-option').filter({ hasText: new RegExp(escapeRegex(state), 'i') }).first();
            
            if ((await optionRow.count().catch(() => 0)) === 0) {
               optionRow = page.getByText(new RegExp(escapeRegex(state), 'i')).filter({ visible: true }).last();
            }
            
            if (await optionRow.isVisible({ timeout: 3000 }).catch(() => false)) {
              if (onLog) onLog(`Selecting operating state: ${state}`);
              // Click the row directly
              await optionRow.scrollIntoViewIfNeeded().catch(() => {});
              
              // If there IS a real checkbox inside, try clicking that first, otherwise click the row
              const realCheckbox = optionRow.locator('input[type="checkbox"]').first();
              if (await realCheckbox.isVisible({ timeout: 500 }).catch(() => false)) {
                 await realCheckbox.click({ force: true }).catch(() => optionRow.click({ force: true }));
              } else {
                 await optionRow.click({ force: true });
              }
              await page.waitForTimeout(500);
            } else {
              if (onLog) onLog(`ERROR: Could not find checkbox for operating state: ${state}. Saving screenshot to state_checkbox_error_${state}.png`);
              await page.screenshot({ path: `state_checkbox_error_${state}.png` }).catch(() => {});
            }
          }
          
          // Press escape to close the dropdown
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        } else {
          if (onLog) onLog('Select states dropdown not found on this form - continuing...');
        }
      }

      if (hasProductionFacility) {
        if (onLog) onLog(`Setting Production Facility to ${hasProductionFacility}...`);
        const prodFacSelect = page.locator('label[title*="Does the Importer have a Production Facility"]').locator('..').locator('..').locator('select');
        if (await prodFacSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
           // For importers, CPCB portal only offers 'Not Applicable' instead of Yes/No. 
           // If 'Yes', we can't select it, but we can try to select 'no' or 'yes' safely.
           await prodFacSelect.selectOption({ label: hasProductionFacility }).catch(async () => {
              if (hasProductionFacility.toLowerCase().includes('not applicable')) {
                 await prodFacSelect.selectOption({ value: 'no' }).catch(() => {});
              } else {
                 await prodFacSelect.selectOption({ value: hasProductionFacility.toLowerCase() }).catch(() => {});
              }
           });
        }
      }

      if (capitalInvested) {
        if (onLog) onLog(`Filling Capital Invested: ${capitalInvested}...`);
        const capInput = page.locator('input[placeholder="Enter Total Capital Invested"]').first();
        if (await capInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await capInput.fill(capitalInvested).catch(() => {});
        }
      }

      if (yearOfCommencement) {
        if (onLog) onLog(`Setting Year of Commencement to ${yearOfCommencement}...`);
        const yearSelect = page.locator('select.select-field').filter({ has: page.locator('option[value="2020"]') }).first();
        if (await yearSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
           await yearSelect.selectOption({ value: yearOfCommencement }).catch(() => {});
        }
      }
      
      // Execute the massive Phase 2 automation for new fields
      await fillRemainingPartA(page, mergedGeneralInfo, mergedAutoData, onLog);
      
      if (onLog) onLog('Clicking Save & Next for Part A...');
      await page.getByRole('button', { name: /Save & Next/i }).first().click().catch(() => {});
      await page.waitForTimeout(2000);

      await fillPartBSection4(page, mergedGeneralInfo.partBSection4 || mergedGeneralInfo.section4Data, onLog);
      
      if (onLog) onLog('Clicking Save & Next for Part B Section 4...');
      await page.getByRole('button', { name: /Save & Next/i }).first().click().catch(() => {});
      await page.waitForTimeout(2000);

      await fillPartBSection5(page, mergedGeneralInfo.partBTransactions, onLog);
      
      if (onLog) onLog('Clicking Save & Next for Part B...');
      await page.getByRole('button', { name: /Save & Next/i }).first().click().catch(() => {});
      await page.waitForTimeout(2000);

      await fillPartC(page, mergedGeneralInfo, onLog);
    } catch (err) {
      if (onLog) onLog('Failed to fetch/fill documents: ' + err.message);
    }
      
    if (onLog) onLog('Stopped before Submit & Pay.');
    return { success: true, step: 'APPLICATION_ONBOARDING_COMPLETE' };
  }

  const finalUrl = page.url() || '';
  if (onLog) onLog(`Onboarding submitted — browser at ${finalUrl}`);

  return {
    applicantType,
    subApplicantType,
    url: finalUrl,
  };
}

export async function startLoginFlow(payload, onLog) {
  try {
    const ceprId = String(payload?.ceprId || payload?.userId || '').trim();
    const creds = resolveRegistrationLoginCredentials({
      email: payload?.email,
      mobile: payload?.mobile,
      password: payload?.password,
    });
    const password = creds.password;
    if (!ceprId || !password) {
      return { success: false, error: 'CEPR User ID and Password are required' };
    }

    const { page } = await ensureLoginPage(onLog);
    
    // Check if we are already logged in before navigating to login
    try {
      // If we are at about:blank or login, let's just go to DASHBOARD_URL first to test.
      if (!page.url() || page.url() === 'about:blank' || page.url().includes('/login')) {
         if (onLog) onLog('Checking active session by navigating to dashboard...');
         await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
         
         // Wait for either the URL to switch to login or the login form to appear, up to 4s.
         // If it's authenticated, it should stay on dashboard and not show login elements.
         try {
           await Promise.race([
             page.waitForURL(/\/login/i, { timeout: 4000 }),
             page.waitForSelector('input[placeholder="Enter CEPR User ID"], app-input[formcontrolname="userId"] input', { timeout: 4000 })
           ]);
         } catch (e) {
           // It didn't redirect or show login in 4s, it might be actually authenticated.
         }
      }
      
      const isLoginVisible = await page.locator('input[placeholder="Enter CEPR User ID"], app-input[formcontrolname="userId"] input').first().isVisible({ timeout: 1000 }).catch(() => false);
      
      if (!isLoginVisible && isAuthenticatedUrl(page.url())) {
         if (onLog) onLog('Session is already authenticated. Skipping login flow and starting onboarding...');
         
         let onboardingResult = null;
         try {
           onboardingResult = await startApplicationOnboarding(page, onLog);
         } catch (onboardErr) {
           if (onLog) onLog('Application onboarding warning: ' + onboardErr.message);
           return {
             success: false,
             step: 'APPLICATION_ONBOARDING_COMPLETE',
             url: page.url(),
             authenticated: true,
             error: `Session active but application onboarding failed: ${onboardErr.message}`,
           };
         }
         
         if (onLog) {
           onLog(`Application onboarding complete — ${onboardingResult.applicantType} / ${onboardingResult.subApplicantType}`);
         }
         
         return {
           success: true,
           step: 'APPLICATION_ONBOARDING_COMPLETE',
           url: onboardingResult?.url || page.url(),
           authenticated: true,
           applicantType: onboardingResult.applicantType,
           subApplicantType: onboardingResult.subApplicantType,
         };
      }
    } catch (checkErr) {
       // Ignore errors in check and proceed to normal login
    }

    await navigateToLoginPage(page, onLog);
    await fillLoginCredentials(page, ceprId, password, onLog);

    const captchaData = await getCaptchaImageDataUrl(page, onLog);
    if (onLog) onLog('Enter login captcha in the app');

    return {
      success: true,
      step: 'WAITING_LOGIN_CAPTCHA',
      captchaImage: captchaData.captchaImage,
    };
  } catch (err) {
    if (onLog) onLog('Login start error: ' + err.message);
    return { success: false, error: err.message };
  }
}

export async function refreshLoginCaptcha(onLog) {
  try {
    const { page } = getLoginSession();
    if (!page) throw new Error('Browser session not active');

    if (onLog) onLog('Refreshing login captcha...');
    await refreshCaptcha(page);
    await clearLoginCaptchaField(page);
    const captchaData = await getCaptchaImageDataUrl(page, onLog);
    return { success: true, captchaImage: captchaData.captchaImage };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function submitLoginCaptcha(captchaText, onLog) {
  try {
    const { page } = getLoginSession();
    if (!page) throw new Error('Browser session not active');

    const text = String(captchaText || '').trim();
    if (!text) {
      return { success: false, error: 'Please enter captcha' };
    }

    if (onLog) onLog('Filling login captcha...');
    await clearLoginCaptchaField(page);
    await fillCaptchaField(page, text);
    await page.waitForTimeout(600);

    await clickGetOtp(page, onLog);

    if (await isLoginOtpModalVisible(page, 15000)) {
      if (onLog) onLog('OTP sent — enter OTP in the app');
      return { success: true, step: 'WAITING_LOGIN_OTP' };
    }

    const portalErr = await checkLoginPortalError(page);
    if (portalErr && /captcha|invalid|incorrect/i.test(portalErr)) {
      await clearLoginCaptchaField(page);
      const captchaData = await getCaptchaImageDataUrl(page, onLog);
      return {
        success: false,
        error: portalErr,
        captchaImage: captchaData.captchaImage,
      };
    }

    if (await isLoginOtpModalVisible(page, 5000)) {
      return { success: true, step: 'WAITING_LOGIN_OTP' };
    }

    if (onLog) onLog('ERROR: OTP modal did not appear. Saving screenshot to login_stuck.png');
    await page.screenshot({ path: 'login_stuck.png', fullPage: true }).catch(() => {});

    const captchaData = await getCaptchaImageDataUrl(page, onLog);
    return {
      success: false,
      error: portalErr || 'Could not request login OTP. Check captcha and try again.',
      captchaImage: captchaData.captchaImage,
    };
  } catch (err) {
    if (onLog) onLog('Login captcha error: ' + err.message);
    let captchaImage;
    try {
      const { page } = getLoginSession();
      if (page) {
        const captchaData = await getCaptchaImageDataUrl(page, onLog);
        captchaImage = captchaData.captchaImage;
      }
    } catch {
      /* keep browser open */
    }
    return { success: false, error: err.message, captchaImage };
  }
}

export async function submitLoginOtp(otp, onLog) {
  try {
    const { page } = getLoginSession();
    if (!page) throw new Error('Browser session not active');

    await fillLoginOtp(page, otp, onLog);

    const portalErrAfterVerify = await checkLoginPortalError(page);
    if (portalErrAfterVerify) {
      return { success: false, error: portalErrAfterVerify };
    }

    const verified = await page
      .getByText(/User Verified Successfully/i)
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false);

    if (!verified) {
      const portalErr = await checkLoginPortalError(page);
      if (portalErr) {
        return { success: false, error: portalErr };
      }
      return {
        success: false,
        error: 'Login OTP verification failed — check OTP and try again',
      };
    }

    await clickContinueAfterLoginVerify(page, onLog);

    let onboardingResult = null;
    try {
      onboardingResult = await startApplicationOnboarding(page, onLog);
    } catch (onboardErr) {
      if (onLog) onLog('Application onboarding warning: ' + onboardErr.message);
      const url = page.url() || '';
      return {
        success: false,
        step: 'LOGIN_COMPLETE',
        url,
        authenticated: isAuthenticatedUrl(url),
        error: `Login succeeded but application onboarding failed: ${onboardErr.message}`,
      };
    }

    const url = onboardingResult?.url || page.url() || '';
    if (onLog) {
      onLog(
        `Application onboarding complete — ${onboardingResult.applicantType} / ${onboardingResult.subApplicantType}`
      );
    }

    return {
      success: true,
      step: 'APPLICATION_ONBOARDING_COMPLETE',
      url,
      authenticated: isAuthenticatedUrl(url),
      applicantType: onboardingResult.applicantType,
      subApplicantType: onboardingResult.subApplicantType,
    };
  } catch (err) {
    if (onLog) onLog('Login OTP error: ' + err.message);
    let portalErr;
    try {
      const { page } = getLoginSession();
      if (page) portalErr = await checkLoginPortalError(page);
    } catch {
      /* ignore */
    }
    return { success: false, error: portalErr || err.message };
  }
}

export async function resendLoginOtp(onLog) {
  try {
    const { page } = getLoginSession();
    if (!page) throw new Error('Browser session not active');

    if (onLog) onLog('Resending login OTP...');
    const resend = page.locator('app-otp-modal').getByText(/Send OTP again|Resend OTP/i).first();
    await resend.click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
