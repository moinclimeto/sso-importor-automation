import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { extractEprDashboard } = require('../src/extractors/epr/dashboard.extractor.cjs');
const { extractEprProfile } = require('../src/extractors/epr/profile.extractor.cjs');
const { extractEprApplication } = require('../src/extractors/epr/application.extractor.cjs');
const { extractEprMaterial } = require('../src/extractors/epr/material.extractor.cjs');
const { extractEprProduction } = require('../src/extractors/epr/production.extractor.cjs');
const { extractEprSales } = require('../src/extractors/epr/sales.extractor.cjs');
const { extractEprWallet } = require('../src/extractors/epr/wallet.extractor.cjs');
const { extractEprAnnualFiling } = require('../src/extractors/epr/annual_filing.extractor.cjs');
const { extractEprPaymentHistory } = require('../src/extractors/epr/payment.extractor.cjs');
const { extractEprNewApplication } = require('../src/extractors/epr/new_application.extractor.cjs');

async function runPostLoginNavigation(page, onLog) {
  const log = (msg) => {
    if (onLog) onLog(msg);
    else console.log(msg);
  };

  try {
    const url = page.url() || '';
    if (!url.includes('dashboard')) {
      log('Navigating to CPCB dashboard for scrape...');
      await page.goto('https://epr.cpcb.gov.in/dashboard', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(2000);
    }

    log("Clicking the first 'Open' button on Waste Category card...");
    const firstOpenBtn = page
      .locator('app-waste-category button')
      .filter({ hasText: /Open/i })
      .first();
    await firstOpenBtn.waitFor({ state: 'visible', timeout: 15000 });
    await firstOpenBtn.click();
    await page.waitForTimeout(1000);

    log("Selecting the 'PWP' application radio button...");
    try {
      const pwpRadioBtn = page.locator(
        'xpath=/html/body/app-root/div/app-dashboard/div/div/main/app-waste-category/app-modal-frame[1]/div/div[2]/div/div/form/div[1]/table/tbody/tr[2]/td[1]/div/input'
      );
      await pwpRadioBtn.waitFor({ state: 'visible', timeout: 3000 });
      await pwpRadioBtn.click();
    } catch {
      log('PWP radio not found by XPath, falling back to first radio...');
      const firstRadioBtn = page.locator('app-modal-frame input[type="radio"]').first();
      await firstRadioBtn.click();
    }
    await page.waitForTimeout(1000);

    log("Clicking the 'Proceed/Open' button in the modal...");
    const modalOpenBtn = page.locator('app-modal-frame app-button button').first();
    await modalOpenBtn.click();
    await page.waitForTimeout(3000);

    log("Checking if 'Select Unit' dropdown exists...");
    try {
      const selectUnitBtn = page.locator('button[title="Select Unit"]').first();
      await selectUnitBtn.waitFor({ state: 'visible', timeout: 8000 });
      await selectUnitBtn.click();
      await page.waitForTimeout(1500);

      const unitCard = page.locator('button.unit-card').first();
      await unitCard.waitFor({ state: 'visible', timeout: 5000 });
      await unitCard.click();
      await page.waitForTimeout(3000);
    } catch {
      log("No 'Select Unit' dropdown found — skipping unit selection.");
    }
  } catch (err) {
    log(`Post-login navigation warning: ${err.message}. Continuing with extractors...`);
  }
}

/**
 * Run all EPR extractors on an already-authenticated Playwright page.
 */
export async function runEprExtraction(page, { onLog } = {}) {
  const log = (msg) => {
    if (onLog) onLog(msg);
    else console.log(msg);
  };

  if (!page || page.isClosed()) {
    return { success: false, error: 'Browser page is not available for scraping' };
  }

  try {
    log('Starting EPR portal scrape...');
    await page.bringToFront().catch(() => {});
    await runPostLoginNavigation(page, log);

    const allData = {};
    const steps = [
      ['dashboard', extractEprDashboard],
      ['profile', extractEprProfile],
      ['application', extractEprApplication],
      ['material', extractEprMaterial],
      ['production', extractEprProduction],
      ['sales', extractEprSales],
      ['wallet', extractEprWallet],
      ['annualFiling', extractEprAnnualFiling],
      ['payment', extractEprPaymentHistory],
      ['newApplication', extractEprNewApplication],
    ];

    for (const [key, extractor] of steps) {
      log(`Extracting ${key}...`);
      allData[key] = await extractor(page);
    }

    log('Saving scraped data to database...');
    try {
      const { persistScrapedData } = require('../src/extractors/epr/scrapedDataPersist.cjs');
      await persistScrapedData({
        rootDir: path.join(__dirname, '..'),
        data: {
          new_application_data: allData.newApplication,
        },
      });
    } catch (err) {
      log(`Database save warning: ${err.message}`);
    }

    log('EPR portal scrape completed successfully.');
    return { success: true, data: allData };
  } catch (error) {
    log(`Scraper failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}
