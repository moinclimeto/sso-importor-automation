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

        console.log("🖱️ Waiting for 'Select Unit' dropdown to appear...");
        const selectUnitBtn = "xpath=//html/body/app-root/app-dashboard/div/div[2]/div[2]/app-onboard-dashboard/div/div[1]/app-breadcrumb/div/div[2]/button[1]";
        await page.waitForSelector(selectUnitBtn, { state: 'visible', timeout: 15000 });
        await page.click(selectUnitBtn);
        await page.waitForTimeout(1500);

        console.log("🖱️ Waiting for the specific unit card...");
        const unitCard = "xpath=//html/body/app-root/app-dashboard/div/div[1]/app-dashboard-topbar/app-common-modal/div/div[2]/div/div/div[2]/div/ul/li";
        await page.waitForSelector(unitCard, { state: 'visible', timeout: 10000 });
        await page.click(unitCard);
        await page.waitForTimeout(3000); // Wait for the dashboard to refresh with the selected unit's data

    } catch (e) {
        console.error("❌ Error during login or post-login clicks:", e.message);
        console.log("Let's try running extractors anyway...");
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
    
    allData.dashboard = await extractEprDashboard(page);
    saveJson('epr_dashboard.json', allData.dashboard);

    allData.profile = await extractEprProfile(page);
    saveJson('epr_profile.json', allData.profile);

    allData.application = await extractEprApplication(page);
    saveJson('epr_application.json', allData.application);

    allData.material = await extractEprMaterial(page);
    saveJson('epr_material.json', allData.material);

    // allData.production = await extractEprProduction(page);
    // saveJson('epr_production.json', allData.production);

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
    console.log("📂 JSON files are saved in the 'data' directory.");
    
    // Commenting out close so you can inspect the browser during development
    // await browser.close();
}

runScraper().catch(console.error);
