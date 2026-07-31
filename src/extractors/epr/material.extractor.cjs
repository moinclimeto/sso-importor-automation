const fs = require('fs');
const path = require('path');

async function extractEprMaterial(page) {
    console.log("📦 Navigating to EPR Procurement (Material) Data...");
    const pageData = {};

    try {
        // We are on the Dashboard. Click the 'View' button next to Procurement Details.
        console.log("🖱️ Clicking 'View' button for Procurement Details on the dashboard card...");
        
        // Find the 'View' button that immediately follows the 'Procurement Details' text in the DOM
        const viewBtn = page.locator("xpath=//*[contains(text(), 'Procurement Details')]/following::button[contains(., 'View')][1]");
        await viewBtn.waitFor({ state: 'visible', timeout: 8000 });
        await viewBtn.click();
        await page.waitForTimeout(3000);
        await page.waitForTimeout(2000); 

        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];
        const fetchBtnXpath = "xpath=//html/body/app-root/app-dashboard/div/div[2]/div[2]/app-procurement-details/div/div[2]/div[2]/div[1]/div/app-data-filter/div[1]/button";
        const tableButtonXpath = "xpath=//html/body/app-root/app-dashboard/div/div[2]/div[2]/app-procurement-details/div/div[2]/div[2]/div[4]/div/app-table/div/div/table/tbody/tr[5]/td[3]/div/button";

        for (const year of years) {
            console.log(`\n🔄 Processing Year: ${year}`);
            
            try {
                // Intercept and force the API request to use the correct year dates (Fail-safe)
                await page.route('**/api/v1/pwp/procurement-details/**', async route => {
                    const requestUrl = new URL(route.request().url());
                    requestUrl.searchParams.set('fromDate', `01-01-${year}`);
                    requestUrl.searchParams.set('toDate', `31-12-${year}`);
                    await route.continue({ url: requestUrl.toString() });
                });

                // Visually change the year in the dropdown so the user can see it
                try {
                    console.log(`🖱️ Attempting to visually select Year ${year} in UI...`);
                    const selects = page.locator('select.filter-year-select');
                    if (await selects.count() >= 2) {
                        // Playwright's native selectOption is perfect for standard <select> tags
                        await selects.nth(0).selectOption(year);
                        await page.waitForTimeout(500);
                        
                        await selects.nth(1).selectOption(year);
                        await page.waitForTimeout(500);
                    }
                } catch(e) {
                    console.log(`⚠️ Could not select year in UI, but API interceptor will still force ${year} in background.`);
                }

                // Click Fetch Data (this triggers a UI refresh, but our route overrides the dates)
                console.log("🖱️ Clicking 'Fetch Data' button...");
                const fetchBtn = page.locator('button').filter({ hasText: /Fetch Data/i }).first();
                await fetchBtn.waitFor({ state: 'visible', timeout: 5000 });
                await fetchBtn.click();
                
                // Wait for table to load
                await page.waitForTimeout(3000);

                // Setup API listener AFTER Fetch Data (to catch the modal popup API, not the initial table API)
                const apiResponsePromise = page.waitForResponse(
                    response => response.url().includes('procurement-details/summary-details') && response.status() === 200,
                    { timeout: 15000 }
                ).catch(() => null);

                // Click the specific table button in the Total row
                console.log("🖱️ Clicking the table-link button in the Total row...");
                
                try {
                    // Find the row containing 'Total' in the first column, then get its button
                    const tableButton = page.locator('tr').filter({ has: page.locator('td', { hasText: 'Total' }) }).locator('button.table-link:visible').first();
                    await tableButton.waitFor({ state: 'visible', timeout: 8000 });
                    await tableButton.click();

                    // Wait for the API response that fires after clicking the table button
                    console.log("⏳ Waiting for API response...");
                    const apiResponse = await apiResponsePromise;
                    if (apiResponse) {
                        const apiJson = await apiResponse.json();
                        console.log(`✅ API Response captured for ${year}!`);
                        fs.writeFileSync(path.join(dataDir, `purchase_${year}.json`), JSON.stringify(apiJson, null, 2));
                        console.log(`📂 Saved data/purchase_${year}.json`);
                    } else {
                        console.log(`⚠️ No API response caught for ${year} after clicking table button.`);
                    }

                    // Close any modal that might have opened
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(1000);

                } catch (e) {
                    console.log(`⏭️ No data/buttons found in table for year ${year}. Skipping...`);
                }

            } catch (err) {
                console.error(`❌ Error processing year ${year}:`, err);
            } finally {
                await page.unroute('**/api/v1/pwp/procurement-details/summary-details*').catch(() => null);
            }
        }

        // Wait a couple seconds for the DOM to update
        await page.waitForTimeout(3000);

        // Extract all page data (Tables, Cards, Text)
        console.log("📊 Extracting HTML page data for the last selected year...");
        const htmlData = await page.evaluate(() => {
            const result = {
                tables: [],
                rawText: ""
            };

            const tables = document.querySelectorAll('table');
            tables.forEach((table) => {
                const tableData = [];
                const rows = table.querySelectorAll('tr');
                rows.forEach(row => {
                    const rowData = [];
                    const cells = row.querySelectorAll('th, td');
                    cells.forEach(cell => {
                        rowData.push(cell.innerText.trim());
                    });
                    if (rowData.length > 0) tableData.push(rowData);
                });
                if (tableData.length > 0) result.tables.push(tableData);
            });

            result.rawText = document.body.innerText;
            return result;
        });

        Object.assign(pageData, htmlData);

    } catch (error) {
        console.error("❌ Failed to extract EPR Procurement Data:", error.message);
    }

    return pageData;
}

module.exports = { extractEprMaterial };
