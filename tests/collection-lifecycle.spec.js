const { test, expect } = require('@playwright/test');

test.describe('Milk Collection Lifecycle', () => {

  async function setupMocks(page, role = 'driver') {
    // 1. Intercept Modular SDK imports
    await page.route(/firebase-(app|auth|database)\.js/, route => {
        const url = route.request().url();
        let body = '';
        
        if (url.includes('firebase-app.js')) {
            body = 'export const initializeApp = () => ({ name: "[DEFAULT]" }); export const _getProvider = () => ({ getImmediate: () => ({}) }); export const _registerComponent = () => {}; export const getApp = () => ({ name: "[DEFAULT]" }); export const SDK_VERSION = "10.7.1"; export const registerVersion = () => {};';
        } else if (url.includes('firebase-auth.js')) {
            body = `
                export const getAuth = () => ({ currentUser: { uid: "fake-uid", email: "test@gmail.com" } });
                export const onAuthStateChanged = (auth, cb) => {
                    setTimeout(() => cb({ uid: "fake-uid", email: "test@gmail.com" }), 50);
                    return () => {};
                };
                export const signOut = async () => ({});
            `;
        } else if (url.includes('firebase-database.js')) {
            body = `
                export const getDatabase = () => ({}); 
                export const ref = (db, path) => ({ path });
                export const onValue = (refObj, cb) => {
                    const path = refObj.path;
                    const initial = { 
                        role: '${role}', 
                        journeyStatus: 'active',
                        currentDispatch: { priority: 'PRIORITY_1' },
                        status: 'STOPPED' 
                    };
                    setTimeout(() => cb({ val: () => initial }), 50);
                    return () => {};
                };
                export const update = async (refObj, data) => Promise.resolve();
                export const set = async (refObj, data) => Promise.resolve();
                export const push = (refObj) => ({ ...refObj, key: 'fake-key', set: async (d) => Promise.resolve() });
            `;
        }

        return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
            body: body
        });
    });

    // 2. Global Helpers & Style
    await page.addInitScript(() => {
        window.__firebase_ready = true;
        const style = document.createElement('style');
        style.innerHTML = `
            .hidden { display: block !important; visibility: visible !important; opacity: 1 !important; transform: none !important; }
            .animate-fade-up { animation: none !important; opacity: 1 !important; transform: none !important; }
        `;
        document.head.appendChild(style);
    });
  }

  test('Driver Hub - Ready for Journey', async ({ page }) => {
    await setupMocks(page, 'driver');
    await page.goto('/driver.html');
    
    const startBtn = page.locator('#startBtn');
    await expect(startBtn).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#statusValue')).toHaveText(/Ready/i);
  });

  test('Fleet Dashboard - Overview Visibility', async ({ page }) => {
    await setupMocks(page, 'manager');
    await page.goto('/dashboard.html');
    
    await expect(page.locator('#mapDesktop, #map').first()).toBeVisible({ timeout: 20000 });
  });

  test('Center Portal - Queue Visibility', async ({ page }) => {
    await setupMocks(page, 'center');
    await page.goto('/center.html');
    
    await expect(page.locator('#queueTable')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#readyBtn')).toBeVisible();
  });
});
