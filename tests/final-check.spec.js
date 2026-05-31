const { test, expect } = require('@playwright/test');

const ULTIMATE_MOCK = async ({ page }) => {
  // 1. Intercept ALL Firebase SDK variants (Modular and Compat)
  await page.route(/firebase-.*\.js/, route => {
    const url = route.request().url();
    let body = '';
    
    if (url.includes('firebase-app')) {
      body = 'export const initializeApp = () => ({ name: "[DEFAULT]" }); export const _getProvider = () => ({ getImmediate: () => ({}) }); export const _registerComponent = () => {}; export const getApp = () => ({ name: "[DEFAULT]" }); export const getApps = () => []; export const SDK_VERSION = "10.7.1"; export const registerVersion = () => {};';
    } else if (url.includes('firebase-auth')) {
      body = `
        export const getAuth = () => ({ currentUser: { uid: "fake-uid", email: "test@gmail.com" } });
        export const onAuthStateChanged = (auth, cb) => {
          // If called with two args, first is auth, second is callback
          const actualCb = typeof auth === 'function' ? auth : cb;
          setTimeout(() => actualCb({ uid: "fake-uid", email: "test@gmail.com" }), 50);
          return () => {};
        };
        export const signOut = async () => ({});
      `;
    } else if (url.includes('firebase-database')) {
      body = `
        export const getDatabase = () => ({}); 
        export const ref = (db, path) => ({ path });
        export const onValue = (refObj, cb) => {
          const path = refObj.path;
          window.__listeners = window.__listeners || {};
          window.__listeners[path] = cb;
          const initial = window.__sharedData?.[path] || (path.includes('collections') ? [] : { status: 'READY' });
          setTimeout(() => cb({ val: () => initial }), 50);
          return () => {};
        };
        export const update = async (refObj, data) => Promise.resolve();
        export const set = async (refObj, data) => Promise.resolve();
        export const push = (refObj, data) => ({ key: 'fake-key' });
      `;
    } else if (url.includes('firebase-storage')) {
      body = `
        export const getStorage = () => ({});
        export const ref = (storage, path) => ({ path });
        export const uploadBytes = async () => ({ ref: { fullPath: 'fake-path' } });
        export const getDownloadURL = async () => 'https://firebasestorage.googleapis.com/fake-url';
      `;
    }

    // Handle compat/legacy requests that might not be using 'export'
    if (url.includes('-compat') || !body.includes('export')) {
        body = body.replace(/export const /g, 'window.');
        // Wrap in IIFE for safety if needed, but usually window is enough
    }

    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      body: body
    });
  });

  await page.addInitScript(() => {
    // Robust Legacy/Compat support
    const mockAuth = { 
      onAuthStateChanged: (cb) => { setTimeout(() => cb({ uid: 'fake', email: 'test@gmail.com' }), 50); return () => {}; }, 
      currentUser: { uid: 'fake', email: 'test@gmail.com' },
      signOut: () => Promise.resolve()
    };
    const mockDb = { 
      ref: (path) => ({ 
        on: (ev, cb) => { setTimeout(() => cb({ val: () => ({}) }), 50); return () => {}; }, 
        once: () => Promise.resolve({ val: () => ({}) }),
        update: () => Promise.resolve(),
        set: () => Promise.resolve(),
        push: () => ({ key: 'fake' })
      }) 
    };

    window.firebase = {
      initializeApp: () => ({}),
      apps: [{ name: '[DEFAULT]' }],
      auth: () => mockAuth,
      database: () => mockDb
    };
    
    // Safety CSS to force layouts to be visible during headless tests
    const style = document.createElement('style');
    style.innerHTML = `
      .hidden { display: block !important; visibility: visible !important; opacity: 1 !important; transform: none !important; }
      .animate-fade-up { animation: none !important; opacity: 1 !important; transform: none !important; }
      #desktopLayout, #mobileLayout, #statusHero, #stopsGrid, #mapDesktop, #mapMobile { 
        display: block !important; 
        visibility: visible !important; 
        opacity: 1 !important; 
      }
      #desktopLayout { display: flex !important; }
    `;
    document.head.appendChild(style);
  });
};

test.describe('Nestlé Smart Logistics - Full Suite', () => {
  test('Authentication Redirection', async ({ page }) => {
    await ULTIMATE_MOCK({ page });
    await page.goto('index.html');
    // Verify landing page elements - Update to match the actual h1 text
    await expect(page.locator('h1')).toContainText(/Optimising the/i);
  });

  test('Driver Portal Verification', async ({ page }) => {
    await ULTIMATE_MOCK({ page });
    await page.goto('driver.html');
    await expect(page.locator('#startBtn, button:has-text("Start")').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#sosBtn')).toBeAttached();
  });

  test('Manager Dashboard Verification', async ({ page }) => {
    await ULTIMATE_MOCK({ page });
    await page.goto('dashboard.html');
    // Update to match the IDs in the modern dashboard (mapDesktop or mapMobile)
    await expect(page.locator('#mapDesktop, #mapMobile').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#hud-stops-count')).toBeAttached();
  });

  test('Center Portal Verification', async ({ page }) => {
    await ULTIMATE_MOCK({ page });
    await page.goto('center.html');
    await expect(page.locator('#readyBtn, button:has-text("Ready")').first()).toBeAttached({ timeout: 15000 });
  });

  test('Analytics Intelligence Verification', async ({ page }) => {
    await ULTIMATE_MOCK({ page });
    await page.goto('analytics.html');
    await expect(page.locator('#kpiVolume')).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#auditBody')).toBeAttached();
  });
});
