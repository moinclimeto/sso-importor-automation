const fs = require('fs');
const path = require('path');
const { loginEpr } = require('./login.playwright.cjs');

async function extractOnboardingData() {
    console.log("🚀 Starting Onboarding Data Extractor...");
    
    // Step 1: Login and navigate through the modals
    const { context, page } = await loginEpr("", "");

    try {
        console.log("🌐 Waiting for navigation to Onboarding page...");
        // Wait for page to settle after clicking Open
        await page.waitForTimeout(5000);
        
        // Optionally wait for network to be idle
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            console.log("⚠️ Network idle wait timed out, proceeding anyway...");
        }
        
        console.log(`📊 Current URL is: ${page.url()}`);
        console.log("📸 Taking screenshot for debugging...");
        await page.screenshot({ path: path.join(process.cwd(), 'playwright_data', 'onboarding_screenshot.png') });

        console.log("📊 Extracting data from page...");
        
        // Step 2: Scrape the data inside the browser context
        const extractedData = await page.evaluate(() => {
            const data = {
                url: window.location.href,
                tables: {},
                cards: [],
                rawText: ""
            };
            const logs = [];

            // 1. Extract Form Fields (robust Angular Material handling)
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
                if (input) {
                    val = input.value || input.getAttribute('aria-valuenow') || input.getAttribute('value') || '';
                }
                
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
                    if (lines.length > 0) {
                        val = lines[0];
                    }
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
                
                if (tableData.length > 0) {
                    data.tables[tableName] = tableData;
                }
            });

            // 3. Extract generic Cards / Text Blocks
            const allDivs = document.querySelectorAll('div, mat-card, .card, span, p');
            allDivs.forEach(div => {
                if (div.children.length === 0 && div.innerText.trim().length > 0) {
                    if (div.innerText.length < 200) {
                        data.cards.push(div.innerText.trim());
                    }
                }
            });
            data.cards = [...new Set(data.cards)];

            // 4. Extract all raw text as fallback
            data.rawText = document.body.innerText;

            return { data, logs };
        });

        // Step 3: Save to JSON file
        const outputDir = path.join(process.cwd(), 'playwright_data');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputPath = path.join(outputDir, 'onboarding_data.json');
        fs.writeFileSync(outputPath, JSON.stringify(extractedData, null, 2));
        
        console.log(`✅ Data successfully extracted and saved to: ${outputPath}`);

        // Keep the browser open for a few seconds so you can see it before closing
        await page.waitForTimeout(2000);
        await context.close();
        
    } catch (error) {
        console.error("❌ Failed to extract onboarding data:", error.message);
        // We do not close the context here immediately so you can inspect the failure in the browser
    }
}

if (require.main === module) {
    extractOnboardingData().catch(console.error);
}

module.exports = { extractOnboardingData };
