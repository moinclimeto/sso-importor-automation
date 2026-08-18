import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { uploadDocumentByLabel } from './cpcbRegistration.js';
import { getDb } from '../db/database.js';
import { notifyPaymentBypassPrompt, waitForPaymentBypassAnswer } from './paymentBypassBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DUMMY_PDF = path.resolve(__dirname, '../../data/dummy_pan.pdf');

const ZERO_CATS = { cat1: '0', cat2: '0', cat3: '0', cat4: '0' };
const ZERO_PLASTIC = {
  '2024-25': { ...ZERO_CATS },
  '2025-26': { ...ZERO_CATS },
};

function existingFile(pathValue) {
  if (pathValue && typeof pathValue === 'string' && fs.existsSync(pathValue)) return pathValue;
  return '';
}

function firstExistingPath(...candidates) {
  for (const p of candidates) {
    const found = existingFile(p);
    if (found) return found;
  }
  return '';
}

function dummyPdfOr(pathValue) {
  return firstExistingPath(pathValue, DUMMY_PDF);
}

function pickUserFile(...values) {
  for (const value of values) {
    const found = existingFile(value);
    if (found) return found;
  }
  return '';
}

export function normalizeApplicationData(raw = {}) {
  const nested = raw.generalInfo && typeof raw.generalInfo === 'object' ? raw.generalInfo : {};
  const nestedAuto = raw.autoData && typeof raw.autoData === 'object' ? raw.autoData : {};
  const src = { ...nested, ...nestedAuto, ...raw };

  return {
    operatingStates: Array.isArray(src.operatingStates) ? src.operatingStates : [],
    hasProductionFacility: src.hasProductionFacility || '',
    capitalInvested: src.capitalInvested || '',
    yearOfCommencement: src.yearOfCommencement || '2026',
    plasticConsumed: ZERO_PLASTIC,
    complianceStatus: src.complianceStatus || '',
    thicknessOfPlastic: src.thicknessOfPlastic || '',
    isSameAsRegisteredAddress: src.isSameAsRegisteredAddress ?? true,
    plantAddress: src.plantAddress || '',
    unitGst: src.unitGst || '',
    iec: src.iec || src.iecNumber || '',
    typeOfCompanyDoc: existingFile(src.typeOfCompanyDoc),
    unitGstDoc: existingFile(src.unitGstDoc),
    detailsOfProductsPath: pickUserFile(
      src.detailsOfProductsPath,
      src.detailsOfProductsPath,
      nestedAuto.detailsOfProductsPath,
      nestedAuto.detailsOfProductsPath,
      src.details_of_products_produced_marketed
    ),
    representativePicturePath: pickUserFile(
      src.representativePicturePath,
      src.representativePicturePath,
      nestedAuto.representativePicturePath,
      nestedAuto.representativePicturePath,
      src.representative_picture_of_plastic_packaging
    ),
    partCCoveringLetter: pickUserFile(
      src.partCCoveringLetter,
      src.partCCoveringLetter,
      nested.partCCoveringLetter,
      nested.partCCoveringLetter
    ),
    partCSignature: pickUserFile(
      src.partCSignature,
      src.partCSignature,
      nested.partCSignature
    ),
    partCAuditedStatement: pickUserFile(
      src.partCAuditedStatement,
      src.partCAuditedStatement,
      nested.partCAuditedStatement,
      nested.partCAuditedStatement
    ),
  };
}

async function loadCompanyDocs() {
  try {
    const db = getDb();
    const docs = await db.all(
      'SELECT doc_type, file_path, document_number FROM company_documents ORDER BY created_at DESC'
    );
    const pick = (type) => docs.find((d) => d.doc_type === type) || null;
    return {
      companyPan: pick('company_pan'),
      personPan: pick('person_pan'),
      gst: pick('gst'),
      cin: pick('cin'),
      udyam: pick('udyam'),
      iec: pick('iec'),
    };
  } catch {
    return {};
  }
}

async function isPartBVisible(page) {
  return page.getByText(/Part B:|Pertaining to Liquid Effluent/i).first().isVisible({ timeout: 2500 }).catch(() => false);
}

async function isPartCVisible(page) {
  return page.getByText(/Part C:|EPR Action Plan/i).first().isVisible({ timeout: 2500 }).catch(() => false);
}

async function clickSaveAndNext(page, onLog, stepName) {
  if (stepName === 'Part A') {
    const hasState = await page.locator('.chip').filter({ hasText: /Madhya Pradesh/i }).first().isVisible({ timeout: 1500 }).catch(() => false);
    if (!hasState) {
      if (onLog) onLog('Not clicking Save & Next — Part A 2a state chip is missing.');
      return false;
    }
  }

  if (onLog) onLog(`Clicking Save & Next (${stepName})...`);
  const btn = page.getByRole('button', { name: /Save\s*&\s*Next/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 10000 }).catch(() => btn.click({ force: true }));
  await page.waitForTimeout(3000);

  const portalErr = await page.getByText(/Please select at least one state|Please fill all required/i).first().isVisible({ timeout: 1200 }).catch(() => false);
  if (portalErr) {
    if (onLog) onLog('Portal validation error after Save & Next — staying on this part.');
    return false;
  }

  if (stepName === 'Part A') {
    const moved = await isPartBVisible(page);
    if (!moved) {
      if (onLog) onLog('Still on Part A after Save & Next. Will not fill Part B/C.');
      return false;
    }
    if (onLog) onLog('Moved to Part B.');
  }
  if (stepName === 'Part B') {
    const moved = await isPartCVisible(page);
    if (!moved) {
      if (onLog) onLog('Still on Part B after Save & Next. Will not fill Part C.');
      return false;
    }
    if (onLog) onLog('Moved to Part C.');
  }
  return true;
}

async function uploadNearLabel(page, labelPattern, filePath, onLog) {
  if (!filePath) return false;
  const file = existingFile(filePath);
  if (!file) {
    if (onLog) onLog(`No file available for ${labelPattern}`);
    return false;
  }

  try {
    await uploadDocumentByLabel(page, labelPattern, file, onLog);
    return true;
  } catch (err) {
    if (onLog) onLog(`uploadDocumentByLabel "${labelPattern}" failed: ${err.message}`);
  }

  try {
    const label = page.getByText(new RegExp(labelPattern, 'i')).first();
    if (!(await label.isVisible({ timeout: 2500 }).catch(() => false))) return false;
    await label.scrollIntoViewIfNeeded();
    const box = label.locator('xpath=ancestor::div[contains(@class,"col") or contains(@class,"form") or contains(@class,"row")][1]');
    const fileInput = box.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(file);
      await page.waitForTimeout(1200);
      if (onLog) onLog(`Uploaded ${labelPattern} via nearby file input`);
      return true;
    }
    const uploadBtn = box.getByText(/^Upload$/i).first();
    if (await uploadBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        uploadBtn.click(),
      ]);
      await chooser.setFiles(file);
      await page.waitForTimeout(1200);
      if (onLog) onLog(`Uploaded ${labelPattern} via Upload link`);
      return true;
    }
  } catch (err) {
    if (onLog) onLog(`Nearby upload failed for ${labelPattern}: ${err.message}`);
  }
  return false;
}

async function fillVisibleInput(page, selectors, value, onLog, name) {
  if (value === undefined || value === null || value === '') return false;
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      if (onLog) onLog(`Filling ${name}: ${value}`);
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ force: true }).catch(() => {});
      await loc.fill(String(value)).catch(() => {});
      await loc.dispatchEvent('input').catch(() => {});
      await loc.dispatchEvent('change').catch(() => {});
      await loc.blur().catch(() => {});
      return true;
    }
  }
  return false;
}

async function chooseOption(page, { labelRegex, placeholders = [], option, onLog, name }) {
  if (!option) return false;
  if (onLog) onLog(`Selecting ${name}: ${option}`);

  if (labelRegex) {
    const label = page.getByText(labelRegex).first();
    if (await label.isVisible({ timeout: 2000 }).catch(() => false)) {
      const native = label.locator('xpath=following::select[1]').first();
      if (await native.isVisible({ timeout: 800 }).catch(() => false)) {
        await native
          .selectOption({ label: String(option) })
          .catch(() => native.selectOption({ value: String(option) }))
          .catch(() => native.selectOption({ label: new RegExp(option, 'i') }))
          .catch(() => {});
        return true;
      }
      await label.click({ force: true }).catch(() => {});
    }
  }

  for (const ph of placeholders) {
    const trigger = page.getByPlaceholder(ph).first().or(page.getByText(ph).first());
    if (await trigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await trigger.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
      break;
    }
  }

  const opt = page.locator('.ng-option, .dropdown-item, mat-option, li, option, span, div').filter({
    hasText: new RegExp(`^\\s*${String(option).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'),
  }).first();
  if (await opt.isVisible({ timeout: 2500 }).catch(() => false)) {
    await opt.click({ force: true });
    await page.waitForTimeout(400);
    return true;
  }
  const fuzzy = page.getByText(new RegExp(String(option), 'i')).last();
  if (await fuzzy.isVisible({ timeout: 1500 }).catch(() => false)) {
    await fuzzy.click({ force: true }).catch(() => {});
    return true;
  }
  return false;
}

function stateNameVariants(state) {
  const raw = String(state || '').trim();
  const titled = raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return [...new Set([raw, titled, 'Madhya Pradesh', 'MADHYA PRADESH', 'Madhya pradesh'])];
}

function toPortalStateName(name) {
  const raw = String(name || '').trim();
  if (/madhya/i.test(raw)) return 'Madhya Pradesh';
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function isStateListOpen(page) {
  return page.getByText('Andaman And Nicobar Islands', { exact: true }).isVisible({ timeout: 2000 }).catch(() => false);
}

function partASection2StateField(page) {
  return page.locator('app-form-field-renderer').filter({
    hasText: /2\s*a\)\s*Select States\/UTs in which the Importer is Operating/i,
  }).first();
}

async function clickOnlyOperatingStatesField(page, onLog) {
  const field = partASection2StateField(page);
  await field.waitFor({ state: 'visible', timeout: 15000 });
  await field.scrollIntoViewIfNeeded();
  if (onLog) onLog('Found Part A 2a via app-form-field-renderer — clicking it');

  const label = field.locator('label.multiselect-label').first();
  if (await label.isVisible({ timeout: 2000 }).catch(() => false)) {
    await label.click({ timeout: 4000 });
    await page.waitForTimeout(600);
    if (await isStateListOpen(page)) return true;
  }

  const chips = field.locator('.chips-container, .multiselect-container, .dropdown-btn').first();
  if (await chips.isVisible({ timeout: 2000 }).catch(() => false)) {
    await chips.click({ timeout: 4000 });
    await page.waitForTimeout(600);
    if (await isStateListOpen(page)) return true;
    const box = await chips.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
      await page.waitForTimeout(600);
      if (await isStateListOpen(page)) return true;
    }
  }

  await field.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);
  return isStateListOpen(page);
}

async function openStateCheckboxDropdown(page, onLog) {
  const label = page.getByText(/2\s*a\).*Importer is Operating/i).first();
  await label.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);

  const chips = label.locator('xpath=following::div[contains(@class,"chips-container")][1]').or(
    page.locator('.chips-container').first()
  );
  const field = chips.locator('xpath=..');
  const arrow = field.locator('[class*="arrow"], [class*="caret"], [class*="chevron"], svg, i.fa, .dropdown-icon').last();
  const placeholder = page.getByText('Select states', { exact: true }).first();

  const clicks = [
    async () => { if (await arrow.isVisible({ timeout: 800 }).catch(() => false)) await arrow.click({ timeout: 2000 }); },
    async () => { await field.click({ timeout: 2000 }); },
    async () => { await chips.click({ timeout: 2000 }); },
    async () => { if (await placeholder.isVisible({ timeout: 800 }).catch(() => false)) await placeholder.click({ timeout: 2000 }); },
    async () => {
      await chips.evaluate((el) => {
        const host = el.closest('app-multiselect, app-chips-select, ng-multiselect-dropdown, .form-control, .form-group') || el.parentElement || el;
        host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        host.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        host.click();
      });
    },
  ];

  for (let i = 0; i < clicks.length; i += 1) {
    if (await isStateListOpen(page)) {
      if (onLog) onLog('States checkbox dropdown opened');
      return true;
    }
    if (onLog) onLog(`Clicking state field (try ${i + 1}/${clicks.length})...`);
    await clicks[i]().catch(() => {});
    await page.waitForTimeout(450);
    if (await isStateListOpen(page)) {
      if (onLog) onLog('States checkbox dropdown opened');
      return true;
    }
  }

  throw new Error('States dropdown did not open — list not visible after clicks');
}

async function checkStateInOpenList(page, stateName, onLog) {
  const panel = page.locator('div, ul').filter({ hasText: 'Andaman And Nicobar Islands' }).filter({ hasText: 'Andhra Pradesh' }).last();

  for (let i = 0; i < 45; i += 1) {
    const row = panel.locator('label, li, div').filter({ hasText: new RegExp(`^\\s*${stateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).last();
    if (await row.isVisible().catch(() => false)) {
      const cb = row.locator('input[type="checkbox"]').first();
      if (await cb.count()) {
        if (!(await cb.isChecked().catch(() => false))) {
          await cb.check({ force: true }).catch(() => row.click({ force: true }));
        }
      } else {
        await row.click({ force: true });
      }
      if (onLog) onLog(`Checked state checkbox: ${stateName}`);
      return true;
    }
    await panel.evaluate((el) => {
      let node = el;
      while (node) {
        const style = getComputedStyle(node);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 5) {
          node.scrollTop += 100;
          return;
        }
        node = node.parentElement;
      }
      el.scrollTop += 100;
    }).catch(() => {});
    await page.waitForTimeout(90);
  }
  return false;
}

async function isMadhyaChipVisible(page) {
  return page.locator('.chip, .chips-container').filter({ hasText: /Madhya Pradesh/i }).first()
    .isVisible({ timeout: 1500 }).catch(() => false);
}

async function selectOperatingStates(page, _states, onLog) {
  const STATE = 'Madhya Pradesh';
  if (onLog) onLog(`Part A section 2 (2a) — selecting state: ${STATE}`);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await isMadhyaChipVisible(page)) {
      if (onLog) onLog('Madhya Pradesh chip already present');
      return true;
    }
    if (onLog) onLog(`2a states open+select attempt ${attempt}/3`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);

    let opened = false;
    try {
      opened = await clickOnlyOperatingStatesField(page, onLog);
    } catch (err) {
      if (onLog) onLog(`2a click failed: ${err.message}`);
    }
    if (!opened) {
      const field = partASection2StateField(page);
      await field.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(500);
      opened = await isStateListOpen(page);
    }
    if (!opened) continue;

    const search = page.locator('input[placeholder*="Search" i], input[placeholder*="Filter" i]').last();
    if (await search.isVisible({ timeout: 800 }).catch(() => false)) {
      await search.fill(STATE);
      await page.waitForTimeout(400);
    }

    let checked = await checkStateInOpenList(page, STATE, onLog);
    if (!checked) {
      const box = page.getByRole('checkbox', { name: /Madhya Pradesh/i }).first();
      if (await box.isVisible({ timeout: 1500 }).catch(() => false)) {
        await box.click({ timeout: 3000 }).catch(() => box.check({ force: true }));
        checked = true;
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);

    if (await isMadhyaChipVisible(page)) {
      if (onLog) onLog('State chip selected: Madhya Pradesh');
      return true;
    }
  }

  if (onLog) onLog('FAILED: Madhya Pradesh was not selected after 3 attempts');
  throw new Error('Required Part A 2a state (Madhya Pradesh) was not selected');
}

async function selectOperatingStatesUnused(page, states, onLog) {
  const wanted = Array.isArray(states) && states.length ? states : ['Madhya Pradesh'];
  const target = wanted.find((s) => /madhya/i.test(s)) || 'Madhya Pradesh';
  if (onLog) onLog(`Selecting operating states: ${target}`);

  await page.getByText(/2\s*a\)/).first().scrollIntoViewIfNeeded().catch(() => {});

  const chips = page.locator('.chips-container').first();
  const placeholder = page.getByText(/^Select states$/i).first();
  if (await chips.isVisible({ timeout: 3000 }).catch(() => false)) {
    await chips.click({ force: true });
  } else if (await placeholder.isVisible({ timeout: 2000 }).catch(() => false)) {
    await placeholder.click({ force: true });
  } else {
    const heading = page.getByText(/Select States\/UTs in which the Importer is Operating/i).first();
    const box = heading.locator('xpath=following::*[contains(@class,"chips-container") or contains(@class,"dropdown") or self::input][1]');
    await box.click({ force: true }).catch(() => heading.click({ force: true }));
  }
  await page.waitForTimeout(600);

  const search = page.locator('input[placeholder*="Search" i], input[placeholder*="state" i], .chips-container input, .dropdown-panel input').last();
  if (await search.isVisible({ timeout: 1200 }).catch(() => false)) {
    await search.fill('Madhya');
    await page.waitForTimeout(500);
  }

  const option = page.getByText('Madhya Pradesh', { exact: true }).last();
  let clicked = false;
  for (let i = 0; i < 25 && !clicked; i += 1) {
    if (await option.isVisible().catch(() => false)) {
      const cb = option.locator('xpath=preceding-sibling::input[@type="checkbox"][1]').or(
        option.locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]//input[@type="checkbox"]')
      ).first();
      if (await cb.count()) await cb.check({ force: true }).catch(() => option.click({ force: true }));
      else await option.click({ force: true });
      clicked = true;
      if (onLog) onLog('Clicked Madhya Pradesh in states list');
      break;
    }
    await page.evaluate(() => {
      const lists = [...document.querySelectorAll('div, ul')].filter((el) => {
        const s = getComputedStyle(el);
        return (s.overflowY === 'auto' || s.overflowY === 'scroll') && /Andaman/i.test(el.textContent || '');
      });
      const list = lists.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (list) list.scrollTop += 140;
    }).catch(() => {});
    await page.waitForTimeout(150);
  }

  if (!clicked) {
    const scrolled = await page.evaluate(() => {
      const match = [...document.querySelectorAll('label, li, div, span')].find(
        (n) => /^\s*Madhya Pradesh\s*$/i.test((n.textContent || '').trim())
      );
      if (!match) return false;
      match.scrollIntoView({ block: 'center' });
      const cb = match.querySelector('input[type="checkbox"]')
        || match.parentElement?.querySelector('input[type="checkbox"]')
        || match.previousElementSibling;
      if (cb && cb.matches?.('input[type="checkbox"]')) cb.click();
      else match.click();
      return true;
    }).catch(() => false);
    if (onLog) onLog(scrolled ? 'Selected Madhya Pradesh after scrolling list' : 'Madhya Pradesh checkbox not found in list');
    if (!scrolled) return false;
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);

  const andaman = page.locator('.chip').filter({ hasText: /Andaman/i }).locator('button.chip-remove, .chip-remove').first();
  if (await andaman.isVisible({ timeout: 800 }).catch(() => false)) {
    await andaman.click({ force: true }).catch(() => {});
    if (onLog) onLog('Removed accidental Andaman chip');
  }

  const chip = page.locator('.chip').filter({ hasText: /Madhya Pradesh/i }).first();
  const ok = await chip.isVisible({ timeout: 2500 }).catch(() => false);
  if (onLog) onLog(ok ? 'State chip visible: Madhya Pradesh' : 'State chip not visible after selection');
  return ok;
}

async function selectOperatingStatesLegacy(page, states, onLog) {
  const wanted = Array.isArray(states) && states.length ? states : ['Madhya Pradesh'];
  if (onLog) onLog(`Selecting operating states: ${wanted.join(', ')}`);

  await page.getByText(/2\s*a\)/).first().scrollIntoViewIfNeeded().catch(() => {});

  const opened = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('label, div, span, h4, p')].find((el) =>
      /2\s*a\).*Operating/i.test((el.textContent || '').replace(/\s+/g, ' ')) && (el.textContent || '').length < 220
    );
    const root = heading
      ? heading.closest('.row, .form-group, .col-md-6, .col-lg-6, .col-12, .col-md-12') || heading.parentElement
      : document;
    const widget = (root && root.querySelector('ng-multiselect-dropdown, .multiselect-dropdown, ng-select, p-multiselect'))
      || document.querySelector('ng-multiselect-dropdown, .multiselect-dropdown');
    if (!widget) return { ok: false, reason: 'widget-missing' };
    const btn = widget.querySelector('.dropdown-btn, .ng-select-container, .p-multiselect') || widget;
    btn.click();
    return { ok: true, tag: widget.tagName };
  }).catch((err) => ({ ok: false, reason: err.message }));
  if (onLog) onLog(`States dropdown open: ${JSON.stringify(opened)}`);
  await page.waitForTimeout(800);

  const selectedViaDom = await page.evaluate(() => {
    const items = [...document.querySelectorAll('ul.item2 li, .dropdown-list li, .ng-option, .p-multiselect-item, .item2 li, li')];
    const match = items.find((n) => /madhya\s*pradesh/i.test((n.textContent || '').trim()) && (n.textContent || '').trim().length < 40);
    if (!match) return { ok: false, reason: 'option-missing', itemCount: items.length };
    const cb = match.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
    else match.click();
    return { ok: true, itemCount: items.length, text: (match.textContent || '').trim() };
  }).catch((err) => ({ ok: false, reason: err.message }));

  if (onLog) onLog(`States DOM select: ${JSON.stringify(selectedViaDom)}`);
  if (selectedViaDom?.ok) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }

  const opener = page.locator('ng-multiselect-dropdown .dropdown-btn').first()
    .or(page.locator('.multiselect-dropdown .dropdown-btn').first())
    .or(page.getByText(/^Select states$/i).first());

  if (!(await opener.isVisible({ timeout: 4000 }).catch(() => false))) {
    if (onLog) onLog('States dropdown button not found');
    return false;
  }

  await opener.click({ force: true });
  await page.waitForTimeout(800);
  const listVisible = await page.locator('.dropdown-list, ul.item2, .ng-dropdown-panel').first().isVisible({ timeout: 2000 }).catch(() => false);
  if (!listVisible) {
    await opener.click({ force: true });
    await page.waitForTimeout(800);
  }
  if (onLog) onLog('Opened states dropdown');

  const search = page.locator('.filter-textbox input, .dropdown-list input, .p-multiselect-filter, input[placeholder="Search"]').first();
  if (await search.isVisible({ timeout: 1000 }).catch(() => false)) {
    await search.fill('Madhya');
    await page.waitForTimeout(400);
  }

  const names = list.flatMap((s) => stateNameVariants(s));
  let selected = 0;
  for (const name of names) {
    const row = page.locator('ul.item2 li, .dropdown-list li, .ng-option, .p-multiselect-item, .multiselect-item-checkbox').filter({
      hasText: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    }).first();
    if (!(await row.isVisible({ timeout: 700 }).catch(() => false))) continue;
    const box = row.locator('input[type="checkbox"]').first();
    if (await box.count()) {
      await box.check({ force: true }).catch(() => row.click({ force: true }));
    } else {
      await row.click({ force: true });
    }
    selected += 1;
    if (onLog) onLog(`Clicked state option: ${name}`);
    break;
  }

  if (!selected) {
    const evalCount = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('ul.item2 li, .dropdown-list li, .ng-option, .p-multiselect-item, li, label')];
      const match = nodes.find((n) => /madhya\s*pradesh/i.test(n.textContent || '') && n.offsetParent);
      if (!match) return 0;
      const cb = match.querySelector('input[type="checkbox"]');
      if (cb) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        cb.click();
      } else {
        match.click();
      }
      return 1;
    }).catch(() => 0);
    selected += evalCount;
    if (onLog) onLog(evalCount ? 'Selected Madhya Pradesh via DOM click' : 'Madhya Pradesh option not in DOM');
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  const chip = page.locator('.selected-item, .c-token, .ng-value, .dropdown-btn span, .p-multiselect-token-label').filter({
    hasText: /Madhya Pradesh/i,
  }).first();
  const ok = selected > 0 || await chip.isVisible({ timeout: 1500 }).catch(() => false);
  if (onLog) onLog(ok ? 'Operating state selected: Madhya Pradesh' : 'Operating state still not selected');
  return ok;
}

async function fillZeroInputsIn(scope, onLog, label) {
  const inputs = scope.locator(
    'input.cell-input, input[type="number"], .ag-cell input, table input:not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"])'
  );
  const n = await inputs.count().catch(() => 0);
  if (onLog) onLog(`Filling ${n} ${label} quantity fields with 0...`);

  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i);
    try {
      if (!(await input.isVisible().catch(() => false))) continue;
      if (await input.isDisabled().catch(() => false)) continue;
      if ((await input.getAttribute('readonly')) !== null) continue;
      await input.scrollIntoViewIfNeeded().catch(() => {});
      await input.click({ timeout: 1500 });
      await input.fill('0');
      await input.dispatchEvent('input');
      await input.dispatchEvent('change');
      await input.blur();
    } catch {
      /* skip */
    }
  }
}

async function fillAgGridZeros(page, headingRegex, onLog, label) {
  const heading = page.getByText(headingRegex).first();
  if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
    const table = heading.locator('xpath=following::table[1]').first();
    if (await table.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fillZeroInputsIn(table, onLog, label);
      return true;
    }
    await fillZeroInputsIn(heading.locator('xpath=ancestor::div[3]').first(), onLog, label);
    return true;
  }
  return false;
}

export async function fillRemainingPartA(page, generalInfo, autoData, onLog) {
  const data = normalizeApplicationData({ ...(generalInfo || {}), ...(autoData || {}) });
  const docs = await loadCompanyDocs();
  if (onLog) onLog('Filling remaining Part A required fields, documents, and 0 quantities...');

  const companyPanFile = dummyPdfOr(docs.companyPan?.file_path);
  const personPanFile = dummyPdfOr(docs.personPan?.file_path || companyPanFile);
  const gstFile = dummyPdfOr(docs.gst?.file_path);
  const cinFile = dummyPdfOr(docs.cin?.file_path);
  const categoryFile = dummyPdfOr(docs.udyam?.file_path || data.typeOfCompanyDoc);
  const productsFile = existingFile(data.detailsOfProductsPath);
  const pictureFile = existingFile(data.representativePicturePath);
  if (!productsFile) {
    throw new Error('Upload the real PDF for Details (Type & Quantity) of products produced/marketed. Dummy file will not be used.');
  }
  if (!pictureFile) {
    throw new Error('Upload the real file for Representative picture of Plastic Packaging. Dummy file will not be used.');
  }
  if (onLog) onLog(`Using user products PDF: ${productsFile}`);
  if (onLog) onLog(`Using user packaging picture: ${pictureFile}`);
  const iecNumber = docs.iec?.document_number || data.iec;

  await uploadNearLabel(page, 'Company PAN', companyPanFile, onLog);
  await uploadNearLabel(page, 'Unit GST', gstFile, onLog);
  await uploadNearLabel(page, '^\\s*GST\\s*\\*?', gstFile, onLog);
  await uploadNearLabel(page, 'CIN', cinFile, onLog);
  await uploadNearLabel(page, 'Supporting document for company category', categoryFile, onLog);
  await uploadNearLabel(page, 'Authorized person PAN', personPanFile, onLog);
  const authPanLabel = page.getByText(/1\s*b\)\s*Authorized Person Details/i).first();
  if (await authPanLabel.isVisible({ timeout: 1500 }).catch(() => false)) {
    await uploadNearLabel(page, '^\\s*PAN\\s*\\*?', personPanFile, onLog);
  }

  await fillVisibleInput(
    page,
    ['input[placeholder="Enter IEC Number"]', 'input[formcontrolname="iec_code"]', 'input[placeholder*="IEC"]'],
    iecNumber,
    onLog,
    'IEC'
  );

  if (onLog) onLog('Filling Part A section 2 states (2a) only...');
  await selectOperatingStates(page, data.operatingStates, onLog);

  await chooseOption(page, {
    labelRegex: /Does the Importer have a Production Facility/i,
    placeholders: ['Select', 'Not Applicable'],
    option: data.hasProductionFacility || 'Not Applicable',
    onLog,
    name: 'Production Facility (2b)',
  });

  await fillVisibleInput(
    page,
    ['input[placeholder="Enter Total Capital Invested"]', 'input[placeholder*="Total Capital"]'],
    data.capitalInvested,
    onLog,
    'Capital Invested (2c)'
  );

  await chooseOption(page, {
    labelRegex: /2\s*d\).*Year of Commencement of Operations/i,
    placeholders: ['Enter year', 'Select year'],
    option: '2026',
    onLog,
    name: 'Year of Commencement (2d) = 2026',
  });
  const yearSelect = page.getByText(/2\s*d\).*Year of Commencement/i).first()
    .locator('xpath=following::select[1]');
  if (await yearSelect.isVisible({ timeout: 1500 }).catch(() => false)) {
    await yearSelect.selectOption({ value: '2026' }).catch(() => yearSelect.selectOption({ label: '2026' })).catch(() => {});
    if (onLog) onLog('Forced Year of Commencement select to 2026');
  }

  await uploadNearLabel(
    page,
    'Details \\( Type & Quantity \\) of products produced/marketed',
    productsFile,
    onLog
  );
  await uploadNearLabel(page, 'products produced/marketed', productsFile, onLog);
  await uploadNearLabel(page, 'Representative picture of Plastic Packaging', pictureFile, onLog);

  await fillAgGridZeros(
    page,
    /Total Quantity of Plastic Consumed for Plastic Packaging of Commodities/i,
    onLog,
    'Part A 3c'
  );

  await chooseOption(page, {
    labelRegex: /Status of compliance with PWM Rules/i,
    placeholders: ['Select'],
    option: data.complianceStatus === 'Yes' || data.complianceStatus === 'yes' ? 'Yes' : data.complianceStatus,
    onLog,
    name: 'Compliance Status (3d)',
  });

  await fillVisibleInput(
    page,
    ['input[placeholder*="thickness" i]', 'input[placeholder*="micron" i]'],
    data.thicknessOfPlastic,
    onLog,
    'Thickness (3e)'
  );
  const thicknessLabel = page.getByText(/Thickness of Plastic Packaging \(In Microns\)/i).first();
  if (await thicknessLabel.isVisible({ timeout: 1500 }).catch(() => false)) {
    const inp = thicknessLabel.locator('xpath=following::input[1]').first();
    if (await inp.isVisible({ timeout: 800 }).catch(() => false)) {
      await inp.fill(String(data.thicknessOfPlastic));
      await inp.dispatchEvent('input');
      await inp.dispatchEvent('change');
    }
  }
}

export async function fillPartBSection4(page, _section4Data, onLog) {
  if (onLog) onLog('Filling Part B Section 4 with 0...');
  await fillAgGridZeros(
    page,
    /State-wise, Category-wise Quantity of PW generated|Pre Consumer Waste/i,
    onLog,
    'Part B Section 4'
  );
}

export async function fillPartBSection5(page, _transactions, onLog) {
  if (onLog) onLog('Skipping Part B Section 5 — leaving transaction tables empty.');
}

export async function fillPartC(page, generalInfo, onLog) {
  const data = normalizeApplicationData(generalInfo);
  if (onLog) {
    onLog('Filling Part C with uploaded covering letter, signature and self-declaration...');
    onLog(`Covering Letter: ${data.partCCoveringLetter}`);
    onLog(`Signature: ${data.partCSignature}`);
    onLog(`Self declaration: ${data.partCAuditedStatement}`);
  }

  const missingPartC = [];
  if (!data.partCCoveringLetter) missingPartC.push('Covering Letter');
  if (!data.partCSignature) missingPartC.push('Signature');
  if (!data.partCAuditedStatement) missingPartC.push('Self declaration');
  if (missingPartC.length) {
    throw new Error(`Part C real documents missing: ${missingPartC.join(', ')}. Dummy PDFs will not be used.`);
  }

  await page.getByText(/EPR Action Plan|Covering Letter/i).first().waitFor({ timeout: 20000 }).catch(() => {});

  await uploadNearLabel(page, 'Please attach Covering Letter', data.partCCoveringLetter, onLog);
  await uploadNearLabel(page, 'Covering Letter', data.partCCoveringLetter, onLog);
  await uploadNearLabel(page, 'Signature', data.partCSignature, onLog);
  await uploadNearLabel(page, 'Self declaration', data.partCAuditedStatement, onLog);
  await uploadNearLabel(page, 'Audited Statement', data.partCAuditedStatement, onLog);

  const agree = page.getByText(/I agree to the following points that/i).first();
  if (await agree.isVisible({ timeout: 8000 }).catch(() => false)) {
    const box = agree.locator('xpath=preceding::input[@type="checkbox"][1]').or(
      page.getByRole('checkbox', { name: /I agree/i }).first()
    );
    if (await box.count()) {
      if (!(await box.isChecked().catch(() => false))) {
        await box.check({ force: true }).catch(() => agree.click());
      }
    } else {
      await agree.click();
    }
    if (onLog) onLog('Ticked Part C I agree.');
  } else if (onLog) {
    onLog('I agree checkbox not found on Part C.');
  }

  const submit = page.getByRole('button', { name: /Submit\s*&\s*Pay/i }).first();
  if (await submit.isVisible({ timeout: 8000 }).catch(() => false)) {
    await submit.scrollIntoViewIfNeeded();
    await submit.click({ timeout: 10000 }).catch(() => submit.click({ force: true }));
    if (onLog) onLog('Clicked Submit & Pay.');
  } else if (onLog) {
    onLog('Submit & Pay button not found.');
  }

  try {
    await handlePaymentPopupsAndOpenPayu(page, onLog);
  } catch (err) {
    if (onLog) onLog('Payment / PayU step error: ' + err.message);
  }
}

function findSystemChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function openUrlInSystemChrome(url, onLog) {
  const chromePath = findSystemChromePath();
  if (chromePath) {
    spawn(chromePath, ['--new-tab', url], { detached: true, stdio: 'ignore' }).unref();
    if (onLog) onLog(`Opened PayU in system Chrome: ${url}`);
    return true;
  }
  spawn('cmd', ['/c', 'start', 'chrome', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  if (onLog) onLog(`Opened PayU via start chrome: ${url}`);
  return true;
}

function paymentModal(page, titleRe) {
  return page.getByRole('dialog').filter({ hasText: titleRe }).first()
    .or(page.locator('.modal, .cdk-overlay-pane, .p-dialog, [role="dialog"]').filter({ hasText: titleRe }).first());
}

async function clickModalButton(page, titleRe, buttonName, onLog, timeout = 12000) {
  const modal = paymentModal(page, titleRe);
  if (!(await modal.isVisible({ timeout }).catch(() => false))) return false;
  const btn = modal.getByRole('button', { name: new RegExp(`^${buttonName}$`, 'i') }).first()
    .or(modal.locator('button').filter({ hasText: new RegExp(`^${buttonName}$`, 'i') }).first());
  await btn.click({ timeout: 8000 }).catch(() => btn.click({ force: true }));
  if (onLog) onLog(`Clicked ${buttonName} on ${titleRe}`);
  await page.waitForTimeout(1500);
  return true;
}

async function capturePayuAndOpenChrome(page, onLog) {
  const captured = [];
  const onReq = (req) => {
    const url = req.url();
    if (/payu|webcheckoutpro|payment/i.test(url) && /https?:/i.test(url)) captured.push(url);
  };
  page.on('request', onReq);

  const payBtn = page.getByRole('button', { name: /Click to Pay|Submit\s*&\s*Pay|Pay Now/i }).first()
    .or(page.locator('button').filter({ hasText: /Click to Pay|Submit\s*&\s*Pay|Pay Now/i }).first());
  if (!(await payBtn.isVisible({ timeout: 15000 }).catch(() => false))) {
    page.off('request', onReq);
    if (onLog) onLog('Click to Pay / Submit & Pay button not found on payment-breakdown.');
    return '';
  }

  if (onLog) onLog('Clicking Click to Pay / Submit & Pay to generate payment link...');
  const popupPromise = page.context().waitForEvent('page', { timeout: 25000 }).catch(() => null);
  await payBtn.click({ timeout: 8000 }).catch(() => payBtn.click({ force: true }));
  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    captured.unshift(popup.url());
  }

  try {
    await page.waitForURL(/payu|webcheckoutpro/i, { timeout: 8000 });
    captured.unshift(page.url());
  } catch { /* stay on breakdown */ }

  page.off('request', onReq);

  const payuUrl = captured.find((u) => /payu|webcheckoutpro/i.test(u))
    || page.context().pages().reverse().find((p) => /payu|webcheckoutpro/i.test(p.url()))?.url()
    || '';

  if (payuUrl) {
    if (onLog) onLog(`Payment link: ${payuUrl}`);
    openUrlInSystemChrome(payuUrl, onLog);
    await trackPaymentActivity(page, onLog);
  } else if (onLog) {
    onLog(`PayU URL not detected. Current URL: ${page.url()}`);
  }
  return payuUrl;
}

async function trackPaymentActivity(page, onLog) {
  if (onLog) onLog('Tracking payment in Chrome / CPCB payment page...');
  const started = Date.now();
  while (Date.now() - started < 180000) {
    const url = page.url();
    const paid = await page.getByText(/payment successful|paid successfully|transaction successful|payment received/i)
      .first().isVisible({ timeout: 800 }).catch(() => false);
    if (paid || /success|paid|receipt/i.test(url)) {
      if (onLog) onLog(`Payment activity detected: ${url}`);
      return true;
    }
    await page.waitForTimeout(4000);
  }
  if (onLog) onLog('Payment tracking timed out — complete payment in Chrome if the link is open.');
  return false;
}

async function clickPaymentBypassNo(page, onLog) {
  const bypass = page.locator('.modal, .p-dialog, .cdk-overlay-pane, [role="dialog"], .overlay').filter({
    hasText: /Payment Bypass|already completed the payment/i,
  }).first().or(page.getByText(/Payment Bypass/i).first());

  const visible = await page.getByText(/Payment Bypass/i).first().isVisible({ timeout: 18000 }).catch(() => false)
    || await page.getByText(/already completed the payment/i).first().isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) return false;

  if (onLog) onLog('Payment Bypass popup found — clicking No.');
  const noBtn = page.locator('.modal, .p-dialog, [role="dialog"]').filter({ hasText: /Payment Bypass|already completed the payment/i })
    .getByRole('button', { name: /^No$/i }).first()
    .or(page.getByRole('button', { name: /^No$/i }).first());
  await noBtn.click({ timeout: 8000 }).catch(() => noBtn.click({ force: true }));
  await page.waitForTimeout(1500);
  await page.getByText(/Payment Bypass/i).first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  return true;
}

async function clickPayOnBreakdown(page, onLog) {
  const names = [
    /Click to Pay/i,
    /Submit\s*&\s*Pay/i,
    /Submit and Pay/i,
    /Pay Now/i,
  ];
  for (const name of names) {
    const btn = page.getByRole('button', { name }).first()
      .or(page.locator('button').filter({ hasText: name }).first());
    if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) {
      if (onLog) onLog(`Clicking payment button: ${name}`);
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ timeout: 8000 }).catch(() => btn.click({ force: true }));
      return true;
    }
  }
  return false;
}

async function handlePaymentPopupsAndOpenPayu(page, onLog) {
  if (onLog) onLog('Waiting for Submit Application confirmation...');

  const submitConfirm = await clickModalButton(page, /Submit Application/i, 'Yes', onLog, 15000);
  if (!submitConfirm) {
    const yes = page.locator('button:visible').filter({ hasText: /^Yes$/i }).first();
    if (await yes.isVisible({ timeout: 4000 }).catch(() => false)) {
      await yes.click({ force: true }).catch(() => {});
      if (onLog) onLog('Clicked Yes on confirmation popup');
      await page.waitForTimeout(1500);
    }
  }

  try {
    await page.waitForURL(/payment-breakdown/i, { timeout: 20000 });
    if (onLog) onLog(`Payment breakdown URL: ${page.url()}`);
  } catch {
    if (onLog) onLog(`Current URL after submit: ${page.url()}`);
  }

  const clickedNo = await clickPaymentBypassNo(page, onLog);
  if (!clickedNo && onLog) onLog('Payment Bypass popup not visible — continuing.');

  await page.waitForTimeout(1200);
  const clickedPay = await clickPayOnBreakdown(page, onLog);
  if (!clickedPay && onLog) {
    onLog('Click to Pay / Submit & Pay not found yet, retrying...');
    await page.waitForTimeout(2500);
    await clickPayOnBreakdown(page, onLog);
  }

  await capturePayuAndOpenChrome(page, onLog);
}

export async function fillNewApplicationFlow(page, formData, onLog) {
  const data = normalizeApplicationData(formData);
  await fillRemainingPartA(page, data, data, onLog);

  if (!(await isMadhyaChipVisible(page))) {
    if (onLog) onLog('STOP: Part A 2a state not filled. Save & Next will not be clicked.');
    throw new Error('Part A required state (2a Madhya Pradesh) is not selected');
  }

  const movedToB = await clickSaveAndNext(page, onLog, 'Part A');
  if (!movedToB) {
    if (onLog) onLog('STOP: Part A Save & Next did not open Part B.');
    throw new Error('Part A Save & Next failed — portal still on Part A');
  }

  await fillPartBSection4(page, null, onLog);
  await fillPartBSection5(page, null, onLog);
  const movedToC = await clickSaveAndNext(page, onLog, 'Part B');
  if (!movedToC) {
    if (onLog) onLog('STOP: Part B Save & Next did not open Part C.');
    throw new Error('Part B Save & Next failed — portal still on Part B');
  }

  await fillPartC(page, data, onLog);
}
