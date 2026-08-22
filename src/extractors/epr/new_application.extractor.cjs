const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const DOWNLOAD_DIR = path.join(DATA_DIR, 'downloads', 'new_application');

async function waitForLoaderToHide(page, timeoutMs = 60000) {
  const loader = page.locator('app-loader .loader-wrapper, app-loader').first();
  const visible = await loader.isVisible({ timeout: 1500 }).catch(() => false);
  if (visible) {
    console.log('⏳ Waiting for loader...');
    await loader.waitFor({ state: 'hidden', timeout: timeoutMs }).catch(() => {});
  }
  await page.waitForTimeout(400);
}

async function safeClick(locator, page, label = 'element') {
  await waitForLoaderToHide(page);
  try {
    await locator.click({ timeout: 20000 });
  } catch {
    console.log(`⚠️ Force click: ${label}`);
    await waitForLoaderToHide(page, 45000);
    await locator.click({ force: true, timeout: 20000 });
  }
  await waitForLoaderToHide(page, 45000);
}

const PART_TABS = [
  {
    key: 'part_a',
    label: 'Part A: General Information',
    patterns: [/part\s*a/i, /general information/i],
  },
  {
    key: 'part_b',
    label: 'Part B: Liquid Effluent & Gas',
    patterns: [/part\s*b/i, /liquid effluent/i, /pertaining to liquid/i],
  },
  {
    key: 'part_c',
    label: 'Part C: EPR Action Plan',
    patterns: [/part\s*c/i, /epr action plan/i],
  },
];

async function scrollPageFully(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 200;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
  await page.waitForTimeout(1000);
}

async function waitForFormPopulated(page) {
  try {
    await page.waitForSelector('label, mat-label, .form-group', { timeout: 15000 });
    await page
      .waitForFunction(
        () => {
          const inputs = Array.from(
            document.querySelectorAll('input[type="text"], select, textarea, .custom-input-wrapper, .form-control'),
          );
          return inputs.some((input) => {
            if (input.tagName === 'SELECT') return input.value && input.value !== '';
            if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
              return input.value && input.value.trim().length > 0;
            }
            if (input.innerText) {
              const t = input.innerText.trim();
              return t.length > 0 && !t.includes('Select') && !t.includes('Enter');
            }
            return false;
          });
        },
        { timeout: 20000 },
      )
      .catch(() => {});
  } catch {
    /* form may be read-only view */
  }
}

/** All Applications → first eye icon → application view. */
async function openApplicationViaEyeIcon(page) {
  if (page.url().includes('view') || page.url().includes('edit')) {
    console.log('Already on application view URL — skipping list navigation.');
    return;
  }

  console.log("Waiting for 'All Applications' button...");
  const allAppsBtn = page.locator('button.applicant-btn').filter({ hasText: /All Applications/i }).first();
  await allAppsBtn.waitFor({ state: 'visible', timeout: 30000 });
  await safeClick(allAppsBtn, page, 'All Applications');
  console.log("✅ Clicked 'All Applications'");
  await page.waitForTimeout(2500);

  console.log('Waiting for applications list and eye icon...');
  await page.waitForSelector('img[src*="eye.svg"]', { timeout: 30000 });

  const eyeRowBtn = page.locator('button:has(img[src*="eye.svg"]), a:has(img[src*="eye.svg"])').first();
  if (await eyeRowBtn.count()) {
    await safeClick(eyeRowBtn, page, 'Eye icon');
  } else {
    await safeClick(
      page.locator('img[alt="action icon"][src*="eye.svg"], img[src*="eye.svg"]').first(),
      page,
      'Eye icon',
    );
  }

  console.log('✅ Clicked eye icon — opening filled application view');
  await page.waitForTimeout(4000);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

/** Click Part A / B / C tab on the horizontal stepper. */
async function clickPartTab(page, patterns) {
  for (const pattern of patterns) {
    const tab = page.locator('a, button, li, span, div, [role="tab"]').filter({ hasText: pattern }).first();
    if (await tab.isVisible({ timeout: 2500 }).catch(() => false)) {
      await safeClick(tab, page, `Tab ${pattern}`);
      await page.waitForTimeout(2000);
      return true;
    }
  }

  const clicked = await page.evaluate((patternSources) => {
    const regs = patternSources.map((s) => new RegExp(s, 'i'));
    const els = Array.from(document.querySelectorAll('a, button, li, span, div, [role="tab"]'));
    for (const el of els) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length > 120) continue;
      if (regs.some((r) => r.test(text))) {
        el.click();
        return true;
      }
    }
    return false;
  }, patterns.map((p) => p.source));

  if (clicked) await page.waitForTimeout(2000);
  return clicked;
}

function mergeExtractedPart(target, { fields = {}, tables = {} }) {
  Object.assign(target, fields);
  if (tables && Object.keys(tables).length) {
    target.tables = { ...(target.tables || {}), ...tables };
  }
}

async function extractFormDataFromDom(page) {
  return page.evaluate(() => {
    const fields = {};
    const tables = {};
    const logs = [];

    const slugify = (text) =>
      String(text || '')
        .replace(/\*/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/_$/, '');

    const findSectionTitleForElement = (el) => {
      let current = el;
      for (let hop = 0; hop < 25; hop++) {
        if (!current) break;
        let sib = current.previousElementSibling;
        while (sib) {
          const label = sib.querySelector('label, .label-font, .input-label, h3, h4, h5, p, span');
          const labelText = label ? label.innerText.trim() : '';
          if (labelText.length > 8 && labelText.length < 280) return labelText.split('\n')[0];
          const t = (sib.innerText || '').trim();
          if (/^\d+[a-z]?[\).]/i.test(t) && t.length < 280) return t.split('\n')[0];
          sib = sib.previousElementSibling;
        }
        const inParent = current.parentElement?.querySelector('label, .label-font, .input-label');
        if (inParent) {
          const pt = inParent.innerText.trim();
          if (pt.length > 8 && pt.length < 280 && current.parentElement.contains(el)) {
            return pt.split('\n')[0];
          }
        }
        current = current.parentElement;
      }
      return '';
    };

    const readCellValue = (cell) => {
      const input = cell.querySelector('input, textarea');
      if (input) {
        const v = input.value != null ? String(input.value).trim() : '';
        if (v !== '') return v;
        const ph = input.placeholder != null ? String(input.placeholder).trim() : '';
        if (ph !== '') return ph;
        return input.getAttribute('value') || '';
      }
      const select = cell.querySelector('select');
      if (select && select.options.length > 0 && select.selectedIndex >= 0) {
        const t = select.options[select.selectedIndex].text.trim();
        if (t.toLowerCase() !== 'select') return t;
      }
      const matVal = cell.querySelector('.mat-select-value-text span, .mat-select-value, ng-select .ng-value-label');
      if (matVal) return matVal.innerText.trim();
      const agVal = cell.querySelector('.ag-cell-value');
      if (agVal) return agVal.innerText.trim();
      return cell.innerText.trim();
    };

    const extractAgGridTables = () => {
      const gridRoots = document.querySelectorAll('.ag-root-wrapper, .ag-root');
      gridRoots.forEach((grid, gridIndex) => {
        const sectionTitle = findSectionTitleForElement(grid);
        const tableKey = slugify(sectionTitle) || `ag_grid_${gridIndex + 1}`;

        const colMap = {};
        grid.querySelectorAll('.ag-header-cell[col-id]').forEach((h) => {
          const colId = h.getAttribute('col-id');
          if (!colId || colId === 'ag-Grid-AutoColumn') return;
          const headerText = h.innerText
            .replace(/\* ?Enter value in Tonnes/gi, '')
            .replace(/\n/g, ' ')
            .trim();
          colMap[colId] = slugify(headerText) || colId;
        });

        const rowEls = grid.querySelectorAll('.ag-center-cols-container .ag-row, .ag-body-viewport .ag-row');
        const rows = [];

        rowEls.forEach((row) => {
          const rowData = {};
          row.querySelectorAll('.ag-cell[col-id]').forEach((cell) => {
            const colId = cell.getAttribute('col-id');
            if (!colId) return;
            const key = colMap[colId] || colId;
            rowData[key] = readCellValue(cell);
          });
          if (Object.keys(rowData).length) rows.push(rowData);
        });

        if (rows.length) {
          tables[tableKey] = rows;
          logs.push(`[DEBUG] AG Grid "${tableKey}" — ${rows.length} row(s), cols: ${Object.values(colMap).join(', ')}`);
        }
      });
    };

    const containers = document.querySelectorAll('mat-form-field, .form-group, .form-field, div[class*="col-"]');

    containers.forEach((container) => {
      const labelElem = container.querySelector('label, mat-label, span.title, .mat-form-field-label');
      if (!labelElem) return;

      const labelText = labelElem.innerText.replace('*', '').trim().toLowerCase();
      const key = slugify(labelText);
      if (!key || key === 'select' || key === 'yes' || key === 'no') return;

      let val = '';
      let method = '';

      const input = container.querySelector('input, textarea');
      if (input) {
        val = input.value || input.getAttribute('aria-valuenow') || input.getAttribute('value') || '';
        if (val) method = 'input';
      }

      if (!val) {
        const select = container.querySelector('select');
        if (select && select.options.length > 0 && select.selectedIndex >= 0) {
          val = select.options[select.selectedIndex].text;
          if (val.toLowerCase() === 'select') val = '';
          if (val) method = 'standard-select';
        }
      }

      if (!val) {
        const selectValue = container.querySelector('.mat-select-value-text span, .mat-select-value, ng-select .ng-value-label');
        if (selectValue) {
          val = selectValue.innerText.trim();
          if (val.toLowerCase() === 'select') val = '';
          if (val) method = 'mat-select';
        } else {
          const matSelect = container.querySelector('mat-select');
          if (matSelect && matSelect.getAttribute('ng-reflect-model')) {
            val = matSelect.getAttribute('ng-reflect-model');
            method = 'mat-select-model';
          }
        }
      }

      if (!val) {
        const wrapper = container.querySelector('.input-wrapper, .custom-input-wrapper, .form-control');
        if (wrapper) {
          let text = wrapper.innerText.trim().replace(/upload/i, '').trim();
          if (text) {
            val = text;
            method = 'custom-wrapper';
          }
        }
      }

      if (!val) {
        let rawText = container.innerText || '';
        rawText = rawText.replace(labelElem.innerText, '').trim();
        rawText = rawText.replace(/upload|view|browse|please copy/ig, '').trim();
        const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          val = lines[0];
          method = 'plain-text';
        }
      }

      val = val ? val.trim() : null;
      logs.push(`[DEBUG] Label: "${labelText}" -> Key: "${key}" -> Value: "${val}" (${method})`);

      if (!(key in fields) || (val && (!fields[key] || String(fields[key]).length < val.length))) {
        fields[key] = val;
      }
    });

    extractAgGridTables();

    const htmlTables = document.querySelectorAll('table');
    htmlTables.forEach((table, index) => {
      let tableName = `table_${index + 1}`;
      const sectionTitle = findSectionTitleForElement(table);
      if (sectionTitle) tableName = slugify(sectionTitle);

      const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map((th) =>
        slugify(th.innerText.trim()),
      );
      if (!headers.length) return;

      const rows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
      const tableData = [];

      rows.forEach((row) => {
        const rowData = {};
        const cells = Array.from(row.querySelectorAll('td'));
        let hasData = false;

        cells.forEach((cell, i) => {
          if (i >= headers.length || !headers[i]) return;
          const cellKey = headers[i];
          const cellVal = readCellValue(cell);
          if (cellVal && cellVal.toLowerCase() !== 'select') {
            rowData[cellKey] = cellVal;
            hasData = true;
          }
        });

        if (hasData) tableData.push(rowData);
      });

      if (tableData.length > 0) {
        tables[tableName] = tableData;
        logs.push(`[DEBUG] HTML Table "${tableName}" — ${tableData.length} row(s)`);
      }
    });

    return { fields, tables, logs };
  });
}

async function downloadDocumentsOnPage(page, extracted) {
  console.log('📥 Scanning for downloadable documents on this tab...');
  try {
    const fileElements = await page.$$eval('.form-group, mat-form-field, td, div[class*="col-"]', (els) => {
      const results = [];
      els.forEach((container) => {
        const text = (container.innerText || '').toLowerCase();
        const hasExt = text.includes('.pdf') || text.includes('.jpg') || text.includes('.jpeg') || text.includes('.png');
        const isViewBtn = text.includes('view');
        if (!(hasExt || isViewBtn) || text.length >= 200) return;

        const clickables = Array.from(container.querySelectorAll('a, button, img, span.cursor-pointer'));
        let clickable = clickables.find((c) => {
          const t = (c.innerText || c.title || c.className || '').toLowerCase();
          const s = (c.src || '').toLowerCase();
          return t.includes('view') || t.includes('eye') || s.includes('view') || s.includes('eye');
        });

        if (!clickable) {
          const btns = Array.from(container.querySelectorAll('a, button'));
          if (btns.length > 0) clickable = btns[btns.length - 1];
        }

        if (!clickable) return;
        if (!clickable.id) clickable.id = 'pwp-dl-elem-' + Math.random().toString(36).substring(7);

        let val = '';
        const input = container.querySelector('input, textarea');
        if (input) val = input.value || input.getAttribute('value') || '';
        if (!val) {
          let rawText = container.innerText || '';
          const label = container.querySelector('label, mat-label');
          if (label) rawText = rawText.replace(label.innerText, '');
          rawText = rawText.replace(/upload|view|browse|please copy/ig, '').trim();
          const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length > 0) val = lines[0];
        }

        results.push({
          id: clickable.id,
          text: text.substring(0, 50).replace(/\n/g, ' '),
          rawText: val.trim(),
        });
      });
      return results;
    });

    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    const seenText = new Set();
    for (const fElem of fileElements) {
      if (seenText.has(fElem.text)) continue;
      seenText.add(fElem.text);

      try {
        const downloadPromise = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
        const popupPromise = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null);
        const apiResponsePromise = page
          .waitForResponse((response) => response.url().includes('downloadById') && response.status() === 200, {
            timeout: 5000,
          })
          .catch(() => null);

        await page.evaluate((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          const innerLink = el.querySelector('a, img[src*="eye"], img[src*="download"], img[src*="print"]');
          (innerLink || el).click();
        }, fElem.id);

        const [download, popup, apiResponse] = await Promise.all([downloadPromise, popupPromise, apiResponsePromise]);
        let savedFilename = null;

        if (apiResponse) {
          const buffer = await apiResponse.body();
          let ext = '.pdf';
          const contentType = apiResponse.headers()['content-type'] || '';
          if (contentType.includes('image/jpeg')) ext = '.jpg';
          else if (contentType.includes('image/png')) ext = '.png';
          const baseName = fElem.rawText ? fElem.rawText.replace(/[^a-zA-Z0-9_-]/g, '_') : 'document_' + fElem.id;
          savedFilename = baseName + ext;
          fs.writeFileSync(path.join(DOWNLOAD_DIR, savedFilename), buffer);
        } else if (download) {
          savedFilename = download.suggestedFilename();
          await download.saveAs(path.join(DOWNLOAD_DIR, savedFilename));
        } else if (popup) {
          await popup.waitForLoadState('domcontentloaded').catch(() => {});
          const popupUrl = popup.url();
          try {
            const response = await popup.request.get(popupUrl);
            const buffer = await response.body();
            savedFilename = popupUrl.split('/').pop().split('?')[0];
            if (!savedFilename || savedFilename.length < 3 || !savedFilename.includes('.')) {
              const baseName = fElem.rawText ? fElem.rawText.replace(/[^a-zA-Z0-9_-]/g, '_') : 'document_' + fElem.id;
              savedFilename = baseName + '.pdf';
            }
            fs.writeFileSync(path.join(DOWNLOAD_DIR, savedFilename), buffer);
          } catch {
            /* ignore popup fetch errors */
          }
          await popup.close();
        }

        if (savedFilename && fElem.rawText && fElem.rawText.trim().length > 3) {
          const originalText = fElem.rawText.trim().toLowerCase();
          for (const key of Object.keys(extracted)) {
            const val = extracted[key];
            if (typeof val === 'string' && val.toLowerCase().includes(originalText) && !val.includes('.')) {
              extracted[key] = savedFilename;
            }
          }
        }
      } catch {
        /* skip failed download */
      }
      await page.waitForTimeout(400);
    }
  } catch (err) {
    console.error('Document extraction warning:', err.message);
  }
}

function mergeApiData(applicationData, apiData) {
  if (apiData.userDetails) {
    const ud = apiData.userDetails;
    if (ud.company) {
      if (!applicationData.part_a.legal_name_of_company) applicationData.part_a.legal_name_of_company = ud.company.legalName;
      if (!applicationData.part_a.registered_address) applicationData.part_a.registered_address = ud.company.address;
      if (!applicationData.part_a.type_of_business) {
        applicationData.part_a.type_of_business = ud.company.businessName || ud.company.businessType;
      }
    }
    if (!applicationData.part_a.pan_number) applicationData.part_a.pan_number = ud.panNumber;
    if (!applicationData.part_a.name) applicationData.part_a.name = ud.name;
    if (!applicationData.part_a.designation) applicationData.part_a.designation = ud.designation;
    if (!applicationData.part_a.mobile_number) applicationData.part_a.mobile_number = ud.mobile;
    if (!applicationData.part_a.email_address) applicationData.part_a.email_address = ud.email;
  }

  if (apiData.unitDetails?.application) {
    const unit = apiData.unitDetails;
    if (!applicationData.part_a.state) applicationData.part_a.state = unit.application.unitState?.state_name_en;
    if (!applicationData.part_a.district) applicationData.part_a.district = unit.application.unitDistrict?.district_name_en;
    if (!applicationData.part_a.unit_gst) applicationData.part_a.unit_gst = unit.application.unitGST;
    if (!applicationData.part_a.plant_unit_address) applicationData.part_a.plant_unit_address = unit.portalUserUnitAddress;
  }
}

async function extractEprNewApplication(page) {
  console.log('🚀 EPR Application scraper — All Applications → Eye → Part A/B/C');
  const applicationData = { part_a: {}, part_b: {}, part_c: {} };
  const apiData = {};

  const responseHandler = async (response) => {
    const reqUrl = response.url();
    const resType = response.request().resourceType();
    if (!reqUrl.includes('/api/v1/') || (resType !== 'fetch' && resType !== 'xhr') || response.status() !== 200) return;
    try {
      const json = await response.json();
      if (reqUrl.includes('user-details') && json.data?.userDetails) apiData.userDetails = json.data.userDetails;
      if (reqUrl.includes('get-units') && json.data?.userPortalRole) apiData.unitDetails = json.data.userPortalRole[0];
    } catch {
      /* ignore non-json */
    }
  };

  page.on('response', responseHandler);

  try {
    await openApplicationViaEyeIcon(page);
    await waitForFormPopulated(page);

    let tabsFound = false;

    for (const part of PART_TABS) {
      console.log(`\n📄 Navigating to ${part.label}...`);
      const tabClicked = await clickPartTab(page, part.patterns);

      if (!tabClicked) {
        console.log(`⚠️ Tab not found for ${part.label} — will try extracting visible content anyway.`);
      } else {
        tabsFound = true;
        console.log(`✅ Opened ${part.label}`);
      }

      await waitForFormPopulated(page);
      await scrollPageFully(page);

      const { fields: extracted, tables: extractedTables, logs } = await extractFormDataFromDom(page);

      console.log(`--- UI LOGS: ${part.label} ---`);
      logs.forEach((log) => console.log(log));
      console.log('--------------------------------\n');

      await downloadDocumentsOnPage(page, extracted);
      mergeExtractedPart(applicationData[part.key], { fields: extracted, tables: extractedTables });

      const tableCount = Object.keys(extractedTables || {}).length;
      console.log(
        `✅ ${part.label}: ${Object.keys(extracted).length} field(s)${tableCount ? `, ${tableCount} table(s)` : ''}`,
      );

      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(DATA_DIR, `new_application_debug_${part.key}.html`),
        await page.content(),
      );
    }

    if (!tabsFound) {
      console.log('⚠️ Part tabs not detected — falling back to Save & Next wizard navigation...');
      for (let step = 0; step < 3; step++) {
        const key = PART_TABS[step]?.key || 'part_a';
        await waitForFormPopulated(page);
        await scrollPageFully(page);
        const { fields: extracted, tables: extractedTables } = await extractFormDataFromDom(page);
        mergeExtractedPart(applicationData[key], { fields: extracted, tables: extractedTables });

        const hasNext = await page.evaluate(() => {
          const nextBtn = Array.from(document.querySelectorAll('button')).find(
            (b) =>
              b.innerText.includes('Save & Next') ||
              b.innerText.includes('Next') ||
              b.innerText.includes('Save & Continue'),
          );
          if (nextBtn && !nextBtn.disabled) {
            nextBtn.click();
            return true;
          }
          return false;
        });
        if (!hasNext) break;
        await page.waitForTimeout(3000);
      }
    }

    mergeApiData(applicationData, apiData);

    console.log(
      `✅ Done — Part A: ${Object.keys(applicationData.part_a).length} | Part B: ${Object.keys(applicationData.part_b).length} | Part C: ${Object.keys(applicationData.part_c).length} fields`,
    );
  } catch (error) {
    console.error('❌ Failed to extract application data:', error.message);
  } finally {
    page.off('response', responseHandler);
  }

  return applicationData;
}

module.exports = { extractEprNewApplication };
