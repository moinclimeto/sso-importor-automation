async function extractEprDashboard(page) {
    console.log("📊 Extracting EPR Dashboard Data...");
    const dashboardData = {};

    try {
        // We are already on the dashboard, so just wait for it to settle
        // Wait for the main content to load (adjust selector if needed)
        await page.waitForTimeout(3000); 

        // Generic extraction of all readable data on the dashboard
        const data = await page.evaluate(() => {
            const result = {
                tables: [],
                cards: [],
                rawText: ""
            };

            // 1. Extract all tables
            const tables = document.querySelectorAll('table');
            tables.forEach((table, index) => {
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

            // 2. Extract potential stat cards (divs with numbers and short text)
            // This is a generic heuristic that looks for small blocks of text containing numbers
            const allDivs = document.querySelectorAll('div, mat-card, .card');
            allDivs.forEach(div => {
                // Heuristic: If a div has no child divs but has some text and numbers
                if (div.children.length <= 1 && div.innerText.trim().length > 0 && /\d/.test(div.innerText)) {
                    // Avoid duplicating huge blocks of text
                    if (div.innerText.length < 200) {
                        result.cards.push(div.innerText.trim());
                    }
                }
            });
            
            // Deduplicate cards
            result.cards = [...new Set(result.cards)];

            // 3. Fallback: Dump all text on the page in case specific selectors miss something
            result.rawText = document.body.innerText;

            return result;
        });

        Object.assign(dashboardData, data);
        
    } catch (error) {
        console.error("❌ Failed to extract EPR Dashboard:", error.message);
    }

    return dashboardData;
}

module.exports = { extractEprDashboard };
