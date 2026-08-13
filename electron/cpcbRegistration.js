import { chromium } from 'playwright';

let regBrowser = null;
let regContext = null;
let regPage = null;

const REGISTRATION_URL = 'https://epr.cpcb.gov.in/registration';

async function checkPortalError(page) {
  try {
    await page.waitForTimeout(500); // Wait for toast animation
    const overlay = page.locator('.overlay-container');
    if (await overlay.isVisible()) {
      const text = await overlay.innerText();
      if (text && text.trim().length > 0) {
        return text.trim().replace(/\n/g, ' '); // Return error text
      }
    }
  } catch (e) {}
  return null;
}

export async function startRegistrationFlow(data, onLog) {
  try {
    if (onLog) onLog('Starting registration flow...');
    
    // Launch browser
    regBrowser = await chromium.launch({ headless: false }); // Visible to user for transparency if needed
    regContext = await regBrowser.newContext();
    regPage = await regContext.newPage();
    
    if (onLog) onLog('Navigating to CPCB portal...');
    await regPage.goto(REGISTRATION_URL, { waitUntil: 'networkidle' });
    
    // Fill GST
    if (onLog) onLog('Entering GST Number...');
    const gstLocator = regPage.getByPlaceholder(/Enter Company GST Number/i);
    await gstLocator.fill('');
    await gstLocator.pressSequentially(data.gstin, { delay: 50 });
    await gstLocator.blur();
    
    // Click Verify
    await regPage.getByRole('button', { name: /Verify/i }).first().click();
    
    // Wait for verify success
    await regPage.waitForTimeout(2000);
    
    let portalErr = await checkPortalError(regPage);
    if (portalErr) throw new Error(portalErr);
    
    // Date of Establishment
    if (onLog) onLog('Entering Date of Establishment...');
    // Handling date inputs can be tricky, we'll try fill or type
    const doeLocator = regPage.locator('input[type="date"]').first();
    if (await doeLocator.isVisible()) {
        await doeLocator.fill(data.dateOfEstablishment); // Format YYYY-MM-DD
    } else {
        await regPage.getByPlaceholder(/dd-mm-yyyy/i).first().fill(data.dateOfEstablishment);
    }
    
    // Company Name (if not auto-filled)
    if (onLog) onLog('Entering Company Name...');
    const nameLocator = regPage.getByPlaceholder(/Enter Company Name/i);
    if (await nameLocator.isEditable()) {
      await nameLocator.fill(data.companyName);
    }
    
    // Authorize Person PAN
    if (onLog) onLog('Entering Authorize Person PAN...');
    const authPanLocator = regPage.getByPlaceholder(/Enter PAN Number/i);
    await authPanLocator.fill(''); // clear first
    await authPanLocator.pressSequentially(data.authPan, { delay: 50 });
    await authPanLocator.blur(); // Trigger validation
    
    // Authorised Person Name
    if (onLog) onLog('Entering Authorised Person Name...');
    const authNameLocator = regPage.getByPlaceholder(/Enter Name/i);
    await authNameLocator.fill('');
    await authNameLocator.pressSequentially(data.authName, { delay: 50 });
    await authNameLocator.blur();
    
    // Date of Birth
    if (onLog) onLog('Entering Date of Birth...');
    const dobLocator = regPage.locator('input[type="date"]').nth(1);
    if (await dobLocator.isVisible()) {
        await dobLocator.fill(data.authDob); // Format YYYY-MM-DD
    } else {
        await regPage.getByPlaceholder(/dd-mm-yyyy/i).nth(1).fill(data.authDob);
    }
    
    // Submit Auth Person
    if (onLog) onLog('Submitting User Verification...');
    await regPage.getByRole('button', { name: /Submit/i }).first().click();
    
    await regPage.waitForTimeout(2000);

    portalErr = await checkPortalError(regPage);
    if (portalErr) throw new Error(portalErr);

    // Email Address
    if (onLog) onLog('Entering Email Address...');
    const emailLocator = regPage.getByPlaceholder(/Enter Email Address/i);
    await emailLocator.fill('');
    await emailLocator.pressSequentially(data.email, { delay: 50 });
    await emailLocator.blur();
    
    // Click Get OTP
    if (onLog) onLog('Requesting Email OTP...');
    await regPage.getByText('Get OTP').first().click();
    await regPage.waitForTimeout(2000); // wait for otp to send
    
    // We will pause here and return to frontend to ask for Email OTP.
    if (onLog) onLog('Waiting for Email OTP from user...');
    
    return { success: true, step: 'WAITING_EMAIL_OTP' };
    
  } catch (err) {
    if (onLog) onLog('Error: ' + err.message);
    if (regBrowser) {
      await regBrowser.close();
      regBrowser = null;
    }
    return { success: false, error: err.message };
  }
}

export async function submitEmailOtp(otp, onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    
    if (onLog) onLog('Entering Email OTP...');
    const emailOtpLocator = regPage.getByPlaceholder(/Enter OTP/i).first();
    await emailOtpLocator.fill('');
    await emailOtpLocator.pressSequentially(otp, { delay: 50 });
    await emailOtpLocator.blur();
    
    // Click Verify for Email
    await regPage.getByRole('button', { name: /Verify/i }).nth(1).click();
    await regPage.waitForTimeout(2000); // wait for verify
    
    const portalErr = await checkPortalError(regPage);
    if (portalErr) throw new Error(portalErr);
    
    return { success: true, step: 'WAITING_MOBILE_OTP' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function resendEmailOtp(onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    if (onLog) onLog('Clicking Resend Email OTP...');
    await regPage.getByText('Resend OTP').first().click();
    await regPage.waitForTimeout(2000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function submitMobileOtp(mobile, otp, onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    
    // Fill Mobile
    if (onLog) onLog('Entering Mobile Number...');
    const mobileLocator = regPage.getByPlaceholder(/Enter Mobile Number/i);
    await mobileLocator.fill('');
    await mobileLocator.pressSequentially(mobile, { delay: 50 });
    await mobileLocator.blur();
    
    // Click Get OTP for Mobile (It might be the second 'Get OTP' button on the page)
    if (onLog) onLog('Requesting Mobile OTP...');
    const getOtpBtns = regPage.getByText('Get OTP');
    if (await getOtpBtns.count() > 1) {
      await getOtpBtns.nth(1).click();
    } else {
      await getOtpBtns.first().click();
    }
    
    await regPage.waitForTimeout(2000); // wait for otp to send
    
    if (onLog) onLog('Entering Mobile OTP...');
    const mobileOtpLocator = regPage.getByPlaceholder(/Enter OTP/i).nth(1);
    await mobileOtpLocator.fill('');
    await mobileOtpLocator.pressSequentially(otp, { delay: 50 });
    await mobileOtpLocator.blur();
    
    // Click Verify for Mobile
    await regPage.getByRole('button', { name: /Verify/i }).nth(2).click();
    await regPage.waitForTimeout(2000);
    
    const portalErr = await checkPortalError(regPage);
    if (portalErr) throw new Error(portalErr);
    
    // Continue
    if (onLog) onLog('Clicking Continue...');
    await regPage.getByRole('button', { name: /Continue/i }).click();
    
    // Close browser after success
    await regBrowser.close();
    regBrowser = null;
    
    return { success: true, step: 'COMPLETED' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function resendMobileOtp(onLog) {
  try {
    if (!regPage) throw new Error('Browser session not active');
    if (onLog) onLog('Clicking Resend Mobile OTP...');
    // It might be the second 'Resend OTP' link on the page
    const resendBtns = regPage.getByText('Resend OTP');
    if (await resendBtns.count() > 1) {
      await resendBtns.nth(1).click();
    } else {
      await resendBtns.first().click();
    }
    await regPage.waitForTimeout(2000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function closeRegistrationSession() {
  if (regBrowser) {
    await regBrowser.close();
    regBrowser = null;
  }
  return { success: true };
}
