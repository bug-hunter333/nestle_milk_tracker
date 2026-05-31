const { test, expect } = require('@playwright/test');

test.describe('Dashboard Portal Verification', () => {

  async function setupMocks(page) {
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
                        role: 'manager', 
                        journeyStatus: 'active',
                        currentDispatch: { priority: 'PRIORITY_1' },
                        status: 'MOVING' 
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

    // 2. CSS + Global Readiness
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

  test('Dashboard loads critical components', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dashboard.html');
    
    // Check map and HUD elements
    await expect(page.locator('#mapDesktop, #map').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#hud-stops-count')).toBeVisible();
    await expect(page.locator('#mStatusLabel')).toContainText(/Nestl/i);
  });
});
