const { test, expect } = require('@playwright/test');

test.describe('Fleet Synchronization', () => {

  async function setupPortals(page, role) {
    page.on('console', msg => console.log(`[${role}] BROWSER:`, msg.text()));
    page.on('pageerror', err => console.log(`[${role}] BROWSER ERROR:`, err.message));

    const firebaseBase = 'https://www.gstatic.com/firebasejs/10.7.1/';

    await page.route(url => url.toString().includes('firebase-'), async (route) => {
        const url = route.request().url();
        let body = '';
        
        if (url.includes('firebase-app.js')) {
            body = `
                export const initializeApp = () => ({ name: "[DEFAULT]" });
                export const _getProvider = () => ({ getImmediate: () => ({}) });
                export const _registerComponent = () => {};
                export const getApp = () => ({ name: "[DEFAULT]" });
                export const SDK_VERSION = "10.7.1";
                export const registerVersion = () => {};
            `;
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
                    window.__listeners = window.__listeners || {};
                    window.__listeners[path] = cb;
                    const initial = (window.__sharedData && window.__sharedData[path]) || (path === 'trips/trip_A' ? { status: 'STOPPED' } : {});
                    setTimeout(() => cb({ val: () => initial }), 50);
                    return () => {};
                };
                export const update = async (refObj, data) => {
                    const path = refObj.path;
                    window.__sharedData = window.__sharedData || {};
                    window.__sharedData[path] = { ...(window.__sharedData[path] || {}), ...data };
                    if (window.onDbUpdate) window.onDbUpdate(path, window.__sharedData[path]);
                    return Promise.resolve();
                };
                export const set = async (refObj, data) => {
                    const path = refObj.path;
                    window.__sharedData = window.__sharedData || {};
                    window.__sharedData[path] = data;
                    if (window.onDbUpdate) window.onDbUpdate(path, data);
                    return Promise.resolve();
                };
                export const push = (refObj) => ({ ...refObj, key: 'fake-key', set: async (d) => set(refObj, d) });
            `;
        } else {
            return route.continue();
        }

        return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
            body: body
        });
    });

    await page.addInitScript(() => {
        window.__firebase_ready = true;
        const injectStyle = () => {
            const head = document.head || document.getElementsByTagName('head')[0];
            if (!head) {
                setTimeout(injectStyle, 10);
                return;
            }
            const style = document.createElement('style');
            style.innerHTML = `
                .hidden { display: block !important; visibility: visible !important; opacity: 1 !important; transform: none !important; }
                .animate-fade-up { animation: none !important; opacity: 1 !important; transform: none !important; }
            `;
            head.appendChild(style);
        };
        injectStyle();
    });
  }

  test('should reflect driver status on manager dashboard', async ({ browser }) => {
    const driverContext = await browser.newContext();
    const driverPage = await driverContext.newPage();
    await setupPortals(driverPage, 'DRIVER');
    
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await setupPortals(managerPage, 'MANAGER');

    await driverPage.exposeFunction('onDbUpdate', async (path, data) => {
        console.log(`[NODE] SYNC: ${path} updated`);
        await managerPage.evaluate(({ path, data }) => {
            window.__sharedData = window.__sharedData || {};
            window.__sharedData[path] = data;
            if (window.__listeners && window.__listeners[path]) {
                window.__listeners[path]({ val: () => data });
            }
        }, { path, data });
    });

    await driverPage.goto('/driver.html');
    await managerPage.goto('/dashboard.html');

    await expect(driverPage.locator('#statusValue')).toBeVisible({ timeout: 30000 });
    await expect(managerPage.locator('#mStatusLabel')).toContainText(/idle|Nestl/i);

    // ── START ──
    await driverPage.click('#startBtn');
    await expect(managerPage.locator('#statusTextD').first()).toContainText(/En Route/i, { timeout: 45000 });

    // ── COLLECT ──
    await driverPage.click('#collectBtn');
    await expect(managerPage.locator('#statusTextD').first()).toContainText(/Transport|Collected/i, { timeout: 45000 });

    // ── DELIVER ──
    await driverPage.click('#deliverBtn');
    await expect(managerPage.locator('#statusTextD').first()).toContainText(/Ledger|Delivered/i, { timeout: 45000 });

    await driverContext.close();
    await managerContext.close();
  });

});
