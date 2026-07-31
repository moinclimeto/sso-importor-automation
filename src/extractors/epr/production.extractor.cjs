const fs = require('fs');
const path = require('path');

async function extractEprProduction(page) {
    console.log("🏭 Navigating to EPR Production Data...");
    const pageData = {};

    try {
        // Go back to the dashboard first so we can click the View button
        console.log("🖱️ Clicking 'Dashboard' in sidebar to reset view...");
        const dashboardLink = page.locator('app-dashboard-sidebar').getByText('Dashboard').first();
        await dashboardLink.click();
        await page.waitForTimeout(3000);

        // Now we are on the Dashboard. Click the 'View' button next to Production Details.
        console.log("🖱️ Clicking 'View' button for Production Details on the dashboard card...");
        const viewBtn = page.locator("xpath=//*[contains(text(), 'Production Details')]/following::button[contains(., 'View')][1]");
        await viewBtn.waitFor({ state: 'visible', timeout: 8000 });
        await viewBtn.click();
        await page.waitForTimeout(3000);
        await page.waitForTimeout(2000); 

        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];

        for (const year of years) {
            console.log(`\n🔄 Processing Production Year: ${year}`);
            
            try {
                // Visually change the year in the dropdown so the user can see it
                try {
                    console.log(`🖱️ Attempting to visually select Year ${year} in UI...`);
                    // There are 3 dropdowns: 1. Interval Type (Year), 2. From Year, 3. To Year
                    const selects = page.locator('select');
                    const count = await selects.count();
                    
                    if (count >= 3) {
                        // Ensure first dropdown is set to 'Year' (if it has that option)
                        try { await selects.nth(0).selectOption({ label: 'Year' }); } catch (e) {}
                        await page.waitForTimeout(500);
                        
                        // Set From Year
                        await selects.nth(1).selectOption(year);
                        await page.waitForTimeout(500);
                        
                        // Set To Year
                        await selects.nth(2).selectOption(year);
                        await page.waitForTimeout(500);
                    } else if (count === 2) {
                        // Fallback if there's only 2
                        await selects.nth(0).selectOption(year);
                        await selects.nth(1).selectOption(year);
                    }
                } catch(e) {
                    console.log(`⚠️ Could not select year in UI.`);
                }

                // Debug listener to see what's actually being called when Fetch Data is clicked
                const debugListener = (response) => {
                    if (response.url().includes('/api/v1/')) {
                        console.log(`[Network Debug] Saw API call: ${response.url()} (Status: ${response.status()})`);
                    }
                };
                page.on('response', debugListener);

                // Setup API listener BEFORE clicking Fetch Data
                const apiResponsePromise = page.waitForResponse(
                    response => response.url().includes('get-dashboard') && response.request().method() !== 'OPTIONS',
                    { timeout: 15000 }
                ).catch(() => null);

                console.log("🖱️ Clicking 'Fetch Data' button...");
                const fetchBtn = page.getByRole('button', { name: /Fetch Data/i }).first();
                await fetchBtn.waitFor({ state: 'visible', timeout: 5000 });
                await fetchBtn.click({ force: true });
                
                // Wait for the API response
                console.log("⏳ Waiting for API response...");
                const apiResponse = await apiResponsePromise;
                
                page.removeListener('response', debugListener);

                if (apiResponse) {
                    const apiJson = await apiResponse.json();
                    console.log(`✅ API Response captured for ${year}!`);
                    fs.writeFileSync(path.join(dataDir, `production_${year}.json`), JSON.stringify(apiJson, null, 2));
                    console.log(`📂 Saved data/production_${year}.json`);
                } else {
                    console.log(`⚠️ No API response caught for ${year} after clicking Fetch Data.`);
                }
                
                await page.waitForTimeout(2000);

            } catch (err) {
                console.error(`❌ Error processing year ${year}:`, err);
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
