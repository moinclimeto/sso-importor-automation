let emitToast = null;
const recentKeys = [];

export function setPortalToastEmitter(fn) {
  emitToast = typeof fn === 'function' ? fn : null;
}

export function classifyPortalToast(text, className = '') {
  const blob = `${className} ${text}`.toLowerCase();
  if (/toast-error|p-toast-message-error|alert-danger|text-danger|failed|invalid|incorrect|something went wrong|required|not uploaded|not selected|unable to|mandatory/.test(blob)) {
    return 'error';
  }
  if (/toast-warning|toast-warn|p-toast-message-warn|alert-warning|please try again/.test(blob)) {
    return 'warning';
  }
  if (/toast-success|p-toast-message-success|alert-success|verified|submitted|saved|success|otp sent|otp has been/.test(blob)) {
    return 'success';
  }
  return 'info';
}

export function emitPortalToast(payload) {
  const text = String(payload?.text || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length < 3 || text.length > 400) return;
  const type = payload?.type || classifyPortalToast(text, payload?.className);
  const key = `${type}|${text}`;
  const now = Date.now();
  if (recentKeys.some((row) => row.key === key && now - row.t < 1800)) return;
  recentKeys.push({ key, t: now });
  if (recentKeys.length > 60) recentKeys.shift();
  if (!emitToast) return;
  try {
    emitToast({ text, type, t: now });
  } catch {
    /* renderer may be gone */
  }
}

function installToastWatchInPage() {
  if (window.__cpcbToastWatchInstalled) return;
  window.__cpcbToastWatchInstalled = true;

  const SELECTOR = [
    '#toast-container .toast',
    '.toast-container .toast',
    '.ngx-toastr',
    '.toast-error',
    '.toast-success',
    '.toast-info',
    '.toast-warning',
    '.p-toast-message',
    '.mat-mdc-snack-bar-container',
    '.mat-snack-bar-container',
    '[role="alert"]',
    '.alert-danger',
    '.alert-success',
    '.alert-warning',
    '.alert-info',
    '.swal2-popup',
  ].join(',');

  const seen = new Map();

  function classify(text, className) {
    const blob = `${className} ${text}`.toLowerCase();
    if (/toast-error|p-toast-message-error|alert-danger|failed|invalid|incorrect|something went wrong|required|not uploaded/.test(blob)) return 'error';
    if (/toast-warning|toast-warn|p-toast-message-warn|alert-warning/.test(blob)) return 'warning';
    if (/toast-success|p-toast-message-success|alert-success|verified|submitted|saved|success|otp sent/.test(blob)) return 'success';
    return 'info';
  }

  function report(el) {
    if (!el || el.nodeType !== 1) return;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3 || text.length > 400) return;
    const className = el.className ? String(el.className) : '';
    const key = text.slice(0, 200);
    const now = Date.now();
    if (now - (seen.get(key) || 0) < 1500) return;
    seen.set(key, now);
    const type = classify(text, className);
    if (typeof window.__reportCpcbToast === 'function') {
      window.__reportCpcbToast({ text, type, className, t: now });
    }
  }

  function scan(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.matches?.(SELECTOR)) report(root);
    if (root.querySelectorAll) {
      root.querySelectorAll(SELECTOR).forEach(report);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => scan(node));
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan(document.body);
  setInterval(() => scan(document.body), 900);
}

export async function attachPortalToastWatcher(page) {
  if (!page || page.isClosed?.()) return;
  if (page.__cpcbToastWatcherAttached) {
    await page.evaluate(installToastWatchInPage).catch(() => {});
    return;
  }
  page.__cpcbToastWatcherAttached = true;

  try {
    await page.exposeFunction('__reportCpcbToast', (payload) => {
      emitPortalToast(payload);
    });
  } catch {
    /* already exposed on this page */
  }

  await page.addInitScript(installToastWatchInPage).catch(() => {});
  await page.evaluate(installToastWatchInPage).catch(() => {});
}

export async function attachPortalToastWatcherToContext(context) {
  if (!context) return;
  if (!context.__cpcbToastBound) {
    context.__cpcbToastBound = true;
    context.on('page', (page) => {
      attachPortalToastWatcher(page).catch(() => {});
    });
  }
  const pages = typeof context.pages === 'function' ? context.pages() : [];
  for (const page of pages) {
    await attachPortalToastWatcher(page).catch(() => {});
  }
}

export async function harvestPortalToasts(page) {
  if (!page || page.isClosed?.()) return [];
  const items = await page.evaluate(() => {
    const selector = [
      '#toast-container .toast',
      '.toast-container .toast',
      '.ngx-toastr',
      '.toast-error',
      '.toast-success',
      '.toast-info',
      '.toast-warning',
      '.p-toast-message',
      '.mat-mdc-snack-bar-container',
      '.mat-snack-bar-container',
      '[role="alert"]',
      '.alert-danger',
      '.alert-success',
      '.alert-warning',
      '.alert-info',
      '.swal2-popup',
    ].join(',');
    const nodes = Array.from(document.querySelectorAll(selector));
    const out = [];
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 3 || text.length > 400) continue;
      const className = el.className ? String(el.className) : '';
      out.push({ text, className });
    }
    return out;
  }).catch(() => []);

  for (const item of items) {
    emitPortalToast({
      text: item.text,
      type: classifyPortalToast(item.text, item.className),
      className: item.className,
    });
  }
  return items;
}
