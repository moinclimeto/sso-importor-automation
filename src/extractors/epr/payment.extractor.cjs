const fs = require('fs');
const path = require('path');

async function extractEprPaymentHistory(page) {
    console.log("💰 Navigating to EPR Payment History Data...");
    const paymentData = {};
    const apiData = {};

    try {
        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        // Setup API listener BEFORE navigating to capture all payment-related API data silently!
        const responseHandler = async (response) => {
            const url = response.url();
            // Capture any API request made by the payment page
            if (url.includes('/api/') && response.request().resourceType() === 'fetch' && response.status() === 200) {
                try {
                    const parsedUrl = new URL(url);
                    const endpointName = parsedUrl.pathname.split('/').pop() || 'data';
                    const json = await response.json();
                    
                    // Don't overwrite if multiple calls to same endpoint occur, just append an index
                    if (apiData[endpointName]) {
                        apiData[`${endpointName}_${Date.now()}`] = json;
                    } else {
                        apiData[endpointName] = json;
                    }
                } catch (e) {
                    // Ignore non-JSON or aborted requests
                }
            }
        };

        page.on('response', responseHandler);

        console.log("🖱️ Navigating to Payment History URL...");
        await page.goto("https://epr.cpcb.gov.in/onboarding/payment-history/all", { waitUntil: 'networkidle' });
        
        // Wait generous time for APIs and Angular Material to finish rendering
        await page.waitForTimeout(5000); 

        // Stop listening to responses to avoid memory leaks
        page.off('response', responseHandler);

        // Save the raw API data
        if (Object.keys(apiData).length > 0) {
            fs.writeFileSync(path.join(dataDir, 'payment_api_data.json'), JSON.stringify(apiData, null, 2));
            console.log("✅ Intercepted Payment API data saved to data/payment_api_data.json!");
        }

        // Extract HTML page data (Tables, Cards, Text) using locators for Angular Material
        console.log("📊 Extracting HTML page data from Payment History...");
        const htmlData = await page.evaluate(() => {
            const result = {
                tables: [],
                rawText: ""
            };

            const tables = document.querySelectorAll('table, mat-table, app-table');
            tables.forEach((table) => {
                const tableData = [];
                const rows = table.querySelectorAll('tr, mat-row, mat-header-row, .mat-row, .mat-header-row');
                rows.forEach(row => {
                    const rowData = [];
                    const cells = row.querySelectorAll('th, td, mat-cell, mat-header-cell, .mat-cell, .mat-header-cell');
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

        Object.assign(paymentData, htmlData);
        console.log("✅ Payment History Page HTML extracted successfully!");

    } catch (error) {
        console.error("❌ Failed to extract EPR Payment History:", error.message);
    }

    return paymentData;
}

module.exports = { extractEprPaymentHistory };
