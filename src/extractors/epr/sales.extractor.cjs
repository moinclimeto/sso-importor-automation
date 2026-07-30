const fs = require('fs');
const path = require('path');

async function extractEprSales(page) {
    console.log("📈 Navigating to EPR Sales Data...");
    const pageData = {};

    try {
        // Go directly to the Sales Details page
        console.log("🖱️ Navigating to Sales Details URL...");
        await page.goto("https://epr.cpcb.gov.in/onboarding/sales-details", { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000); 

        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];

        for (const year of years) {
            console.log(`\n🔄 Processing Sales Year: ${year}`);
            
            try {
                // Try to click the first year dropdown
                console.log(`🖱️ Selecting From Year: ${year}...`);
                // Wait for the dropdowns to render
                await page.waitForSelector('mat-select, select', { state: 'attached', timeout: 10000 }).catch(() => null);
                
                // Try finding either mat-select or native select
                let dropdowns = page.locator('mat-select');
                if (await dropdowns.count() < 3) {
                    dropdowns = page.locator('select');
                }
                
                if (await dropdowns.count() >= 3) {
                    // Click From Year
                    await dropdowns.nth(1).click();
                    await page.waitForTimeout(500);
                    // Native select vs mat-select handling
                    if (await page.locator('mat-option').count() > 0) {
                        await page.locator('mat-option').filter({ hasText: year }).first().click();
                    } else {
                        await dropdowns.nth(1).selectOption({ label: year }).catch(() => null);
                    }
                    await page.waitForTimeout(500);

                    // Click To Year
                    console.log(`🖱️ Selecting To Year: ${year}...`);
                    await dropdowns.nth(2).click();
                    await page.waitForTimeout(500);
                    if (await page.locator('mat-option').count() > 0) {
                        await page.locator('mat-option').filter({ hasText: year }).first().click();
                    } else {
                        await dropdowns.nth(2).selectOption({ label: year }).catch(() => null);
                    }
                    await page.waitForTimeout(500);
                } else {
                    console.log("⚠️ Could not find enough dropdowns. Count:", await dropdowns.count());
                }

                // Click Fetch Data button first to load the table
                console.log("🖱️ Clicking 'Fetch Data' button...");
                const fetchBtn = page.getByRole('button', { name: /Fetch Data/i }).first();
                await fetchBtn.waitFor({ state: 'visible', timeout: 5000 });
                await fetchBtn.click();
                
                // Wait for table to load
                await page.waitForTimeout(3000);

                // Setup API listener BEFORE clicking the table button
                // Listening for /api/v1/pwp/sales/categoryDetails
                const apiResponsePromise = page.waitForResponse(
                    response => response.url().includes('/api/v1/pwp/sales/categoryDetails') && response.status() === 200,
                    { timeout: 15000 }
                ).catch(() => null);

                // Click the specific table button provided by the user
                const tableButtonXpath = "xpath=//html/body/app-root/app-dashboard/div/div[2]/div[2]/app-sales-details/div/div[2]/div[5]/app-table/div/div/table/tbody/tr[3]/td[2]/div/button";
                console.log("🖱️ Clicking the Table Button (tr[3]/td[2])...");
                await page.waitForSelector(tableButtonXpath, { state: 'visible', timeout: 5000 });
                await page.click(tableButtonXpath);

                // Wait for the API response
                console.log("⏳ Waiting for API response...");
                const apiResponse = await apiResponsePromise;
                if (apiResponse) {
                    const apiJson = await apiResponse.json();
                    console.log(`✅ API Response captured for ${year}!`);
                    fs.writeFileSync(path.join(dataDir, `sales_data_${year}.json`), JSON.stringify(apiJson, null, 2));
                    console.log(`📂 Saved data/sales_data_${year}.json`);
                } else {
                    console.log(`⚠️ No API response caught for ${year} after clicking the table button.`);
                }
                
                // Close the modal
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);

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
        console.error("❌ Failed to extract EPR Sales Data:", error.message);
    }

    return pageData;
}

module.exports = { extractEprSales };
