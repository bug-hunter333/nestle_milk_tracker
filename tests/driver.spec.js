const { test, expect } = require('@playwright/test');

/**
 * Nestlé Smart Logistics - Driver Workflow E2E Test
 * 
 * This test simulates a full journey:
 * 1. Login
 * 2. Start Journey
 * 3. Milk Collection
 * 4. Delivery Handover
 * 5. Reset for Next Trip
 */

test.describe('Driver Workflow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the login page
    await page.goto('/login.html');
    
    // Check if we are using environment variables
    const email = process.env.TEST_DRIVER_EMAIL;
    const password = process.env.TEST_DRIVER_PASSWORD;

    if (email && password) {
      await page.fill('#userEmail', email);
      await page.fill('#userPass', password);
      await page.click('button:has-text("Sign In")');
      
      // Wait for navigation after Firebase auth (flexible for .html or clean URLs)
      await page.waitForURL(url => url.href.includes('driver'), { timeout: 15000 });
    } else {
      // Fallback: Just navigate to driver.html for UI testing if credentials are missing
      await page.goto('/driver.html');
    }
  });

  test('should complete a full collection cycle', async ({ page }) => {
    // 1. Verify Initial State (Idle status inside the Hero)
    await expect(page.locator('#statusValue')).toHaveText('Ready to Depart');
    await expect(page.locator('#indicatorText')).toHaveText('Idle');
    const startBtn = page.locator('#startBtn');
    await expect(startBtn).toBeVisible();

    // 2. Start Journey
    await startBtn.click();
    await expect(page.locator('#statusValue')).toContainText(/Moving|En Route|Ready/i);
    await expect(page.locator('#collectBtn')).toBeVisible();

    // 3. Simulate Milk Collection
    await page.click('#collectBtn');
    
    // Verify Phase 2 transition (Transport Mode)
    await expect(page.locator('#statusValue')).toContainText('Transporting');
    await expect(page.locator('#transportBanner')).toBeVisible();
    await expect(page.locator('#deliverBtn')).toBeVisible();
    
    // Verify Priority Banner is handled (if it was visible)
    await expect(page.locator('#priorityBanner')).not.toBeVisible();

    // 4. Confirm Delivery to Nestlé
    await page.click('#deliverBtn');
    
    // Verify Progress indicators update
    await expect(page.locator('#statusValue')).toContainText('Delivered');
    
    // 5. Verify "Start Next Trip" Modal Appearance
    // We added a 1.2s delay in the code, so we wait for visibility
    const nextTripModal = page.locator('#deliverySuccessModal');
    await expect(nextTripModal).toBeVisible({ timeout: 10000 });
    
    const nextTripBtn = page.locator('#nextTripBtn');
    await expect(nextTripBtn).toBeVisible();

    // 6. Start Next Trip (Triggers Reset)
    // This will reload the page, so we expect the status to eventually return to 'Idle'
    await nextTripBtn.click();
    await page.waitForLoadState('load');
    await expect(page.locator('#statusValue')).toContainText(/Ready to Depart|Idle/i);
  });

  test('should handle SOS emergency reporting', async ({ page }) => {
    // Ensure we are on the dashboard
    await expect(page.locator('#statusValue')).toBeVisible();

    // The SOS button is hidden initially, shows after journey starts
    await page.click('#startBtn');
    
    const sosBtn = page.locator('#sosBtn');
    await expect(sosBtn).toBeVisible();

    // Click SOS
    await sosBtn.click();
    
    // Confirm SOS in the modal
    await page.click('#confirmSosBtn');
    
    // Verify Emergency Panel visibility
    const emergencyPanel = page.locator('#emergencyPanel');
    await expect(emergencyPanel).toBeVisible();
    await expect(emergencyPanel).toContainText(/SOS Sent|Help is Coming/i);
  });

});
