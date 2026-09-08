/**
 * DEV / temporary flow: open an existing DRAFT on CPCB, skip Part A fill,
 * click Save & Next, then run Part B (+ Part C) automation only.
 * Safe to delete once full registration automation is stable.
 */
import {
  advanceDraftPartAToPartB,
  fillPartBAndPartCOnly,
  loadApplicationFormDataFromDb,
} from './fillRegistrationForms.js';
import { waitForPortalBusy } from './portalErrorGuard.js';

const APPLICATIONS_URL = 'https://epr.cpcb.gov.in/onboarding/applications';

async function waitForCpcbLoaderGone(page, timeoutMs = 30000) {
  const loader = page.locator('app-loader, .loader-wrapper, .loader-overlay').first();
  try {
    await loader.waitFor({ state: 'hidden', timeout: timeoutMs });
  } catch {
    /* loader may never appear */
  }
  await page.waitForTimeout(400);
}

async function clickAllApplicationsTab(page, onLog) {
  const allAppsBtn = page.locator('button.applicant-btn, button.btn-design').filter({
    hasText: /All Applications?/i,
  }).first();
  if (await allAppsBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
    if (onLog) onLog('Clicking All Application tab…');
    await allAppsBtn.click({ timeout: 8000 }).catch(() => {});
    await waitForCpcbLoaderGone(page, 40000);
    await page.waitForTimeout(1000);
  }
}

async function countApplicationRows(page) {
  return page.locator('table tbody tr:visible, .table-responsive tbody tr:visible').count().catch(() => 0);
}

async function waitForApplicationsTable(page, onLog, { rowIndex = 0, timeoutMs = 45000 } = {}) {
  const needRows = rowIndex + 1;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await waitForCpcbLoaderGone(page, 8000);
    await waitForPortalBusy(page, 12000).catch(() => {});

    const rows = await countApplicationRows(page);
    if (rows >= needRows) {
      if (onLog) onLog(`Applications table ready (${rows} row(s)).`);
      return rows;
    }

    if (onLog) onLog(`Waiting for applications table (${rows}/${needRows} rows)…`);
    await clickAllApplicationsTab(page, onLog);
    await page.waitForTimeout(1200);
  }

  throw new Error(`Applications table did not load (${await countApplicationRows(page)} row(s) visible).`);
}

async function locateDraftViewButton(page, rowIndex = 0) {
  const rowLocators = [
    page.locator('table tbody tr:visible').nth(rowIndex),
    page.locator('.table-responsive tbody tr:visible').nth(rowIndex),
    page.locator('tr').filter({ hasText: /\bDRAFT\b/i }).nth(rowIndex),
  ];

  for (const row of rowLocators) {
    if (!(await row.count().catch(() => 0))) continue;
    if (!(await row.isVisible({ timeout: 1500 }).catch(() => false))) continue;

    const candidates = [
      row.locator('button.action-btn[title="View"]').first(),
      row.locator('button.action-btn[title*="View" i]').first(),
      row.locator('button.action-btn:has(img[src*="eye"])').first(),
      row.locator('button.action-btn').first(),
      row.getByRole('button', { name: /^View$/i }).first(),
    ];

    for (const btn of candidates) {
      if (await btn.isVisible({ timeout: 1200 }).catch(() => false)) return btn;
    }
  }

  const globalCandidates = [
    page.getByRole('button', { name: /^View$/i }).nth(rowIndex),
    page.locator('button.action-btn[title="View"]:visible').nth(rowIndex),
    page.locator('button.action-btn:visible').filter({
      has: page.locator('img[src*="eye"]'),
    }).nth(rowIndex),
  ];

  for (const btn of globalCandidates) {
    if (await btn.isVisible({ timeout: 1200 }).catch(() => false)) return btn;
  }

  return null;
}

async function clickDraftViewViaDom(page, rowIndex = 0) {
  return page.evaluate((idx) => {
    const rowSelectors = ['table tbody tr', '.table-responsive tbody tr'];
    let rows = [];
    for (const sel of rowSelectors) {
      const found = Array.from(document.querySelectorAll(sel)).filter((tr) => {
        const style = window.getComputedStyle(tr);
        return style.display !== 'none' && style.visibility !== 'hidden' && tr.offsetParent !== null;
      });
      if (found.length) {
        rows = found;
        break;
      }
    }
    if (!rows.length) {
      rows = Array.from(document.querySelectorAll('tr')).filter((tr) =>
        /\bDRAFT\b/i.test(tr.textContent || ''),
      );
    }

    const row = rows[idx];
    if (!row) return false;

    const btn = row.querySelector('button.action-btn[title="View"]')
      || row.querySelector('button.action-btn img[src*="eye"]')?.closest('button')
      || row.querySelector('button.action-btn')
      || Array.from(row.querySelectorAll('button')).find((b) =>
        /view/i.test(b.getAttribute('title') || '') || b.querySelector('img[src*="eye"]'),
      );

    if (!btn) return false;
    btn.scrollIntoView({ block: 'center', inline: 'center' });
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    btn.click();
    return true;
  }, rowIndex);
}

export async function openFirstDraftApplication(page, onLog, { rowIndex = 0 } = {}) {
  const url = page.url() || '';
  if (!/\/onboarding\/applications/i.test(url)) {
    if (onLog) onLog('Navigating to Applications list…');
    await page.goto(APPLICATIONS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } else if (onLog) {
    onLog('Already on Applications URL — loading table…');
  }

  await waitForCpcbLoaderGone(page, 40000);
  await clickAllApplicationsTab(page, onLog);
  await waitForApplicationsTable(page, onLog, { rowIndex });

  let viewBtn = await locateDraftViewButton(page, rowIndex);
  let clicked = false;

  if (viewBtn) {
    if (onLog) onLog(`Clicking View on draft row ${rowIndex + 1}…`);
    await viewBtn.scrollIntoViewIfNeeded().catch(() => {});
    try {
      await viewBtn.click({ timeout: 10000 });
      clicked = true;
    } catch {
      if (onLog) onLog('Playwright click failed — retrying View with force…');
      await viewBtn.click({ force: true, timeout: 8000 }).catch(() => {});
      clicked = true;
    }
  }

  if (!clicked) {
    if (onLog) onLog('View button not found via locators — trying DOM click…');
    clicked = await clickDraftViewViaDom(page, rowIndex);
  }

  if (!clicked) {
    await page.screenshot({ path: 'draft_view_button_error.png', fullPage: true }).catch(() => {});
    throw new Error('Draft View (eye) button not found on Applications list.');
  }

  await waitForCpcbLoaderGone(page, 40000);
  await waitForPortalBusy(page, 25000).catch(() => {});

  try {
    await page.waitForURL(/view-application/i, { timeout: 30000 });
  } catch {
    await page.waitForFunction(
      () => /view-application/i.test(window.location.pathname || window.location.href),
      { timeout: 8000 },
    ).catch(() => {});
  }
  await page.waitForTimeout(1200);

  if (!/view-application/i.test(page.url() || '')) {
    throw new Error(`Expected view-application page after View click — got ${page.url()}`);
  }
}

export async function runResumeDraftApplicationFlow(page, onLog, options = {}) {
  const { fillPartB = true, rowIndex = 0 } = options;
  if (!page) {
    return { success: false, error: 'Browser session not active — login first.' };
  }

  try {
    if (onLog) onLog('[Dev] Resume draft — open DRAFT, Save & Next on Part A (no fill), then Part B/C.');
    await openFirstDraftApplication(page, onLog, { rowIndex });
    await advanceDraftPartAToPartB(page, onLog);

    if (fillPartB) {
      const formData = await loadApplicationFormDataFromDb(onLog);
      await fillPartBAndPartCOnly(page, formData, onLog);
    }

    if (onLog) onLog('[Dev] Draft resumed — now on Part B (or Part C if fill completed).');
    return {
      success: true,
      step: 'DRAFT_RESUMED_PART_B',
      url: page.url() || '',
    };
  } catch (err) {
    if (onLog) onLog(`[Dev] Resume draft failed: ${err.message}`);
    return {
      success: false,
      step: 'DRAFT_RESUME_FAILED',
      error: err.message,
      url: page.url?.() || '',
    };
  }
}
