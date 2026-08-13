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

        // === NEW: FETCH BULK ENTRY INVENTORY DATA ===
        try {
            console.log("🖱️ Clicking 'Bulk Entry' button to fetch Inventory Data...");
            const bulkEntryBtn = page.locator('button').filter({ hasText: 'Bulk Entry' }).first();
            await bulkEntryBtn.waitFor({ state: 'visible', timeout: 5000 });

            await bulkEntryBtn.click({ force: true });
            await page.waitForTimeout(8000);

            console.log(`✅ Bulk Entry opened. Scrolling to load all table data...`);

            // Fetch all data by scrolling the table container in the DOM
            const allInventoryData = await page.evaluate(async () => {
                const extractRows = () => {
                    const headers = Array.from(document.querySelectorAll('table thead th, mat-header-row mat-header-cell')).map(th => th.innerText.trim());
                    const rows = document.querySelectorAll('table tbody tr, mat-row');
                    const results = [];
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td, mat-cell');
                        if (cells.length > 0) {
                            const rowData = {};
                            Array.from(cells).forEach((cell, idx) => {
                                const key = headers[idx] || `col_${idx}`;
                                rowData[key] = cell.innerText.trim();
                            });
                            results.push(rowData);
                        }
                    });
                    return results;
                };

                const uniqueRows = new Map();
                
                const table = document.querySelector('table, mat-table');
                if (!table) return [];
                
                const getScrollableParents = (node) => {
                    const parents = [window];
                    let current = node;
                    while (current && current !== document.body) {
                        const style = window.getComputedStyle(current);
                        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                            parents.push(current);
                        }
                        current = current.parentElement;
                    }
                    return parents;
                };
                
                const scrollableNodes = getScrollableParents(table);
                let retries = 0;
                let lastCount = 0;
                
                // Keep scrolling and extracting until no new data appears for several attempts
                while (retries < 10) {
                    const currentData = extractRows();
                    let newDataAdded = false;
                    
                    currentData.forEach(row => {
                        const key = row['S.N'] || row['Production ID'] || JSON.stringify(row);
                        if (!uniqueRows.has(key)) {
                            uniqueRows.set(key, row);
                            newDataAdded = true;
                        }
                    });
                    
                    if (!newDataAdded && uniqueRows.size === lastCount) {
                        retries++;
                    } else {
                        retries = 0; 
                    }
                    lastCount = uniqueRows.size;
                    
                    // Scroll down
                    scrollableNodes.forEach(node => {
                        if (node === window) {
                            window.scrollBy(0, 1000);
                        } else {
                            node.scrollTop += 1500;
                        }
                    });
                    
                    // Fallback: Scroll the last row into view
                    const trs = document.querySelectorAll('table tbody tr');
                    if (trs.length > 0) {
                        try { trs[trs.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch(e) {}
                    }
                    
                    await new Promise(r => setTimeout(r, 1200));
                }
                
                return Array.from(uniqueRows.values());
            });

            console.log(`✅ Fetched ${allInventoryData.length} records from Sales Inventory via DOM scrolling.`);
            fs.writeFileSync(path.join(dataDir, 'inventory.json'), JSON.stringify(allInventoryData, null, 2));
            console.log(`📂 Saved data/inventory.json`);

            // Close the Bulk Entry modal or page by going back to dashboard
            console.log("🖱️ Going back to Dashboard to reset view for Yearly extraction...");
            const dashboardLinkBulk = page.locator('app-dashboard-sidebar').getByText('Dashboard').first();
            await dashboardLinkBulk.click({ force: true });
            await page.waitForTimeout(3000);

            console.log("🖱️ Re-clicking 'View' button for Sales Details...");
            const viewBtnBulk = page.locator("xpath=//*[contains(text(), 'Sales Details')]/following::button[contains(., 'View')][1]");
            await viewBtnBulk.waitFor({ state: 'visible', timeout: 8000 });
            await viewBtnBulk.click();
            await page.waitForTimeout(3000);
        } catch (bulkErr) {
            console.log(`⏭️ Could not fetch Bulk Entry Inventory data: ${bulkErr.message}`);
        }
        // === END BULK ENTRY ===

        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];

        for (const year of years) {
            console.log(`\n🔄 Processing Sales Year: ${year}`);
            
            try {
                // Removed API interceptor because frontend now sends timeInterval, which conflicts with fromDate/toDate

                // Visually change the year in the dropdown so the user can see it
                try {
                    console.log(`🖱️ Attempting to visually select 'Year' in interval dropdown...`);
                    const intervalSelect = page.locator('select.filter-select-input').first();
                    if (await intervalSelect.count() > 0) {
                        await intervalSelect.selectOption('year');
                        await page.waitForTimeout(2000); // Wait for DOM to update
                        
                        // There are 2 more selects for 'From' and 'To' year with class 'filter-year-select'
                        const yearSelects = page.locator('select.filter-year-select');
                        const countYearSelects = await yearSelects.count();
                        console.log(`Dropdowns found with class 'filter-year-select': ${countYearSelects}`);
                        
                        if (countYearSelects >= 2) {
                            try { await yearSelects.nth(0).selectOption(year); console.log('Set From year'); } catch (e) { console.log(e.message) }
                            await page.waitForTimeout(1000);
                            try { await yearSelects.nth(1).selectOption(year); console.log('Set To year'); } catch (e) { console.log(e.message) }
                            await page.waitForTimeout(1000);
                        } else {
                            // Fallback if class isn't exactly as expected
                            const allSelects = page.locator('select');
                            const total = await allSelects.count();
                            console.log(`Fallback: Total selects found: ${total}`);
                            if (total >= 3) {
                                try { await allSelects.nth(1).selectOption(year); console.log('Set From year (fallback)'); } catch (e) {}
                                await page.waitForTimeout(1000);
                                try { await allSelects.nth(2).selectOption(year); console.log('Set To year (fallback)'); } catch (e) {}
                                await page.waitForTimeout(1000);
                            }
                        }
                    }
                } catch(e) {
                    console.log(`⚠️ Could not select year in UI. Error: ${e.message}`);
                }

                console.log("🖱️ Clicking 'Fetch Data' button...");
                const fetchBtn = page.locator('button').filter({ hasText: /Fetch Data/i }).first();
                await fetchBtn.waitFor({ state: 'visible', timeout: 5000 });
                await fetchBtn.click({ force: true });
                
                // Wait for any potential loaders to disappear and table to populate
                await page.waitForTimeout(5000);

                    // Click the table underlined data to trigger API
                    console.log("🖱️ Clicking the underlined data in the table...");
                    try {
                    
                    // The safest way to click the right number is to target the first row's first/second column that has a number
                    // Often it's the very first cell in tbody
                    const firstRowCells = page.locator('tbody tr, mat-row').first().locator('td, mat-cell');
                    
                    // We know 'Qty of Clinker Sold' is the first or second column. 
                    // Let's just click the first one that has a number greater than 0
                    let targetLink = null;
                    const cellCount = await firstRowCells.count();
                    for (let i = 0; i < cellCount; i++) {
                        const cell = firstRowCells.nth(i);
                        const text = await cell.innerText();
                        if (/[1-9]/.test(text)) {
                            targetLink = cell.locator('u, a, span').first();
                            if (await targetLink.count() === 0) {
                                targetLink = cell; // click the cell itself if no inner span/u
                            }
                            break;
                        }
                    }

                    if (!targetLink) {
                        targetLink = page.locator('td, mat-cell').filter({ hasText: /[1-9]/ }).first();
                    }

                    await targetLink.waitFor({ state: 'visible', timeout: 8000 });
                    const linkText = await targetLink.innerText();
                    console.log(`🖱️ Clicking target with text: ${linkText}`);
                    
                    // Setup API listener BEFORE clicking the underlined data
                    const apiResponsePromise = page.waitForResponse(
                        response => response.url().includes('salesList') && response.request().method() !== 'OPTIONS',
                        { timeout: 15000 }
                    ).catch(() => null);

                    await targetLink.click({ force: true });

                    // Wait for the API response
                    console.log("⏳ Waiting for API response (salesList)...");
                    const apiReq = await apiResponsePromise;

                    if (apiReq) {
                        const requestUrl = apiReq.url();
                        const headers = apiReq.request().headers();
                        const method = apiReq.request().method();
                        const postData = apiReq.request().postData();
                        
                        console.log(`✅ Caught salesList request. Method: ${method}, Fetching all pages...`);

                        // Fetch all pages in browser context
                        const allSalesData = await page.evaluate(async ({ requestUrl, headers, method, postData }) => {
                            let pageNum = 1;
                            let results = [];
                            
                            while (true) {
                                let url = requestUrl;
                                let fetchOptions = { headers, method };
                                
                                if (method.toUpperCase() === 'POST') {
                                    let body = {};
                                    if (postData) {
                                        try { body = JSON.parse(postData); } catch (e) { body = {}; }
                                    }
                                    body.page = pageNum;
                                    if (!body.limit) body.limit = 10;
                                    fetchOptions.body = JSON.stringify(body);
                                } else {
                                    const urlObj = new URL(requestUrl);
                                    urlObj.searchParams.set('page', pageNum.toString());
                                    if (!urlObj.searchParams.has('limit')) urlObj.searchParams.set('limit', '10');
                                    url = urlObj.toString();
                                }
                                
                                try {
                                    const res = await fetch(url, fetchOptions);
                                    if (!res.ok) break;
                                    const json = await res.json();
                                    
                                    // Handle nested data structures
                                    let items = [];
                                    if (json.data && Array.isArray(json.data.data)) {
                                        items = json.data.data;
                                    } else if (Array.isArray(json.data)) {
                                        items = json.data;
                                    } else if (json.data && Array.isArray(json.data.list)) {
                                        items = json.data.list;
                                    } else if (json.data && Array.isArray(json.data.salesDetails)) {
                                        items = json.data.salesDetails;
                                    }
                                                  
                                    if (items.length === 0) break;
                                    
                                    // Safety: If the API ignores pagination and returns the same data, break the loop
                                    const itemsHash = JSON.stringify(items);
                                    if (window.__lastItemsHash === itemsHash) {
                                        console.log("API returned identical data for next page. Pagination likely not supported. Breaking loop.");
                                        break;
                                    }
                                    window.__lastItemsHash = itemsHash;
                                    
                                    if (pageNum > 50) {
                                        console.log("Hard limit of 50 pages reached. Breaking loop.");
                                        break;
                                    }
                                    
                                    results.push(...items);
                                    
                                    // Check limit to determine if it's the last page
                                    let limit = 10;
                                    if (method.toUpperCase() === 'POST' && fetchOptions.body) {
                                        limit = JSON.parse(fetchOptions.body).limit || 10;
                                    } else {
                                        limit = parseInt(new URL(url).searchParams.get('limit')) || 10;
                                    }
                                    
                                    if (items.length < limit) break; // Last page reached
                                    pageNum++;
                                } catch (err) {
                                    console.error("Fetch error on page " + pageNum, err);
                                    break;
                                }
                            }
                            return results;
                        }, { requestUrl, headers, method, postData });

                        console.log(`✅ API Response aggregated for ${year}! Total records: ${allSalesData.length}`);
                        fs.writeFileSync(path.join(dataDir, `sales_${year}.json`), JSON.stringify(allSalesData, null, 2));
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
