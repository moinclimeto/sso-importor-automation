import { harvestPortalToasts } from './portalToastWatcher.js';

const IGNORE_RE =
  /payment bypass|already completed the payment|submit application|click to pay|payu|transaction id|otp sent successfully|otp has been/i;

const BLOCKING_RE =
  /please (fill|select|upload|enter|attach|choose)|required|mandatory|not uploaded|not selected|not entered|missing|something went wrong|try again|network|unable to|failed to|invalid|at least one|document .*not|upload .*document|field .*empty|cannot be empty|is required|already exists|authorised person|authorized person|conflict/i;

const SUCCESS_RE =
  /success|verified|submitted|saved|registered|otp has been|otp sent|valid otp|sent successfully|pan details submitted/i;

const ALERT_SELECTORS = [
  '.toast-error',
  '.toast-message',
  '.toast-title',
  '#toast-container .toast',
  '.ngx-toastr',
  '.toast-container .toast',
  '.p-toast-message',
  '.p-toast-detail',
  '.p-toast-summary',
  '.p-dialog-content',
  '.p-confirm-dialog-message',
  '.swal2-html-container',
  '.swal2-title',
  '[role="alert"]',
  '.alert-danger',
  '.alert-warning',
  '.mat-mdc-snack-bar-label',
  '.mat-snack-bar-container',
  'mat-error',
  '.invalid-feedback',
  '.text-danger',
  '.p-error',
  '.error-message',
  '.modal-body',
].join(', ');

export function isBlockingPortalError(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 500) return false;
  if (IGNORE_RE.test(t)) return false;
  if (SUCCESS_RE.test(t) && !/invalid|incorrect|failed|something went wrong|required/i.test(t)) {
    return false;
  }
  return BLOCKING_RE.test(t);
}

export async function waitForPortalBusy(page, timeoutMs = 25000) {
  const loader = page.locator(
    'app-loader, .loader-wrapper, .loader-overlay, .ngx-overlay, .block-ui, .p-progress-spinner, .spinner-border, .loading-shade'
  ).first();
  const started = Date.now();
  try {
    await loader.waitFor({ state: 'visible', timeout: 800 });
  } catch {
    /* loader may never appear */
  }
  try {
    await loader.waitFor({ state: 'hidden', timeout: timeoutMs });
  } catch {
    /* keep going */
  }
  const remain = Math.max(200, 600 - (Date.now() - started));
  await page.waitForTimeout(remain);
}

export async function collectPortalAlerts(page) {
  await harvestPortalToasts(page).catch(() => {});
  const texts = await page.evaluate((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    const out = [];
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && text.length < 400) out.push(text);
    }
    return out;
  }, ALERT_SELECTORS).catch(() => []);

  const unique = [];
  for (const text of texts) {
    if (!unique.includes(text)) unique.push(text);
  }
  return unique.filter(isBlockingPortalError);
}

export async function dismissPortalAlerts(page, onLog) {
  const closeButtons = [
    page.locator('.p-toast-icon-close, .toast-close-button, .p-dialog-header-close, .swal2-close').first(),
    page.getByRole('button', { name: /^(OK|Ok|Close|Dismiss)$/i }).first(),
    page.locator('.swal2-confirm, .p-confirm-dialog-accept, .modal .btn-primary, .modal .btn-success').filter({
      hasText: /^(OK|Ok|Close|Yes)$/i,
    }).first(),
  ];

  const alerts = await collectPortalAlerts(page);
  const looksLikePayment = alerts.some((t) => IGNORE_RE.test(t));
  if (looksLikePayment) return;

  for (const btn of closeButtons) {
    if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      if (onLog) onLog('Closed CPCB portal error popup.');
      await page.waitForTimeout(400);
    }
  }

  await page.keyboard.press('Escape').catch(() => {});
}

export async function countInvalidControls(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll(
      'input.ng-invalid, select.ng-invalid, textarea.ng-invalid, .ng-invalid.ng-touched, .ng-invalid.ng-dirty'
    );
    return nodes.length;
  }).catch(() => 0);
}

export async function fillUntilPortalAccepts(page, {
  stepName,
  fillFn,
  saveFn,
  isReadyFn,
  onLog,
  maxAttempts = 4,
} = {}) {
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (onLog) onLog(`${stepName}: filling required fields (attempt ${attempt}/${maxAttempts})...`);
    await waitForPortalBusy(page);
    await dismissPortalAlerts(page, onLog);

    await fillFn();
    await waitForPortalBusy(page);
    await page.waitForTimeout(700);

    const errorsAfterFill = await collectPortalAlerts(page);
    if (errorsAfterFill.length) {
      lastError = errorsAfterFill.join(' | ');
      if (onLog) onLog(`${stepName}: portal error after fill — ${lastError}. Will re-fill.`);
      await dismissPortalAlerts(page, onLog);
      await page.waitForTimeout(1200);
      continue;
    }

    if (typeof isReadyFn === 'function' && !(await isReadyFn())) {
      lastError = `${stepName} required values are still missing`;
      if (onLog) onLog(`${lastError}. Will re-fill.`);
      await page.waitForTimeout(800);
      continue;
    }

    if (typeof saveFn !== 'function') return true;

    const saved = await saveFn();
    await waitForPortalBusy(page);
    await page.waitForTimeout(900);

    const errorsAfterSave = await collectPortalAlerts(page);
    if (errorsAfterSave.length) {
      lastError = errorsAfterSave.join(' | ');
      if (onLog) onLog(`${stepName}: portal rejected save — ${lastError}. Re-filling required fields.`);
      await dismissPortalAlerts(page, onLog);
      await page.waitForTimeout(1500);
      continue;
    }

    if (saved) {
      if (onLog) onLog(`${stepName}: accepted by portal.`);
      return true;
    }

    lastError = `${stepName} did not move to the next step`;
    if (onLog) onLog(`${lastError}. Re-filling and retrying.`);
    await dismissPortalAlerts(page, onLog);
    await page.waitForTimeout(1200);
  }

  throw new Error(
    `${stepName} failed after ${maxAttempts} attempts${lastError ? `: ${lastError}` : ''}`
  );
}
