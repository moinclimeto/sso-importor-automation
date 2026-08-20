const fs = require('fs');
const path = require('path');
const { loginEpr } = require('./login.playwright.cjs');

async function extractApiDataFromDashboard(page, viewButtonIndex, apiPathKeyword, outputFilename) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: ${outputFilename}`);
    console.log(`========================================`);

    console.log(`🖱️ Clicking 'View' button at index ${viewButtonIndex}...`);
    const viewBtns = page.locator('button.btn-underline:has-text("View")');
    await viewBtns.nth(viewButtonIndex).waitFor({ state: 'visible', timeout: 10000 });
    await viewBtns.nth(viewButtonIndex).click();

    console.log("⏳ Waiting for Dashboard to load...");
    await page.waitForTimeout(5000);

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
        
        await fySelect.selectOption(year);
        await fySelect.dispatchEvent('change');

        const responsePromise = page.waitForResponse(
            (response) => response.url().includes(apiPathKeyword) && 
                          response.url().includes(`financialYear=${year}`) && 
                          response.request().method() !== 'OPTIONS',
            { timeout: 15000 }
        );

        await page.waitForTimeout(500);
        await fetchBtn.click();

        try {
            const apiResponse = await responsePromise;
            const jsonPayload = await apiResponse.json();
            console.log(`✅ Received API data for ${year}!`);
            apiDataResults[year] = jsonPayload;
        } catch (error) {
            console.error(`❌ Failed to get API data for ${year}:`, error.message);
            apiDataResults[year] = { error: "Failed to fetch data or timeout." };
        }
        
        await page.waitForTimeout(1000);
    }

    const outputDir = path.join(process.cwd(), 'playwright_data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, outputFilename);
    fs.writeFileSync(outputPath, JSON.stringify(apiDataResults, null, 2));
    console.log(`🎉 Data successfully extracted and saved to: ${outputPath}`);
}

async function extractRoadMakingData(page) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: road_making_api_data.json`);
    console.log(`========================================`);

    // Instead of clicking "View", we click "Operations" from the sidebar
    console.log(`🖱️ Clicking 'Operations' in the sidebar...`);
    const operationsMenu = page.locator('span.label, .menu-item, span').filter({ hasText: 'Operations' }).first();
    await operationsMenu.waitFor({ state: 'visible', timeout: 10000 });
    await operationsMenu.click();

    console.log("⏳ Waiting for Operations menu to expand...");
    await page.waitForTimeout(2000);

    // Click on the Road Making Declaration tab/menu item
    console.log("🖱️ Clicking 'Road Making Declaration' tab...");
    const roadMakingTab = page.getByText('Road Making Declaration').first();
    await roadMakingTab.waitFor({ state: 'visible', timeout: 15000 });
    await roadMakingTab.click();
    await page.waitForTimeout(2000);

    // It seems "PW Procurement" is a sub-tab we need to click
    console.log("🖱️ Clicking 'PW Procurement' sub-tab...");
    const pwProcurementTab = page.getByText('PW Procurement').first();
    try {
        await pwProcurementTab.waitFor({ state: 'visible', timeout: 5000 });
        await pwProcurementTab.click();
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
        
        await dateInputs.nth(0).fill(range.start);
        await dateInputs.nth(1).fill(range.end);
        
        await dateInputs.nth(0).dispatchEvent('change');
        await dateInputs.nth(1).dispatchEvent('change');

        // Set up relaxed API interceptor since dates might be in the POST body or differently named
        const responsePromise = page.waitForResponse(
            (response) => response.url().includes('get-dashboard-road') && 
                          response.request().method() !== 'OPTIONS',
            { timeout: 15000 }
        );

        await page.waitForTimeout(500);
        await fetchBtn.click();

        try {
            const apiResponse = await responsePromise;
            const jsonPayload = await apiResponse.json();
            console.log(`✅ Received Road Making API data for ${range.start} to ${range.end}!`);
            apiDataResults[`${range.start}_to_${range.end}`] = jsonPayload;
        } catch (error) {
            console.error(`❌ Failed to get Road Making API data for ${range.start}:`, error.message);
            apiDataResults[`${range.start}_to_${range.end}`] = { error: "Failed to fetch data or timeout." };
        }
        
        await page.waitForTimeout(1000);
    }

    const outputDir = path.join(process.cwd(), 'playwright_data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, 'road_making_api_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(apiDataResults, null, 2));
    console.log(`🎉 Road Making Data successfully extracted and saved to: ${outputPath}`);
}

async function extractWalletFrontendData(page) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: wallet_frontend_data.json`);
    console.log(`========================================`);

    console.log(`🖱️ Clicking 'Wallet' in the sidebar...`);
    const walletMenu = page.locator('span.label, .menu-item, span').filter({ hasText: 'Wallet' }).first();
    await walletMenu.waitFor({ state: 'visible', timeout: 10000 });
    await walletMenu.click();

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

    const outputDir = path.join(process.cwd(), 'playwright_data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, 'wallet_frontend_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(extractedData, null, 2));
    console.log(`🎉 Wallet Frontend Data successfully extracted and saved to: ${outputPath}`);
}

async function extractWalletApiData(page) {
    console.log(`\n========================================`);
    console.log(`🚀 Starting Extraction: wallet_api_data.json`);
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
        
        // Setup API Interceptor
        const responsePromise = page.waitForResponse(
            (response) => response.url().includes(tab.apiPath) && 
                          response.request().method() !== 'OPTIONS',
            { timeout: 15000 }
        );

        // Before clicking 'Filing', we click 'Available' to ensure 'Filing' is not already active
        if (tab.name === 'Filing') {
            try {
                await page.locator('span.certificate-tab', { hasText: 'Available' }).first().click({ force: true });
                await page.waitForTimeout(1000);
            } catch (e) {}
        }

        // Click the tab
        try {
            const tabElem = page.locator('span.certificate-tab').filter({ hasText: tab.name }).first();
            await tabElem.waitFor({ state: 'visible', timeout: 5000 });
            await tabElem.click({ force: true });

            // Wait for response
            const apiResponse = await responsePromise;
            const jsonPayload = await apiResponse.json();
            console.log(`✅ Received Wallet API data for ${tab.name}!`);
            apiDataResults[tab.name] = jsonPayload;

        } catch (error) {
            console.error(`❌ Failed to get API data for ${tab.name}:`, error.message);
            apiDataResults[tab.name] = { error: "Failed to fetch data or timeout." };
        }

        await page.waitForTimeout(1000);
    }

    const outputDir = path.join(process.cwd(), 'playwright_data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, 'wallet_api_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(apiDataResults, null, 2));
    console.log(`🎉 Wallet API Data successfully extracted and saved to: ${outputPath}`);
}

async function selectUnit(page) {
    console.log("🖱️ Clicking 'Select Unit' button...");
    const selectUnitBtn = page.locator('button.action-btn', { hasText: 'Select Unit' }).first();
    await selectUnitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await selectUnitBtn.click();
    
    console.log("⏳ Waiting for unit cards to load...");
    const unitCardBtn = page.locator('button.unit-card', { hasText: 'MALOO INDUSTRIES' }).first();
    await unitCardBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log("🖱️ Clicking 'MALOO INDUSTRIES' unit card...");
    await unitCardBtn.click();
    
    console.log("⏳ Waiting for data to refresh after unit selection...");
    await page.waitForTimeout(5000);
}

async function extractOnboardingData() {
    console.log("🚀 Starting Combined API Data Extractor...");
    
    const { context, page } = await loginEpr("", "");

    try {
        console.log("🌐 Waiting for navigation to Onboarding page...");
        await page.waitForTimeout(5000);
        
        // ---------------------------------------------------------
        // 1. EXTRACT PROCUREMENT DATA
        // ---------------------------------------------------------
        await selectUnit(page);
        await extractApiDataFromDashboard(page, 0, 'procurement/dashboard/summary', 'procurement_api_data.json');

        // ---------------------------------------------------------
        // 2. NAVIGATE BACK TO DASHBOARD & EXTRACT SALES DATA
        // ---------------------------------------------------------
        console.log("\n🔙 Navigating back to main dashboard...");
        await page.goto('https://epr.cpcb.gov.in/onboarding/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
            .catch(e => console.log("⚠️ page.goto timed out, continuing anyway..."));
        await page.waitForTimeout(5000);

        await selectUnit(page);
        await extractApiDataFromDashboard(page, 1, 'importer/sales/getDashboard', 'sales_api_data.json');

        // ---------------------------------------------------------
        // 3. NAVIGATE BACK TO DASHBOARD & EXTRACT ROAD MAKING DATA
        // ---------------------------------------------------------
        console.log("\n🔙 Navigating back to main dashboard...");
        await page.goto('https://epr.cpcb.gov.in/onboarding/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
            .catch(e => console.log("⚠️ page.goto timed out, continuing anyway..."));
        await page.waitForTimeout(5000);

        await selectUnit(page);
        await extractRoadMakingData(page);

        // ---------------------------------------------------------
        // 4. NAVIGATE BACK TO DASHBOARD & EXTRACT WALLET FRONTEND
        // ---------------------------------------------------------
        console.log("\n🔙 Navigating back to main dashboard...");
        await page.goto('https://epr.cpcb.gov.in/onboarding/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
            .catch(e => console.log("⚠️ page.goto timed out, continuing anyway..."));
        await page.waitForTimeout(5000);

        await selectUnit(page); // This unlocks the sidebar menus
        await extractWalletFrontendData(page);

        // ---------------------------------------------------------
        // 5. EXTRACT WALLET API DATA (Directly after Frontend)
        // ---------------------------------------------------------
        await extractWalletApiData(page);

        console.log("\n🛑 All scraping complete. The browser will remain open.");
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
