import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { extractEprProfile } = require("./src/extractors/epr/profile.extractor.cjs");
const { extractEprApplication } = require("./src/extractors/epr/application.extractor.cjs");
const { extractEprMaterial } = require("./src/extractors/epr/material.extractor.cjs");
const { extractEprProduction } = require("./src/extractors/epr/production.extractor.cjs");
const { extractEprSales } = require("./src/extractors/epr/sales.extractor.cjs");
const { extractEprWallet } = require("./src/extractors/epr/wallet.extractor.cjs");
const { extractEprAnnualFiling } = require("./src/extractors/epr/annual_filing.extractor.cjs");
const { extractEprDashboard } = require("./src/extractors/epr/dashboard.extractor.cjs");
const { extractEprPaymentHistory } = require("./src/extractors/epr/payment.extractor.cjs");

const memoryDataMap = {}; // Global store for synced data
const dataDir = path.join(__dirname, 'data');

// 🔥 OVERRIDE fs.writeFileSync globally to intercept all extractor JSON saves!
const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = (filePath, data, ...args) => {
    if (typeof filePath === 'string' && filePath.endsWith('.json') && filePath.includes('data')) {
        const filename = path.basename(filePath);
        console.log(`\n--- [SCRAPED DATA INTERCEPTED] ${filename} ---`);
        let parsed = data;
        try {
            parsed = typeof data === 'string' ? JSON.parse(data) : data;
            console.log(JSON.stringify(parsed, null, 2).substring(0, 500) + '... (truncated for console view)');
        } catch(e) {
            console.log(data.substring(0, 500) + '...');
        }
        memoryDataMap[filename] = parsed;
    } else {
        originalWriteFileSync(filePath, data, ...args);
    }
};

async function runScraper() {
    console.log("🚀 Starting Standalone EPR scraper...");
    
    // Use persistent context to save login session
    const userDataDir = path.join(__dirname, 'playwright_session');
    const context = await chromium.launchPersistentContext(userDataDir, { 
        headless: false,
        acceptDownloads: true 
    });
    
    // Playwright persistent context sometimes opens an empty tab first
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await page.bringToFront();

    console.log("Navigating to EPR Portal...");
    await page.goto('https://epr.cpcb.gov.in/login');
    
    console.log("⏳ Waiting for you to login... (Please login manually. Script will continue when URL changes from login)");
    
    // Wait until the URL changes from the login page, indicating a successful login
    try {
        await page.waitForURL('**/*dashboard*', { timeout: 300000 }); // 5 minutes to login
        console.log("🔓 Login detected! Proceeding with extraction...");

        console.log("🖱️ Clicking the first 'Open' button on Waste Category card...");
        const firstOpenBtn = page.locator('app-waste-category button').filter({ hasText: /Open/i }).first();
        await firstOpenBtn.waitFor({ state: 'visible', timeout: 15000 });
        await firstOpenBtn.click();
        await page.waitForTimeout(1000);

        console.log("🔘 Selecting the 'PWP' application radio button...");
        try {
            // Find the radio button explicitly by XPath (as requested by user)
            const pwpRadioBtn = page.locator('xpath=/html/body/app-root/div/app-dashboard/div/div/main/app-waste-category/app-modal-frame[1]/div/div[2]/div/div/form/div[1]/table/tbody/tr[2]/td[1]/div/input');
            await pwpRadioBtn.waitFor({ state: 'visible', timeout: 3000 });
            await pwpRadioBtn.click();
        } catch (e) {
            console.log("⚠️ PWP radio button not found by XPath, falling back to first radio button...");
            const firstRadioBtn = page.locator('app-modal-frame input[type="radio"]').first();
            await firstRadioBtn.click();
        }
        await page.waitForTimeout(1000);

        console.log("🖱️ Clicking the 'Proceed/Open' button in the modal...");
        const modalOpenBtn = page.locator('app-modal-frame app-button button').first();
        await modalOpenBtn.click();
        await page.waitForTimeout(3000);

        console.log("🖱️ Checking if 'Select Unit' dropdown exists...");
        try {
            const selectUnitBtn = page.locator('button[title="Select Unit"]').first();
            await selectUnitBtn.waitFor({ state: 'visible', timeout: 8000 });
            await selectUnitBtn.click();
            await page.waitForTimeout(1500);

            console.log("🖱️ Extracting Company Profile from unit card...");
            const unitCard = page.locator('button.unit-card').first();
            await unitCard.waitFor({ state: 'visible', timeout: 5000 });
            
            try {
                // Extract text from the unit card
                const cardText = await unitCard.innerText();
                // Find GST using Regex (15 alphanumeric characters)
                const gstMatch = cardText.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/i);
                const gstin = gstMatch ? gstMatch[0].toUpperCase() : '';
                
                // Assuming the company name is usually the very first line of the card text before 'Unit ID'
                const lines = cardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const companyName = lines.length > 0 ? lines[0] : '';
                
                if (gstin && companyName) {
                    const profileData = { company_name: companyName, gstin: gstin };
                    console.log("✅ Scraped Company Profile:", profileData);
                    
                    const dataDir = path.join(__dirname, 'data');
                    if (!fs.existsSync(dataDir)) {
                        fs.mkdirSync(dataDir, { recursive: true });
                    }
                    fs.writeFileSync(path.join(dataDir, 'epr_profile.json'), JSON.stringify(profileData, null, 2));
                }
            } catch (extErr) {
                console.log("⚠️ Could not extract profile from unit card:", extErr.message);
            }

            console.log("🖱️ Clicking the specific unit card...");
            await unitCard.click();
            await page.waitForTimeout(3000);
        } catch (e) {
            console.log("⏭️ No 'Select Unit' dropdown found (likely single-unit user). Skipping unit selection...");
        }

    } catch (e) {
        console.error("❌ Error during login or post-login clicks:", e.message);
        console.log("Let's try running extractors anyway...");
    }

    const allData = {};

    const saveJson = (filename, data) => {
        // Will be intercepted by our global fs.writeFileSync override
        fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
    };

    console.log("Running Extractors...");
    
    allData.dashboard = await extractEprDashboard(page);
    saveJson('epr_dashboard.json', allData.dashboard);

    allData.profile = await extractEprProfile(page);
    saveJson('epr_profile.json', allData.profile);

    allData.application = await extractEprApplication(page);
    saveJson('epr_application.json', allData.application);

    allData.material = await extractEprMaterial(page);
    saveJson('epr_material.json', allData.material);

    allData.production = await extractEprProduction(page);
    saveJson('epr_production.json', allData.production);

    allData.sales = await extractEprSales(page);
    saveJson('epr_sales.json', allData.sales);

    allData.wallet = await extractEprWallet(page);
    saveJson('epr_wallet.json', allData.wallet);

    allData.annualFiling = await extractEprAnnualFiling(page);
    saveJson('epr_annual_filing.json', allData.annualFiling);

    allData.payment = await extractEprPaymentHistory(page);
    saveJson('epr_payment.json', allData.payment);

    saveJson('scraped_data_latest.json', allData);

    console.log("✅ EPR Scraping completed successfully!");
    
    console.log("🚀 Auto-syncing JSON data to SQLite database...");
    try {
        const syncModule = await import('./sync_to_sqlite.js');
        if (syncModule.default) {
            await syncModule.default(memoryDataMap); // Pass in-memory data instead of reading from disk
        }
    } catch (e) {
        console.error("⚠️ Auto-sync to SQLite failed:", e.message);
    }
    
    // Commenting out close so you can inspect the browser during development
    // await browser.close();
}

runScraper().catch(console.error);
