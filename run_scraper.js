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

        console.log("🖱️ Clicking the first open button...");
        await page.click("xpath=//html/body/app-root/div/app-dashboard/div/div/main/app-waste-category/div/div/div[4]/div/div[2]/div[2]/button[1]");
        await page.waitForTimeout(1000);

        console.log("🔘 Selecting the radio button...");
        await page.click("xpath=//html/body/app-root/div/app-dashboard/div/div/main/app-waste-category/app-modal-frame[1]/div/div[2]/div/div/form/div[1]/table/tbody/tr/td[1]/div/input");
        await page.waitForTimeout(1000);

        console.log("🖱️ Clicking the second open button...");
        await page.click("xpath=//html/body/app-root/div/app-dashboard/div/div/main/app-waste-category/app-modal-frame[1]/div/div[2]/div/div/form/div[3]/app-button/div/button/p");
        await page.waitForTimeout(3000); // Give it a moment to load the next page

    } catch (e) {
        console.log("Timeout waiting for dashboard URL or clicking buttons. Let's try running extractors anyway...");
    }

    const allData = {};
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const saveJson = (filename, data) => {
        fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
    };

    console.log("Running Extractors...");
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

    saveJson('scraped_data_latest.json', allData);

    console.log("✅ EPR Scraping completed successfully!");
    console.log("📂 JSON files are saved in the 'data' directory.");
    
    // Commenting out close so you can inspect the browser during development
    // await browser.close();
}

runScraper().catch(console.error);
