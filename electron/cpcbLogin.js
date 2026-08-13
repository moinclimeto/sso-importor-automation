import { chromium } from 'playwright';
import { getRegSession } from './cpcbRegistration.js';
import { resolveRegistrationLoginCredentials } from './registrationDummyData.js';
import {
  getCaptchaImageDataUrl,
  fillCaptchaField,
  refreshCaptcha,
} from './captchaPortal.js';

const LOGIN_URL = 'https://epr.cpcb.gov.in/login';

let loginBrowser = null;
let loginPage = null;

export function getLoginSession() {
  const reg = getRegSession();
  if (reg.page) {
    return { browser: reg.browser, page: reg.page, reusedRegistrationBrowser: true };
  }
  if (loginPage) {
    return { browser: loginBrowser, page: loginPage, reusedRegistrationBrowser: false };
  }
  return { browser: null, page: null, reusedRegistrationBrowser: false };
}

async function ensureLoginPage(onLog) {
  const existing = getLoginSession();
  if (existing.page) return existing;

  if (onLog) onLog('Opening CPCB browser for login...');
  loginBrowser = await chromium.launch({ headless: false });
  const context = await loginBrowser.newContext();
  loginPage = await context.newPage();
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
    page.locator('.final-submit-signup-form button[type="submit"]').first(),
    page.getByRole('button', { name: /^Get OTP$/i }).first(),
    page.locator('button.signup-btn-fmt').filter({ hasText: /Get OTP/i }).first(),
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
  return page
    .locator('app-otp-modal')
    .first()
    .isVisible({ timeout: timeoutMs })
    .catch(() => false);
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

  await page.locator('app-otp-modal form').first().evaluate((form) => {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  });
  await page.waitForTimeout(2500);
}

async function fillLoginOtp(page, otp, onLog) {
  const digits = String(otp || '').replace(/\D/g, '');
  if (digits.length !== 6) {
    throw new Error('Login OTP must be 6 digits');
  }

  if (onLog) onLog('Entering login OTP on portal...');

  await page.locator('app-otp-modal').first().waitFor({ state: 'visible', timeout: 20000 });
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
    const wrapper = page.locator('app-otp-modal .ng-otp-input-wrapper, app-otp-modal .otp-container').first();
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
    page.getByRole('button', { name: /^Continue$/i }),
    page.locator('button').filter({ hasText: /^Continue$/i }),
  ];

  for (const locator of continueCandidates) {
    const btn = locator.last();
    try {
      if (await btn.isVisible({ timeout: 3000 }) && await btn.isEnabled().catch(() => false)) {
        await btn.click({ timeout: 10000 });
        await page.waitForTimeout(3000);
        return;
      }
    } catch {
      /* try next */
    }
  }

  throw new Error('Could not click Continue after login OTP verification');
}

function isAuthenticatedUrl(url = '') {
  return /\/(onboarding|dashboard)\b/i.test(url);
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

    const url = page.url() || '';
    if (onLog) {
      onLog(
        isAuthenticatedUrl(url)
          ? `Login complete — browser open at ${url}`
          : 'Login verified — browser kept open'
      );
    }

    return {
      success: true,
      step: 'LOGIN_COMPLETE',
      url,
      authenticated: isAuthenticatedUrl(url),
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
