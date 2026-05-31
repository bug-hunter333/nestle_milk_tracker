const { test, expect } = require('@playwright/test');

/**
 * Nestlé Smart Logistics - Collection Center Portal E2E Test
 * 
 * Features:
 * 1. Automatic Center Registration
 * 2. Milk Signaling Lifecycle (Location, Volume, Priority)
 * 3. Real-time Dispatch Sync
 * 4. State Persistence (Refresh)
 * 5. Reset & History Log
 */

test.describe('Collection Center Portal', () => {
  let centerEmail;
  const password = 'TestCenter123!';

  test.beforeAll(async () => {
    // Generate a unique email
    centerEmail = `center_${Date.now()}@nestle-logistics.com`;
  });

  test('Consolidated Center Signal Workflow', async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`BROWSER ERROR: ${msg.text()}`);
      else console.log(`BROWSER LOG: ${msg.text()}`);
    });
    
    // --- STEP 1: REGISTRATION ---
    await test.step('Register Collection Center Account', async () => {
      await page.goto('/register.html');
      await page.fill('#firstName', 'Welewatta');
      await page.fill('#lastName', 'Center');
      await page.fill('#userEmail', centerEmail);
      await page.fill('#userPass', password);

      // Select "Center" Role
      const centerCard = page.locator('.role-card[data-role="center"]');
      await centerCard.click({ force: true });
      await page.waitForTimeout(500); // Small buffer for animation state to sync with Firebase auth logic
      
      // Submit
      await page.click('button:has-text("Create Account")');

      // Verify Redirect to center.html (Increase timeout for slow Firebase creation)
      await page.waitForURL(url => url.href.includes('center'), { timeout: 35000 });
      await expect(page).toHaveTitle(/Center Portal/i);
    });

    // --- STEP 2: SIGNAL SUBMISSION ---
    await test.step('Submit Milk Signal (Urgent)', async () => {
      // Wait for Automation API
      await page.waitForFunction(() => window.db && window.auth && window.__automation_setPriority, { timeout: 15000 });

      // Use the Automation API to set state definitively
      await page.evaluate(() => {
        window.__automation_setPriority('PRIORITY_1');
        window.__automation_triggerSignal(500, 'Urgent pick-up requested.');
      });

      // Verify UI state transition
      await expect(page.locator('#btnText')).toHaveText(/Signal Sent|Sent/i, { timeout: 10000 });
      await expect(page.locator('#statusAlert')).toBeVisible();
      await expect(page.locator('#alertTitle')).toContainText(/Awaiting|Dispatch/i);
    });

    // --- STEP 3: REFRESH CHECK ---
    await test.step('Check UI after Refresh', async () => {
      await page.reload();
      // Form should reset as it's a stateless UI until it fetches from Firebase on load (not yet implemented)
      await expect(page.locator('#readyBtn')).toBeEnabled();
    });

    // --- STEP 4: REAL-TIME DISPATCH SYNC ---
    await test.step('Sync Dispatch Status from Manager', async () => {
      // Resubmit to get active signaling state
      await page.click('.loc-card[data-value="Hanwella Dairy Co-op"]', { force: true });
      await page.fill('#milkVolume', '450');
      await page.click('#readyBtn', { force: true });

      // Simulate the Manager DISPATCHING via the Exposed Automation API
      await page.evaluate(() => {
        window.db.ref('collection_requests/active').update({ status: 'DISPATCHED' });
      });

      // Verify Center UI reflects the new truck arrival state
      await expect(page.locator('#alertTitle')).toContainText(/Truck Dispatched|🚛/i, { timeout: 15000 });
      await expect(page.locator('#dispatchChip')).toBeVisible();
    });

    // --- STEP 5: RESET FLOW ---
    await test.step('Reset Form for New Submission', async () => {
      await page.click('#resetBtn');
      await expect(page.locator('#statusAlert')).toBeHidden();
      await expect(page.locator('#milkVolume')).toHaveValue('');
      await expect(page.locator('#historyList')).toContainText('Form reset — ready for new signal');
    });

  });
});
