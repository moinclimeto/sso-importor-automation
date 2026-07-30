const fs = require('fs');
const path = require('path');

async function extractEprProduction(page) {
    console.log("🏭 Navigating to EPR Production Data...");
    const pageData = {};

    try {
        // Go directly to the Production Details page
        console.log("🖱️ Navigating to Production Details URL...");
        await page.goto("https://epr.cpcb.gov.in/onboarding/production-details", { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000); 

        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];

        for (const year of years) {
            console.log(`\n🔄 Processing Production Year: ${year}`);
            
            try {
                // Try to click the first year dropdown
                console.log(`🖱️ Selecting From Year: ${year}...`);
                const dropdowns = page.locator('mat-select');
                
                if (await dropdowns.count() >= 3) {
                    // Click From Year
                    await dropdowns.nth(1).click();
                    await page.waitForTimeout(500);
                    await page.locator('mat-option').filter({ hasText: year }).first().click();
                    await page.waitForTimeout(500);

                    // Click To Year
                    console.log(`🖱️ Selecting To Year: ${year}...`);
                    await dropdowns.nth(2).click();
                    await page.waitForTimeout(500);
                    await page.locator('mat-option').filter({ hasText: year }).first().click();
                    await page.waitForTimeout(500);
                } else {
                    console.log("⚠️ Could not find mat-select dropdowns. Ensure UI is fully loaded.");
                }

                // Setup API listener BEFORE clicking Fetch Data
                // Listening for /api/v1/production/category-details
                const apiResponsePromise = page.waitForResponse(
                    response => response.url().includes('/api/v1/production/category-details') && response.status() === 200,
                    { timeout: 15000 }
                ).catch(() => null);

                // Click Fetch Data button (using generic text locator to be robust)
                console.log("🖱️ Clicking 'Fetch Data' button...");
                const fetchBtn = page.getByRole('button', { name: /Fetch Data/i }).first();
                await fetchBtn.waitFor({ state: 'visible', timeout: 5000 });
                await fetchBtn.click();
                
                // Wait for the API response
                console.log("⏳ Waiting for API response...");
                const apiResponse = await apiResponsePromise;
                if (apiResponse) {
                    const apiJson = await apiResponse.json();
                    console.log(`✅ API Response captured for ${year}!`);
                    fs.writeFileSync(path.join(dataDir, `production_data_${year}.json`), JSON.stringify(apiJson, null, 2));
                    console.log(`📂 Saved data/production_data_${year}.json`);
                } else {
                    console.log(`⚠️ No API response caught for ${year} after clicking Fetch Data.`);
                }

            } catch (err) {
                console.error(`❌ Failed processing year ${year}:`, err.message);
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
        console.error("❌ Failed to extract EPR Production Data:", error.message);
    }

    return pageData;
}

module.exports = { extractEprProduction };
