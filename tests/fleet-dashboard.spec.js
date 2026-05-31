const { test, expect } = require('@playwright/test');

/**
 * Nestlé Smart Logistics - Fleet Dashboard E2E Test (Sequential)
 */

test.describe('Fleet Manager Dashboard', () => {
  let managerEmail;
  const managerPassword = 'TestPassword123!';

  test.beforeAll(async () => {
    managerEmail = `manager_${Date.now()}@nestle-logistics.com`;
  });

  test('Consolidated Dashboard Workflow', async ({ page }) => {
    // 1. REGISTER
    await test.step('Automatic Registration', async () => {
      await page.goto('/register.html');
      await page.fill('#firstName', 'Test');
      await page.fill('#lastName', 'Manager');
      await page.fill('#userEmail', managerEmail);
      await page.fill('#userPass', managerPassword);
      await page.click('.role-card[data-role="manager"]');
      await page.click('button:has-text("Create Account")');
      await page.waitForURL(url => url.href.includes('dashboard'), { timeout: 20000 });
      await expect(page).toHaveTitle(/Control Tower/i);
    });

    // 2. WAIT FOR API HANDSHAKE
    await test.step('Automation API Handshake', async () => {
      await page.waitForFunction(() => typeof window.ref === 'function' && window.db, { timeout: 15000 });
    });

    // 3. MONITOR SOS
    await test.step('SOS Emergency Monitoring', async () => {
      await page.evaluate(() => {
        window.update(window.ref(window.db, 'trips/trip_A'), {
          alert_status: 'ACCIDENT',
          status: 'MOVING',
          lat: 6.915, lng: 79.945
        });
      });
      const masterAlert = page.locator('#masterAlertPanel');
      await expect(masterAlert).toBeVisible({ timeout: 10000 });
      await expect(masterAlert).toContainText('🚨 SOS: VEHICLE ACCIDENT');
      
      await page.click('#dispatchBackupBtnD');
      await expect(page.locator('#toast')).toContainText(/Secondary Truck dispatched|Backup/i);
      
      await page.evaluate(() => {
        window.update(window.ref(window.db, 'trips/trip_A'), { alert_status: 'NORMAL' });
      });
    });

    // 4. PRIORITY DISPATCH
    await test.step('Priority Dispatch Handling', async () => {
      await page.evaluate(() => {
        window.set(window.ref(window.db, 'collection_requests/active'), {
          center_name: 'APIIT Sri Lanka',
          volume: 450,
          priority: 'PRIORITY_1',
          status: 'PENDING_DISPATCH',
          timestamp: Date.now()
        });
      });
      const requestCard = page.locator('#centerRequestCardD');
      await expect(requestCard).toBeVisible({ timeout: 10000 });
      await page.click('#dispatchCenterBtnD');
      await expect(requestCard).toBeHidden();
      await expect(page.locator('#destTextD')).toHaveText('APIIT Sri Lanka');
    });

    // 5. LEDGER ARCHIVE
    await test.step('Digital Ledger Archiving', async () => {
      await page.evaluate(() => {
        window.update(window.ref(window.db, 'trips/trip_A'), {
          status: 'COLLECTED',
          destination: 'Kaduwela Rural Farm',
          volume: 250, milk_temp: '3.8',
          driver_name: 'Test Driver'
        });
      });
      await expect(page.locator('#verifySectionD')).toBeVisible({ timeout: 10000 });
      await page.click('#archiveBtnD');
      await expect(page.locator('#ledgerBodyD')).toContainText('Kaduwela Rural Farm');
      await expect(page.locator('#statusTextD')).toHaveText('Idle');
    });
  });
});
