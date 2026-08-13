const fs = require('fs');
const path = require('path');

async function extractEprWallet(page) {
    console.log("💳 Navigating to EPR Wallet Data...");
    const walletData = {};

    try {
        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        // Setup explicit listeners for the required APIs
        const apiEndpoints = {
            'epr-certificate-type': 'cpcbwallet/api/v1/wallet/epr-certificate-type',
            'certificate-transaction': 'cpcbwallet/api/v1/certificate/transaction',
            'form-submissions-list': 'cpcbworkflow/api/v1/form-submissions/list',
            'wallet-potentials': 'cpcbwallet/api/v1/wallet/potentials',
            'certificate-category': 'cpcbwallet/api/v1/wallet/certificate-category'
        };

        const apiPromises = {};
        for (const [key, endpoint] of Object.entries(apiEndpoints)) {
            apiPromises[key] = page.waitForResponse(
                response => response.url().includes(endpoint) && response.status() === 200,
                { timeout: 30000 }
            ).catch(() => null); // Don't crash if one API doesn't fire
        }

        console.log("🖱️ Navigating to Wallet URL...");
        await page.goto("https://epr.cpcb.gov.in/onboarding/wallet", { waitUntil: 'networkidle' });
        
        // Wait generous time for APIs and Angular Material to finish rendering
        await page.waitForTimeout(5000); 

        // Resolve all API promises and save them individually
        console.log("⏳ Processing captured Wallet APIs...");
        for (const [key, promise] of Object.entries(apiPromises)) {
            const response = await promise;
            if (response) {
                try {
                    const json = await response.json();
                    fs.writeFileSync(path.join(dataDir, `wallet_${key}.json`), JSON.stringify(json, null, 2));
                    console.log(`✅ Saved data/wallet_${key}.json`);
                } catch (e) {
                    console.log(`⚠️ Failed to parse JSON for ${key}`);
                }
            } else {
                console.log(`⚠️ API ${key} did not fire within the timeout.`);
            }
        }

        // Extract HTML page data (Tables, Cards, Text) using improved locators for Angular Material
        console.log("📊 Extracting HTML page data from Wallet...");
        const htmlData = await page.evaluate(() => {
            const result = {
                tables: [],
                cards: [],
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

            const cards = document.querySelectorAll('.card, mat-card, .wallet-card');
            cards.forEach(card => {
                if (card.innerText.trim()) {
                    result.cards.push(card.innerText.trim());
                }
            });

            result.rawText = document.body.innerText;
            return result;
        });

        Object.assign(walletData, htmlData);
        console.log("✅ Wallet Page HTML extracted successfully!");

    } catch (error) {
        console.error("❌ Failed to extract EPR Wallet:", error.message);
    }

    return walletData;
}

module.exports = { extractEprWallet };
