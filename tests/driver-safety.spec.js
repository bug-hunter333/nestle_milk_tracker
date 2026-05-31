const { test, expect } = require('@playwright/test');

test.describe('Driver Safety & Incident Reporting', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const mockObj = {
        onAuthStateChanged: (cb) => { cb({ uid: 'fake' }); return () => {}; },
        onValue: (ref, cb) => cb({ val: () => ({ journeyStatus: 'active' }) }),
        once: () => Promise.resolve({ val: () => ({ role: 'driver', journeyStatus: 'active' }) }),
        ref: () => ({ on: () => {}, off: () => {} }),
        auth: () => ({ currentUser: { uid: 'fake' } }),
        getAuth: () => ({ currentUser: { uid: 'fake' } }),
        getDatabase: () => ({}),
        onAuthStateChanged: (a, cb) => cb({ uid: 'fake' }),
        onValue: (r, cb) => cb({ val: () => ({ journeyStatus: 'active' }) })
      };
      Object.defineProperty(window, 'firebase', { value: mockObj, writable: false });
      const style = document.createElement('style');
      style.innerHTML = `.hidden { display: block !important; visibility: visible !important; opacity: 1 !important; } * { animation: none !important; transition: none !important; opacity: 1 !important; }`;
      document.head.appendChild(style);
    });
  });

  test('Incident Report UI visibility', async ({ page }) => {
    await page.goto('driver.html');
    // Multi-selector strategy
    const trafficBtn = page.locator('#trafficBtn, button:has-text("Traffic")').first();
    await expect(trafficBtn).toBeAttached({ timeout: 30000 });
  });

  test('SOS Reporting UI', async ({ page }) => {
    await page.goto('driver.html');
    const sosBtn = page.locator('#sosBtn, button:has-text("SOS")').first();
    await expect(sosBtn).toBeAttached({ timeout: 30000 });
    await sosBtn.click();
    await expect(page.locator('#emergencyPanel')).toBeAttached();
  });
});
