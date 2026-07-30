const fs = require('fs');
const path = require('path');

async function extractEprMaterial(page) {
    console.log("📦 Navigating to EPR Procurement (Material) Data...");
    const pageData = {};

    try {
        // 1. Click on the "View" button on the dashboard for Procurement Details
        const viewBtnXpath = "xpath=//html/body/app-root/app-dashboard/div/div[2]/div[2]/app-onboard-dashboard/div/div[3]/app-onboard-dashboard-summary/div/div[2]/div[1]/app-operations-card/div/div[2]/div[1]/div/app-custom-button/button";
        
        console.log("🖱️ Clicking 'View' Procurement Details on Dashboard...");
        await page.waitForSelector(viewBtnXpath, { state: 'visible', timeout: 15000 });
        await page.click(viewBtnXpath);

        // Wait for page navigation to procurement details
        await page.waitForURL('**/onboarding/procurement-details*', { timeout: 15000 });
        console.log("✅ Reached Procurement Details page.");
        await page.waitForTimeout(2000); 

        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];
        const fetchBtnXpath = "xpath=//html/body/app-root/app-dashboard/div/div[2]/div[2]/app-procurement-details/div/div[2]/div[2]/div[1]/div/app-data-filter/div[1]/button";
        const tableButtonXpath = "xpath=//html/body/app-root/app-dashboard/div/div[2]/div[2]/app-procurement-details/div/div[2]/div[2]/div[4]/div/app-table/div/div/table/tbody/tr[5]/td[3]/div/button";

        for (const year of years) {
            console.log(`\n🔄 Processing Year: ${year}`);
            
            try {
                // Try to click the first year dropdown (index 1 assuming index 0 is "Year" filter type)
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

                // Setup API listener BEFORE clicking the table button
                const apiResponsePromise = page.waitForResponse(
                    response => response.url().includes('api/v1/pwp/procurement-details/') && response.status() === 200,
                    { timeout: 15000 }
                ).catch(() => null);

                // Click Fetch Data
                console.log("🖱️ Clicking 'Fetch Data' button...");
                await page.waitForSelector(fetchBtnXpath, { state: 'visible', timeout: 5000 });
                await page.click(fetchBtnXpath);
                
                // Wait for table to load
                await page.waitForTimeout(3000);

                // Click the specific table button provided by the user
                console.log("🖱️ Clicking the Table Button (tr[5]/td[3])...");
                await page.waitForSelector(tableButtonXpath, { state: 'visible', timeout: 5000 });
                await page.click(tableButtonXpath);

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

                // Close any modal that might have opened from clicking the table button
                // Pressing escape is usually a safe way to close modals
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
        console.error("❌ Failed to extract EPR Procurement Data:", error.message);
    }

    return pageData;
}

module.exports = { extractEprMaterial };
