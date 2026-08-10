async function extractEprNewApplication(page) {
    console.log("🚀 Navigating to EPR New Application Data...");
    let applicationData = {
        part_a: {},
        part_b: {},
        part_c: {}
    };

    try {
        const url = 'https://epr.cpcb.gov.in/onboarding/pwp/recycler/new-application';
        
        // Listen to API responses to guarantee we get ALL user data even if it's hidden in the DOM
        const apiData = {};
        const responseHandler = async (response) => {
            const reqUrl = response.url();
            const resType = response.request().resourceType();
            if (reqUrl.includes('/api/v1/') && (resType === 'fetch' || resType === 'xhr') && response.status() === 200) {
                try {
                    const json = await response.json();
                    if (reqUrl.includes('user-details') && json.data && json.data.userDetails) {
                        apiData.userDetails = json.data.userDetails;
                    }
                    if (reqUrl.includes('get-units') && json.data && json.data.userPortalRole) {
                        apiData.unitDetails = json.data.userPortalRole[0];
                    }
                } catch (e) {}
            }
        };
        page.on('response', responseHandler);
        
        // Since navigating directly to "new-application" results in missing data,
        // we MUST navigate to the Applications list and click the Eye Icon.
        if (!page.url().includes('view') && !page.url().includes('edit') && !page.url().includes('new-application')) {
            console.log("Navigating to Applications List...");
            
            // Try to find the Applications button/link anywhere on the page and click it
            // We need to wait for it to render first!
            console.log("Waiting for 'All Applications' button to appear...");
            const clickedSidebar = await page.evaluate(async () => {
                // Poll for the button to appear (up to 10 seconds)
                for (let i = 0; i < 20; i++) {
                    const elements = Array.from(document.querySelectorAll('button.applicant-btn, button, a'));
                    const appBtn = elements.find(el => {
                        const text = el.innerText ? el.innerText.trim().toLowerCase() : '';
                        return (text === 'all application' || text === 'all applications');
                    });
                    
                    if (appBtn) {
                        const clickable = appBtn.closest('button, a') || appBtn;
                        clickable.click();
                        return true;
                    }
                    // wait 500ms
                    await new Promise(r => setTimeout(r, 500));
                }
                return false;
            });
            
            if (clickedSidebar) {
                console.log("✅ Clicked 'All Applications' button!");
                await page.waitForTimeout(3000); // wait for list to load
            } else {
                console.log("❌ Could not find 'All Applications' button!");
                // Try fallback URL (might be wrong for cement, but just in case)
                await page.goto('https://epr.cpcb.gov.in/onboarding/pwp/recycler/applications', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            }
            
            // Wait for the list table to load and the Eye icon to appear
            console.log("Waiting for Eye icon to appear on the applications list...");
            try {
                await page.waitForSelector('img[src*="eye.svg"]', { timeout: 30000 });
                console.log("Eye icon found! Clicking it to open the fully filled form...");
                await page.evaluate(() => {
                    const eyeIcon = document.querySelector('img[src*="eye.svg"]');
                    if (eyeIcon) {
                        const clickable = eyeIcon.closest('button, a') || eyeIcon;
                        clickable.click();
                    }
                });
                
                // Wait for the new application view to open
                await page.waitForTimeout(5000);
            } catch (e) {
                console.log("?? Could not find Eye icon. The table might be empty or loading too slowly.");
            }
        }
        
        // Ensure form fields are loaded before we try to extract
        try {
            await page.waitForSelector('label, mat-label, .form-group', { timeout: 10000 });
            
            // Wait for data to populate
            console.log("Waiting for data to populate on the UI...");
            await page.waitForFunction(() => {
                const inputs = Array.from(document.querySelectorAll('input[type="text"], select, .custom-input-wrapper, .form-control'));
                return inputs.some(input => {
                    if (input.tagName === 'SELECT') return input.value && input.value !== '';
                    if (input.tagName === 'INPUT') return input.value && input.value.trim().length > 0;
                    if (input.innerText) return input.innerText.trim().length > 0 && !input.innerText.includes('Select') && !input.innerText.includes('Enter');
                    return false;
                });
            }, { timeout: 20000 }).catch(e => console.log("?? Data didn't fully populate within timeout, proceeding anyway."));
            
        } catch (e) {
            console.log("?? Timeout waiting for form labels to render. The DOM might be empty.");
        }

        // Scroll to the bottom of the page to trigger any lazy loading
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 200;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight - window.innerHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Wait a bit more after scrolling
        await page.waitForTimeout(2000);
        
        page.off('response', responseHandler);

        console.log("dYs? Extracting Part A: Company & Registration Details...");
        
        let hasNext = true;
        let stepCount = 1;
        const maxSteps = 5;

        while (hasNext && stepCount <= maxSteps) {
            console.log(`Extracting Step ${stepCount}...`);
        
        // Dump the HTML for debugging
        const htmlDump = await page.content();
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, '..', '..', '..', 'data', 'new_application_debug_html.txt'), htmlDump);
        
        const { data: extracted, logs } = await page.evaluate(() => {
            const data = {};
            const logs = [];
            
            // Collect all possible containers that hold a label and a value
            const containers = document.querySelectorAll('mat-form-field, .form-group, .form-field, div[class*="col-"]');
            
            containers.forEach(container => {
                // 1. Find Label
                const labelElem = container.querySelector('label, mat-label, span.title, .mat-form-field-label');
                if (!labelElem) return;
                
                let rawLabel = labelElem.innerText;
                let labelText = rawLabel.replace('*', '').trim().toLowerCase();
                let key = labelText.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
                if (!key || key === 'select' || key === 'yes' || key === 'no') return;
                
                // 2. Find Value
                let val = '';
                let method = '';
                
                // Check Inputs / Textareas
                const input = container.querySelector('input, textarea');
                if (input) {
                    val = input.value || input.getAttribute('aria-valuenow') || input.getAttribute('value') || '';
                    if (val) method = 'input';
                }
                
                // Check Standard Selects (Native) FIRST to prevent wrapper text extraction
                if (!val) {
                    const select = container.querySelector('select');
                    if (select && select.options.length > 0 && select.selectedIndex >= 0) {
                        val = select.options[select.selectedIndex].text;
                        if (val.toLowerCase() === 'select') val = '';
                        if (val) method = 'standard-select';
                    }
                }
                
                // Check Angular Material Selects
                if (!val) {
                    // Target the specific element that holds the SELECTED value, not the wrapper
                    const selectValue = container.querySelector('.mat-select-value-text span, .mat-select-value, ng-select .ng-value-label');
                    if (selectValue) {
                        val = selectValue.innerText.trim();
                        if (val.toLowerCase() === 'select') val = '';
                        if (val) method = 'mat-select';
                    } else {
                        // Fallback for mat-select if value-text not found
                        const matSelect = container.querySelector('mat-select');
                        if (matSelect && matSelect.getAttribute('ng-reflect-model')) {
                            val = matSelect.getAttribute('ng-reflect-model');
                            method = 'mat-select-model';
                        }
                    }
                }
                
                // Fallback: Custom wrapper
                if (!val) {
                    const wrapper = container.querySelector('.input-wrapper, .custom-input-wrapper, .form-control');
                    if (wrapper) {
                        let text = wrapper.innerText.trim();
                        text = text.replace(/upload/i, '').trim();
                        if (text) {
                            val = text;
                            method = 'custom-wrapper';
                        }
                    }
                }
                
                // Fallback: Plain text div
                if (!val) {
                    let rawText = container.innerText || '';
                    rawText = rawText.replace(labelElem.innerText, '').trim();
                    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length > 0) {
                        val = lines[0];
                        method = 'plain-text';
                    }
                }
                
                // Clean up value
                val = val ? val.trim() : null;
                
                logs.push(`[DEBUG] Label: "${labelText}" -> Key: "${key}" -> Value: "${val}" (Method: ${method})`);
                
                // Only save if we don't already have a valid value or if the new one is better
                if (!(key in data) || (val && (!data[key] || String(data[key]).length < val.length))) {
                    data[key] = val;
                }
            });
            
            // --- TABLE EXTRACTION LOGIC ---
            const tables = document.querySelectorAll('table');
            tables.forEach((table, index) => {
                // Try to find a preceding heading for the table name
                let tableName = `table_${index + 1}`;
                let prev = table.previousElementSibling;
                while (prev && prev.tagName !== 'TABLE' && index < 5) { // search up a bit
                    if (prev.tagName.match(/^H[1-6]$/i) || prev.classList.contains('title') || prev.classList.contains('heading')) {
                        tableName = prev.innerText.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase();
                        break;
                    }
                    prev = prev.previousElementSibling;
                }
                
                const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map(th => {
                    return th.innerText.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase();
                });
                
                if (headers.length === 0) return; // skip if no headers
                
                const rows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
                const tableData = [];
                
                rows.forEach(row => {
                    const rowData = {};
                    const cells = Array.from(row.querySelectorAll('td'));
                    
                    let hasData = false;
                    cells.forEach((cell, i) => {
                        if (i >= headers.length) return;
                        const key = headers[i];
                        if (!key) return;
                        
                        let val = '';
                        
                        // Check inputs
                        const input = cell.querySelector('input, textarea');
                        if (input) val = input.value || input.getAttribute('value') || '';
                        
                        // Check native select
                        if (!val) {
                            const select = cell.querySelector('select');
                            if (select && select.options.length > 0 && select.selectedIndex >= 0) {
                                val = select.options[select.selectedIndex].text;
                            }
                        }
                        
                        // Check material select
                        if (!val) {
                            const selectValue = cell.querySelector('.mat-select-value-text span, .mat-select-value, ng-select .ng-value-label');
                            if (selectValue) val = selectValue.innerText.trim();
                        }
                        
                        // Plain text
                        if (!val) {
                            let text = cell.innerText.trim();
                            text = text.replace(/upload/i, '').trim();
                            if (text && text !== 'Browse' && text !== 'View') val = text;
                        }
                        
                        if (val && val.toLowerCase() !== 'select') {
                            rowData[key] = val;
                            hasData = true;
                        }
                    });
                    
                    if (hasData) {
                        tableData.push(rowData);
                    }
                });
                
                if (tableData.length > 0) {
                    data[tableName] = JSON.stringify(tableData);
                    logs.push(`[DEBUG] Extracted Table: "${tableName}" with ${tableData.length} rows.`);
                }
            });
            
            return { data, logs };
        });

        // Print the logs from the browser
        console.log(`\n--- UI EXTRACTION LOGS FOR STEP ${stepCount} ---`);
        logs.forEach(log => console.log(log));
        console.log(`----------------------------------------\n`);

        if (stepCount === 1) {
            Object.assign(applicationData.part_a, extracted);
        } else if (stepCount === 2) {
            Object.assign(applicationData.part_b, extracted);
        } else {
            Object.assign(applicationData.part_c, extracted);
        }
        console.log(`✅ Extracted ${Object.keys(extracted).length} fields from Step ${stepCount}.`);

        // Check for 'Save & Next' button and click it
        hasNext = await page.evaluate(async () => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const nextBtn = buttons.find(b => b.innerText.includes('Save & Next') || b.innerText.includes('Next') || b.innerText.includes('Save & Continue'));
            if (nextBtn && !nextBtn.disabled) {
                nextBtn.click();
                return true;
            }
            return false;
        });

        if (hasNext) {
            // Wait a moment for validation error toast to potentially appear
            await page.waitForTimeout(1500);
            
            // Check for validation error toast
            const hasError = await page.evaluate(() => {
                const toast = document.querySelector('.toast-message, .toast-error, #toast-container');
                if (toast && toast.innerText && (toast.innerText.includes('Missing') || toast.innerText.includes('required'))) return true;
                const req = Array.from(document.querySelectorAll('.text-danger, .error-message, mat-error')).find(el => el.innerText.includes('required'));
                if (req && req.offsetHeight > 0) return true;
                return false;
            });
            
            if (hasError) {
                console.log("?? Validation error detected! Form is missing required fields. Navigating to URL again to trigger auto-fill...");
                await page.goto('https://epr.cpcb.gov.in/onboarding/pwp/recycler/new-application', { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(5000);
                
                // Restart extraction from Step 1
                stepCount = 1;
                console.log("?? Restarting extraction after reload...");
                continue;
            }
            
            stepCount++;
            // Wait for next step to render
            await page.waitForTimeout(3000);
            
            // Wait for form labels to appear in the new step
            try {
                await page.waitForSelector('label, mat-label, .form-group', { timeout: 10000 });
            } catch (e) {}
            
            // Scroll again for the new step
            await page.evaluate(async () => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await page.waitForTimeout(1000);
        }
    }

    // Merge API data with DOM extracted data

        if (apiData.userDetails) {
            console.log("? UserDetails found in API data.");
            const ud = apiData.userDetails;
            if (ud.company) {
                if (!applicationData.part_a['legal_name_of_company']) applicationData.part_a['legal_name_of_company'] = ud.company.legalName;
                if (!applicationData.part_a['registered_address']) applicationData.part_a['registered_address'] = ud.company.address;
                if (!applicationData.part_a['type_of_business']) applicationData.part_a['type_of_business'] = ud.company.businessName || ud.company.businessType;
            }
            if (!applicationData.part_a['pan_number']) applicationData.part_a['pan_number'] = ud.panNumber;
            if (!applicationData.part_a['name']) applicationData.part_a['name'] = ud.name;
            if (!applicationData.part_a['designation']) applicationData.part_a['designation'] = ud.designation;
            if (!applicationData.part_a['mobile_number']) applicationData.part_a['mobile_number'] = ud.mobile;
            if (!applicationData.part_a['email_address']) applicationData.part_a['email_address'] = ud.email;
        } else {
            console.log("?? UserDetails NOT found in API data!");
        }
        
        if (apiData.unitDetails) {
            console.log("? UnitDetails found in API data.", JSON.stringify(apiData.unitDetails).substring(0, 200));
            const unit = apiData.unitDetails;
            if (unit.application) {
                if (!applicationData.part_a['state']) applicationData.part_a['state'] = unit.application.unitState?.state_name_en;
                if (!applicationData.part_a['district']) applicationData.part_a['district'] = unit.application.unitDistrict?.district_name_en;
                if (!applicationData.part_a['unit_gst']) applicationData.part_a['unit_gst'] = unit.application.unitGST;
                if (!applicationData.part_a['plant_unit_address']) applicationData.part_a['plant_unit_address'] = unit.portalUserUnitAddress;
                console.log("Mapped Plant Address to:", unit.portalUserUnitAddress);
            } else {
                console.log("?? unit.application is undefined!");
            }
        } else {
            console.log("?? UnitDetails NOT found in API data!");
        }

        console.log(`✅ Finished extracting all steps. Total fields: ${Object.keys(applicationData.part_a).length}`);

    } catch (error) {
        console.error("❌ Failed to extract New Application Data:", error.message);
    }

    return applicationData;
}

module.exports = { extractEprNewApplication };
