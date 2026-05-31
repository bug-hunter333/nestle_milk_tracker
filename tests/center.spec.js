const { test, expect } = require('@playwright/test');

test.describe('Center Portal Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const mockObj = {
        onAuthStateChanged: (cb) => { cb({ uid: 'fake' }); return () => {}; },
        onValue: (ref, cb) => cb({ val: () => ({ status: 'ready' }) }),
        once: () => Promise.resolve({ val: () => ({ role: 'center' }) }),
        ref: () => ({ on: () => {}, off: () => {} }),
        auth: () => ({ currentUser: { uid: 'fake' } }),
        getAuth: () => ({ currentUser: { uid: 'fake' } }),
        getDatabase: () => ({}),
        onAuthStateChanged: (a, cb) => cb({ uid: 'fake' }),
        onValue: (r, cb) => cb({ val: () => ({ status: 'ready' }) })
      };
      Object.defineProperty(window, 'firebase', { value: mockObj, writable: false });
      const style = document.createElement('style');
      style.innerHTML = `.hidden { display: block !important; visibility: visible !important; opacity: 1 !important; } * { animation: none !important; transition: none !important; }`;
      document.head.appendChild(style);
    });
  });

  test('Center Portal loads critical components', async ({ page }) => {
    await page.goto('center.html');
    await expect(page.locator('#readyBtn, button:has-text("Ready")').first()).toBeAttached({ timeout: 15000 });
  });
});
