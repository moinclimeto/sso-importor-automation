const { loginEpr } = require('./login.playwright.cjs');
const { extractEprNewApplication } = require('./new_application.extractor.cjs');
const { persistScrapedData } = require('./scrapedDataPersist.cjs');

/** Wait until CPCB full-page loader overlay is gone (blocks Fetch Data clicks). */
async function waitForLoaderToHide(page, timeoutMs = 60000) {
  const loader = page.locator('app-loader .loader-wrapper, app-loader').first();
  const visible = await loader.isVisible({ timeout: 1500 }).catch(() => false);
  if (visible) {
    console.log('⏳ Waiting for page loader to disappear...');
    await loader.waitFor({ state: 'hidden', timeout: timeoutMs }).catch(async () => {
      await page
        .waitForFunction(
          () => {
            const el = document.querySelector('app-loader .loader-wrapper, app-loader');
            if (!el) return true;
            const s = window.getComputedStyle(el);
            return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0;
          },
          { timeout: timeoutMs },
        )
        .catch(() => {});
    });
  }
  await page.waitForTimeout(400);
}

async function safeClick(locator, page, label = 'element') {
  await waitForLoaderToHide(page);
  try {
    await locator.click({ timeout: 20000 });
  } catch (err) {
    console.log(`⚠️ Click blocked on ${label} — force click retry...`);
    await waitForLoaderToHide(page, 45000);
    await locator.click({ force: true, timeout: 20000 });
  }
  await waitForLoaderToHide(page, 45000);
}

async function runStep(name, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`❌ Step failed [${name}]:`, err.message);
    console.log(`⏭️ Continuing to next step...`);
  }
}

/** Run action + waitForResponse together so timeouts never become unhandled rejections. */
async function waitForApiAfterAction(page, matchResponse, action, label = 'API', timeoutMs = 25000) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => {
          if (res.request().method() === 'OPTIONS') return false;
          return matchResponse(res);
        },
        { timeout: timeoutMs },
      ),
      (async () => {
        await action();
      })(),
    ]);
    return response;
  } catch (err) {
    console.error(`❌ API wait failed [${label}]:`, err.message.split('\n')[0]);
    return null;
  }
}

async function extractApiDataFromDashboard(page, viewButtonIndex, apiPathKeyword, label) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: ${label}`);
    console.log(`========================================`);

    console.log(`🖱️ Clicking 'View' button at index ${viewButtonIndex}...`);
    const viewBtns = page.locator('button.btn-underline:has-text("View")');
    await viewBtns.nth(viewButtonIndex).waitFor({ state: 'visible', timeout: 10000 });
    await safeClick(viewBtns.nth(viewButtonIndex), page, `View button #${viewButtonIndex}`);

    console.log("⏳ Waiting for Dashboard to load...");
    await waitForLoaderToHide(page);
    await page.waitForTimeout(2000);

    console.log("🖱️ Setting first dropdown to 'Financial Year'...");
    const intervalSelect = page.locator('select.filter-select-input').nth(0);
    await intervalSelect.waitFor({ state: 'visible' });
    await intervalSelect.selectOption('financial_year');

    await page.waitForTimeout(1000);

    console.log("🔍 Extracting available Financial Years...");
    const fySelect = page.locator('select.filter-select-input').nth(1);
    await fySelect.waitFor({ state: 'visible' });
    
    const availableYears = await fySelect.evaluate((selectElement) => {
        const options = Array.from(selectElement.options);
        return options
            .filter(opt => !opt.disabled && opt.value)
            .map(opt => opt.value);
    });

    console.log(`✅ Found ${availableYears.length} Financial Years:`, availableYears);

    const apiDataResults = {};
    const fetchBtn = page.locator('button.filter-button', { hasText: 'Fetch Data' }).first();

    for (const year of availableYears) {
        console.log(`🔄 Fetching data for Financial Year: ${year}`);

        const apiResponse = await waitForApiAfterAction(
            page,
            (res) => res.url().includes(apiPathKeyword) && res.url().includes(`financialYear=${year}`),
            async () => {
                await fySelect.selectOption(year);
                await fySelect.dispatchEvent('change');
                await page.waitForTimeout(500);
                await safeClick(fetchBtn, page, `Fetch Data (${year})`);
            },
            year,
        );

        if (apiResponse) {
            try {
                const jsonPayload = await apiResponse.json();
                console.log(`✅ Received API data for ${year}!`);
                apiDataResults[year] = jsonPayload;
            } catch (error) {
                console.error(`❌ Failed to parse API data for ${year}:`, error.message);
                apiDataResults[year] = { error: 'Invalid JSON response.' };
            }
        } else {
            apiDataResults[year] = { error: 'Failed to fetch data or timeout.' };
        }

        await page.waitForTimeout(1000);
    }

    console.log(`🎉 ${label} extraction complete (${Object.keys(apiDataResults).length} records)`);
    return apiDataResults;
}

async function extractRoadMakingData(page) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: road_making_api_data.json`);
    console.log(`========================================`);

    // Instead of clicking "View", we click "Operations" from the sidebar
    console.log(`🖱️ Clicking 'Operations' in the sidebar...`);
    const operationsMenu = page.locator('span.label, .menu-item, span').filter({ hasText: 'Operations' }).first();
    await operationsMenu.waitFor({ state: 'visible', timeout: 10000 });
    await safeClick(operationsMenu, page, 'Operations menu');

    console.log("⏳ Waiting for Operations menu to expand...");
    await page.waitForTimeout(2000);

    // Click on the Road Making Declaration tab/menu item
    console.log("🖱️ Clicking 'Road Making Declaration' tab...");
    const roadMakingTab = page.getByText('Road Making Declaration').first();
    await roadMakingTab.waitFor({ state: 'visible', timeout: 15000 });
    await safeClick(roadMakingTab, page, 'Road Making Declaration');
    await page.waitForTimeout(2000);

    // It seems "PW Procurement" is a sub-tab we need to click
    console.log("🖱️ Clicking 'PW Procurement' sub-tab...");
    const pwProcurementTab = page.getByText('PW Procurement').first();
    try {
        await pwProcurementTab.waitFor({ state: 'visible', timeout: 5000 });
        await safeClick(pwProcurementTab, page, 'PW Procurement');
        await page.waitForTimeout(3000);
    } catch (e) {
        console.log("⚠️ 'PW Procurement' tab not found or not clickable, proceeding anyway...");
    }

    console.log("🖱️ Setting first dropdown to 'Day'...");
    const intervalSelect = page.locator('select.filter-select-input').nth(0);
    await intervalSelect.waitFor({ state: 'visible', timeout: 15000 });
    await intervalSelect.selectOption('day');

    await page.waitForTimeout(1000);

    const apiDataResults = {};
    const fetchBtn = page.locator('button.filter-button', { hasText: 'Fetch Data' }).first();
    const dateInputs = page.locator('input[type="date"]');

    // Generate 6 years of dates (e.g. 2021 to 2026)
    const currentYear = new Date().getFullYear();
    const dateRanges = [];
    for (let i = 0; i < 6; i++) {
        let y1 = currentYear - i - 1;
        let y2 = currentYear - i;
        dateRanges.push({ start: `${y1}-01-01`, end: `${y2}-01-01` });
    }

    for (const range of dateRanges) {
        console.log(`🔄 Fetching data for Period: ${range.start} to ${range.end}`);

        const label = `${range.start}_to_${range.end}`;
        const apiResponse = await waitForApiAfterAction(
            page,
            (res) => res.url().includes('get-dashboard-road'),
            async () => {
                await dateInputs.nth(0).fill(range.start);
                await dateInputs.nth(1).fill(range.end);
                await dateInputs.nth(0).dispatchEvent('change');
                await dateInputs.nth(1).dispatchEvent('change');
                await page.waitForTimeout(500);
                await safeClick(fetchBtn, page, `Fetch Data (${label})`);
            },
            label,
        );

        if (apiResponse) {
            try {
                const jsonPayload = await apiResponse.json();
                console.log(`✅ Received Road Making API data for ${range.start} to ${range.end}!`);
                apiDataResults[label] = jsonPayload;
            } catch (error) {
                console.error(`❌ Failed to parse Road Making data for ${range.start}:`, error.message);
                apiDataResults[label] = { error: 'Invalid JSON response.' };
            }
        } else {
            apiDataResults[label] = { error: 'Failed to fetch data or timeout.' };
        }

        await page.waitForTimeout(1000);
    }

    console.log(`🎉 Road Making extraction complete (${Object.keys(apiDataResults).length} periods)`);
    return apiDataResults;
}

async function extractWalletFrontendData(page) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: Wallet Frontend`);
    console.log(`========================================`);

    console.log(`🖱️ Clicking 'Wallet' in the sidebar...`);
    const walletMenu = page.locator('span.label, .menu-item, span').filter({ hasText: 'Wallet' }).first();
    await walletMenu.waitFor({ state: 'visible', timeout: 10000 });
    await safeClick(walletMenu, page, 'Wallet menu');

    console.log("⏳ Waiting for Wallet page to load...");
    await page.waitForTimeout(5000);

    console.log("📊 Extracting frontend data from Wallet page...");
    
    const extractedData = await page.evaluate(() => {
        const data = {
            url: window.location.href,
            tables: {},
            cards: [],
            rawText: ""
        };
        const logs = [];

        // 1. Extract Form Fields
        const containers = document.querySelectorAll('mat-form-field, .form-group, .form-field, div[class*="col-"]');
        containers.forEach(container => {
            const labelElem = container.querySelector('label, mat-label, span.title, .mat-form-field-label');
            if (!labelElem) return;
            let rawLabel = labelElem.innerText;
            let labelText = rawLabel.replace('*', '').trim().toLowerCase();
            let key = labelText.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
            if (!key || key === 'select' || key === 'yes' || key === 'no') return;
            
            let val = '';
            const input = container.querySelector('input, textarea');
            if (input) val = input.value || input.getAttribute('aria-valuenow') || input.getAttribute('value') || '';
            if (!val) {
                const select = container.querySelector('select');
                if (select && select.options.length > 0 && select.selectedIndex >= 0) {
                    val = select.options[select.selectedIndex].text;
                    if (val.toLowerCase() === 'select') val = '';
                }
            }
            if (!val) {
                const selectValue = container.querySelector('.mat-select-value-text span, .mat-select-value, ng-select .ng-value-label');
                if (selectValue) {
                    val = selectValue.innerText.trim();
                    if (val.toLowerCase() === 'select') val = '';
                } else {
                    const matSelect = container.querySelector('mat-select');
                    if (matSelect && matSelect.getAttribute('ng-reflect-model')) {
                        val = matSelect.getAttribute('ng-reflect-model');
                    }
                }
            }
            if (!val) {
                let rawText = container.innerText || '';
                rawText = rawText.replace(labelElem.innerText, '').trim();
                const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length > 0) val = lines[0];
            }
            val = val ? val.trim() : null;
            if (!(key in data) || (val && (!data[key] || String(data[key]).length < val.length))) {
                data[key] = val;
            }
        });
        
        // 2. Extract Tables
        const tables = document.querySelectorAll('table');
        tables.forEach((table, index) => {
            let tableName = `table_${index + 1}`;
            let prev = table.previousElementSibling;
            while (prev && prev.tagName !== 'TABLE' && index < 5) { 
                if (prev.tagName.match(/^H[1-6]$/i) || prev.classList.contains('title') || prev.classList.contains('heading')) {
                    tableName = prev.innerText.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase();
                    break;
                }
                prev = prev.previousElementSibling;
            }
            const tableData = [];
            let headers = [];
            const theadRows = table.querySelectorAll('thead tr, tr:first-child');
            if (theadRows.length > 0) {
                const headerCells = theadRows[0].querySelectorAll('th, td');
                headerCells.forEach((th, i) => {
                    let headerText = th.innerText.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
                    if (!headerText) headerText = `col_${i}`;
                    headers.push(headerText);
                });
            }
            const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
            rows.forEach(row => {
                const rowData = {};
                const cells = row.querySelectorAll('td');
                let hasData = false;
                cells.forEach((cell, i) => {
                    const cellKey = headers[i] || `col_${i}`;
                    let cellValue = cell.innerText.trim();
                    const input = cell.querySelector('input, select, textarea');
                    if (input && (input.value || input.getAttribute('ng-reflect-model'))) {
                        cellValue = input.value || input.getAttribute('ng-reflect-model');
                    }
                    if (cellValue) hasData = true;
                    rowData[cellKey] = cellValue;
                });
                if (hasData) tableData.push(rowData);
            });
            if (tableData.length > 0) data.tables[tableName] = tableData;
        });

        // 3. Extract generic Cards / Text Blocks
        const allDivs = document.querySelectorAll('div, mat-card, .card, span, p');
        allDivs.forEach(div => {
            if (div.children.length === 0 && div.innerText.trim().length > 0) {
                if (div.innerText.length < 200) data.cards.push(div.innerText.trim());
            }
        });
        data.cards = [...new Set(data.cards)];

        // 4. Extract all raw text as fallback
        data.rawText = document.body.innerText;

        return { data, logs };
    });

    console.log(`🎉 Wallet Frontend extraction complete`);
    return extractedData;
}

async function extractWalletApiData(page) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: Wallet API`);
    console.log(`========================================`);

    const walletTabs = [
        { name: 'Credit/Debit Transactions', apiPath: '/certificate/transaction' },
        { name: 'Certificate Generations', apiPath: '/certificate/generations' },
        { name: 'Transferred', apiPath: '/transfer/debit' },
        { name: 'Generated', apiPath: '/certificate/generated' },
        { name: 'Available', apiPath: '/certificate/available' },
        { name: 'Certificate Expiry Details', apiPath: '/certificate/expiry-certificates' },
        { name: 'Filing', apiPath: '/credit-exchange/filling-transactions' }
    ];

    const apiDataResults = {};

    // We assume we are already on the Wallet page from the previous extraction
    // To ensure clicking the very first tab triggers a network request, we first click another one.
    try {
        console.log("🔄 Clicking a secondary tab first to reset state...");
        const resetTab = page.locator('span.certificate-tab', { hasText: 'Filing' }).first();
        await resetTab.click({ force: true });
        await page.waitForTimeout(2000);
    } catch (e) {
        console.log("⚠️ Could not click reset tab, continuing...");
    }

    for (const tab of walletTabs) {
        console.log(`🔄 Extracting API data for tab: ${tab.name}`);

        if (tab.name === 'Filing') {
            try {
                await page.locator('span.certificate-tab', { hasText: 'Available' }).first().click({ force: true });
                await page.waitForTimeout(1000);
            } catch (e) {
                /* tab may already be inactive */
            }
        }

        const tabElem = page.locator('span.certificate-tab').filter({ hasText: tab.name }).first();
        const apiResponse = await waitForApiAfterAction(
            page,
            (res) => res.url().includes(tab.apiPath),
            async () => {
                await tabElem.waitFor({ state: 'visible', timeout: 8000 });
                await safeClick(tabElem, page, `Wallet tab ${tab.name}`);
            },
            tab.name,
        );

        if (apiResponse) {
            try {
                const jsonPayload = await apiResponse.json();
                console.log(`✅ Received Wallet API data for ${tab.name}!`);
                apiDataResults[tab.name] = jsonPayload;
            } catch (error) {
                console.error(`❌ Failed to parse Wallet API for ${tab.name}:`, error.message);
                apiDataResults[tab.name] = { error: 'Invalid JSON response.' };
            }
        } else {
            apiDataResults[tab.name] = { error: 'Failed to fetch data or timeout.' };
        }

        await page.waitForTimeout(1000);
    }

    console.log(`🎉 Wallet API extraction complete (${Object.keys(apiDataResults).length} tabs)`);
    return apiDataResults;
}

async function selectUnit(page) {
    console.log("🖱️ Clicking 'Select Unit' button...");
    const selectUnitBtn = page.locator('button.action-btn', { hasText: 'Select Unit' }).first();
    await selectUnitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await safeClick(selectUnitBtn, page, 'Select Unit');
    
    console.log("⏳ Waiting for unit cards to load...");
    await waitForLoaderToHide(page);
    const unitCardBtn = page.locator('button.unit-card', { hasText: 'MALOO INDUSTRIES' }).first();
    await unitCardBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log("🖱️ Clicking 'MALOO INDUSTRIES' unit card...");
    await safeClick(unitCardBtn, page, 'MALOO INDUSTRIES unit');
    
    console.log("⏳ Waiting for data to refresh after unit selection...");
    await waitForLoaderToHide(page);
    await page.waitForTimeout(2000);
}

async function extractOnboardingData() {
    console.log("🚀 Starting Combined API Data Extractor...");

    process.on('unhandledRejection', (reason) => {
        const msg = reason?.message || String(reason);
        console.error('⚠️ Unhandled async error (script continues):', msg.split('\n')[0]);
    });
    
    const { context, page } = await loginEpr("", "");
    const scraped = {};

    try {
        console.log("🌐 Waiting for navigation to Onboarding page...");
        await page.waitForTimeout(5000);
        
        // ---------------------------------------------------------
        // 1. EXTRACT PROCUREMENT DATA
        // ---------------------------------------------------------
        await runStep('Procurement API', async () => {
            await selectUnit(page);
            scraped.procurement_api_data = await extractApiDataFromDashboard(
              page, 0, 'procurement/dashboard/summary', 'Procurement API',
            );
        });

        // ---------------------------------------------------------
        // 2. NAVIGATE BACK TO DASHBOARD & EXTRACT SALES DATA
        // ---------------------------------------------------------
        await runStep('Sales API', async () => {
            console.log("\n🔙 Navigating back to main dashboard...");
            await page.goto('https://epr.cpcb.gov.in/onboarding/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
                .catch(e => console.log("⚠️ page.goto timed out, continuing anyway..."));
            await waitForLoaderToHide(page);
            await page.waitForTimeout(2000);

            await selectUnit(page);
            scraped.sales_api_data = await extractApiDataFromDashboard(
              page, 1, 'importer/sales/getDashboard', 'Sales API',
            );
        });

        // ---------------------------------------------------------
        // 3. NAVIGATE BACK TO DASHBOARD & EXTRACT ROAD MAKING DATA
        // ---------------------------------------------------------
        await runStep('Road Making API', async () => {
            console.log("\n🔙 Navigating back to main dashboard...");
            await page.goto('https://epr.cpcb.gov.in/onboarding/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
                .catch(e => console.log("⚠️ page.goto timed out, continuing anyway..."));
            await waitForLoaderToHide(page);
            await page.waitForTimeout(2000);

            await selectUnit(page);
            scraped.road_making_api_data = await extractRoadMakingData(page);
        });

        // ---------------------------------------------------------
        // 4. NAVIGATE BACK TO DASHBOARD & EXTRACT WALLET FRONTEND
        // ---------------------------------------------------------
        await runStep('Wallet Frontend', async () => {
            console.log("\n🔙 Navigating back to main dashboard...");
            await page.goto('https://epr.cpcb.gov.in/onboarding/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
                .catch(e => console.log("⚠️ page.goto timed out, continuing anyway..."));
            await waitForLoaderToHide(page);
            await page.waitForTimeout(2000);

            await selectUnit(page);
            await extractWalletFrontendData(page);
        });

        // ---------------------------------------------------------
        // 5. EXTRACT WALLET API DATA (Directly after Frontend)
        // ---------------------------------------------------------
        await runStep('Wallet API', async () => {
            scraped.wallet_api_data = await extractWalletApiData(page);
        });

        // ---------------------------------------------------------
        // 6. ALL APPLICATIONS → EYE → PART A / B / C
        // ---------------------------------------------------------
        await runStep('New Application', async () => {
            console.log('\n========================================');
            console.log('🚀 Starting Extraction: New Application');
            console.log('========================================');

            console.log('\n🔙 Navigating to onboarding dashboard for All Applications...');
            await page
              .goto('https://epr.cpcb.gov.in/onboarding/dashboard', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
              })
              .catch((e) => console.log('⚠️ page.goto timed out, continuing anyway...'));
            await waitForLoaderToHide(page);
            await page.waitForTimeout(2000);

            scraped.new_application_data = await extractEprNewApplication(page);
            const newAppData = scraped.new_application_data;
            console.log(
              `🎉 New Application extracted | Part A: ${Object.keys(newAppData.part_a || {}).length} fields | Part B: ${Object.keys(newAppData.part_b || {}).length} fields | Part C: ${Object.keys(newAppData.part_c || {}).length} fields`,
            );
        });

        await runStep('Save to database', async () => {
            await persistScrapedData({ rootDir: process.cwd(), data: scraped });
        });

        console.log('\n🛑 All scraping complete. The browser will remain open.');
        await new Promise(() => {});
        
    } catch (error) {
        console.error("❌ Failed to extract onboarding data:", error.message);
        console.log("🛑 Error occurred. The browser will remain open for debugging. Please close it manually.");
        await new Promise(() => {});
    }
}

if (require.main === module) {
    extractOnboardingData().catch(console.error);
}

module.exports = { extractOnboardingData };
