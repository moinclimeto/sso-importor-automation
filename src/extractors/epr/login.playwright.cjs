const { chromium } = require('playwright');
const path = require('path');

async function loginEpr(username, password) {
    console.log("🚀 Starting Playwright for EPR Login with Persistent Session...");
    
    // Directory to save browser session (cookies, local storage, etc.)
    const userDataDir = path.join(process.cwd(), 'playwright_data');

    // Launch persistent browser context
    // Set headless: false so you can see the browser and solve the Captcha manually if needed
    const context = await chromium.launchPersistentContext(userDataDir, { 
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'] // Helps avoid basic bot detection
    }); 
    
    // In persistent contexts, there's usually a default page already open
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        console.log("🌐 Navigating to https://epr.cpcb.gov.in/login ...");
        await page.goto('https://epr.cpcb.gov.in/login', { waitUntil: 'networkidle' });

        // Check if we are already logged in by looking at the URL or a specific element
        if (page.url().includes('dashboard')) {
            console.log("✅ Already logged in (session restored)! Reached dashboard.");
        } else {
            if (username && password) {
                console.log("🔑 Filling credentials...");
                await page.locator('input[type="text"], input[formcontrolname="userName"], input[name="username"]').first().fill(username);
                await page.locator('input[type="password"], input[formcontrolname="password"], input[name="password"]').first().fill(password);
                
                console.log("⏳ Please solve the Captcha and click Login. Waiting for dashboard to load...");
            } else {
                console.log("⏳ Waiting for manual login (Username, Password, Captcha)....");
            }

            // We wait for the URL to change to something like dashboard.
            await page.waitForURL('**/dashboard**', { timeout: 0 }); 
            console.log("✅ Login successful, session is saved! Reached dashboard.");
        }

        // ============================================
        // Post-Login Actions (Clicking required buttons)
        // ============================================
        console.log("🖱️ Checking for 'Continue' button...");
        try {
            // Target the button that contains the <p> Continue </p> text
            const continueBtn = page.locator('button:has-text("Continue")').first();
            // Wait for it to be visible (max 5 seconds) before clicking
            await continueBtn.waitFor({ state: 'visible', timeout: 5000 });
            await continueBtn.click({ force: true });
            console.log("✅ Clicked '<button><p> Continue </p></button>'.");
        } catch (e) {
            console.log("⚠️ 'Continue' button not found (might not be required on restored session). Proceeding...");
        }

        console.log("⏳ Waiting for '<button> Open </button>' on dashboard...");
        // Match a visible button that contains the text 'Open'
        const firstOpenBtn = page.locator('button:has-text("Open") >> visible=true').first();
        
        // Explicitly wait for it to be visible
        await firstOpenBtn.waitFor({ state: 'visible', timeout: 15000 });
        
        console.log("🖱️ Clicking first '<button> Open </button>'...");
        await firstOpenBtn.click();
        
        console.log("⏳ Waiting for 'Applicant Type' radio button in the modal...");
        // Locator for the radio button provided by the user
        const radioBtn = page.locator('input[type="radio"][formcontrolname="type"]').first();
        await radioBtn.waitFor({ state: 'visible', timeout: 15000 });

        console.log("🖱️ Clicking Radio button (Applicant Type)...");
        // Use force: true in case the radio button is visually hidden or overlaid by a label
        await radioBtn.click({ force: true });
        
        // Modal has an "Open" button at the bottom too. We'll click it.
        console.log("⏳ Waiting for the second '<button> Open </button>' in the modal...");
        // Get the last visible Open button (which is likely the one in the modal)
        const secondOpenBtn = page.locator('button:has-text("Open") >> visible=true').last();
        await secondOpenBtn.waitFor({ state: 'visible', timeout: 5000 });
        
        console.log("🖱️ Clicking second '<button> Open </button>' inside the modal...");
        await secondOpenBtn.click();
        
        console.log("✅ Successfully reached the target page!");

        // Return the page and context so we can use them for further scraping
        return { context, page };

    } catch (error) {
        console.error("❌ Failed during EPR Login:", error.message);
        await context.close();
        throw error;
    }
}

// If this file is run directly from the terminal (e.g. node login.playwright.cjs),
// it will execute the function automatically for testing.
if (require.main === module) {
    // Calling with empty username and password so you can enter them manually
    loginEpr("", "").catch(console.error);
}

module.exports = { loginEpr };
