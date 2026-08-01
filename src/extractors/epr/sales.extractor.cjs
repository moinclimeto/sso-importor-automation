const fs = require('fs');
const path = require('path');

async function extractEprSales(page) {
    console.log("📈 Navigating to EPR Sales Data...");
    const pageData = {};

    try {
        // Go back to the dashboard first so we can click the View button
        console.log("🖱️ Clicking 'Dashboard' in sidebar to reset view...");
        const dashboardLink = page.locator('app-dashboard-sidebar').getByText('Dashboard').first();
        await dashboardLink.click();
        await page.waitForTimeout(3000);

        // Now we are on the Dashboard. Click the 'View' button next to Sales Details.
        console.log("🖱️ Clicking 'View' button for Sales Details on the dashboard card...");
        const viewBtn = page.locator("xpath=//*[contains(text(), 'Sales Details')]/following::button[contains(., 'View')][1]");
        await viewBtn.waitFor({ state: 'visible', timeout: 8000 });
        await viewBtn.click();
        await page.waitForTimeout(3000);
        await page.waitForTimeout(2000); 

        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];

        for (const year of years) {
            console.log(`\n🔄 Processing Sales Year: ${year}`);
            
            try {
                // Removed API interceptor because frontend now sends timeInterval, which conflicts with fromDate/toDate

                // Visually change the year in the dropdown so the user can see it
                try {
                    console.log(`🖱️ Attempting to visually select 'Year' in interval dropdown...`);
                    const selects = page.locator('select.filter-select-input');
                    const count = await selects.count();
                    
                    if (count > 0) {
                        // The first select is the interval type (Day/Month/Year)
                        await selects.first().selectOption('year');
                        await page.waitForTimeout(1000);
                        
                        // There are probably 2 more selects or date inputs now for 'From' and 'To'
                        // Since we just need the API to trigger, we can try to select the year if they are selects
                        const allSelects = page.locator('select');
                        const totalSelects = await allSelects.count();
                        if (totalSelects >= 3) {
                            try { await allSelects.nth(1).selectOption(year); } catch (e) {}
                            await page.waitForTimeout(500);
                            try { await allSelects.nth(2).selectOption(year); } catch (e) {}
                            await page.waitForTimeout(500);
                        }
                    }
                } catch(e) {
                    console.log(`⚠️ Could not select year in UI. Error: ${e.message}`);
                }

                console.log("🖱️ Clicking 'Fetch Data' button...");
                const fetchBtn = page.locator('button').filter({ hasText: /Fetch Data/i }).first();
                await fetchBtn.waitFor({ state: 'visible', timeout: 5000 });
                await fetchBtn.click({ force: true });
                await page.waitForTimeout(3000);

                // Setup API listener BEFORE clicking the underlined data
                const apiResponsePromise = page.waitForResponse(
                    response => response.url().includes('salesList') && response.request().method() !== 'OPTIONS',
                    { timeout: 15000 }
                ).catch(() => null);

                // Click the table underlined data to trigger API
                console.log("🖱️ Clicking the underlined data in the table...");
                try {
                    // Find the underlined number in the first column or any link inside the table
                    const tableLink = page.locator('td u, td a, td [style*="underline"], td [class*="underline"]').first();
                    await tableLink.waitFor({ state: 'visible', timeout: 8000 });
                    await tableLink.click({ force: true });

                    // Wait for the API response
                    console.log("⏳ Waiting for API response (salesList)...");
                    const apiResponse = await apiResponsePromise;
                    if (apiResponse) {
                        const apiJson = await apiResponse.json();
                        console.log(`✅ API Response captured for ${year}!`);
                        fs.writeFileSync(path.join(dataDir, `sales_${year}.json`), JSON.stringify(apiJson, null, 2));
                        console.log(`📂 Saved data/sales_${year}.json`);
                    } else {
                        console.log(`⚠️ No API response caught for ${year} after clicking table button.`);
                    }
                    
                    // Close the modal
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(1000);

                } catch (e) {
                    console.log(`⏭️ No data/buttons found in table for year ${year}. Skipping...`);
                }
                
                // Remove listener here inside try block where debugListener is in scope
                page.removeListener('response', debugListener);

            } catch (err) {
                console.error(`❌ Error processing year ${year}:`, err);
            } finally {
                await page.unroute('**/api/v1/pwp/sales-details**').catch(() => null);
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
