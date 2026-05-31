import { test, expect } from '@playwright/test';

// MOCK STRATEGY: Intercept Firebase SDK and provide a local state-driven mock
const QA_MOCK = async ({ page }) => {
  await page.route('https://www.gstatic.com/firebasejs/**', async (route) => {
    const url = route.request().url();
    let body = '';
    
    if (url.includes('firebase-app.js')) {
      body = 'export const initializeApp = () => ({});';
    } else if (url.includes('firebase-database.js')) {
      body = 'export const getDatabase = () => ({});' +
             'export const ref = (db, path) => path;' +
             'export const onValue = (path, cb) => { ' +
             '  const parts = path.split("/"); ' +
             '  let data = window.__db_data; ' +
             '  for (const p of parts) { if (data) data = data[p]; } ' +
             '  cb({ ' +
             '    val: () => data || null, ' +
             '    exists: () => data !== undefined && data !== null ' +
             '  }); ' +
             '  return () => {}; ' +
             '};' +
             'export const push = (path, data) => { ' +
             '  if (path.includes("messages")) { ' +
             '    const chatId = path.split("/")[1]; ' +
             '    if (!window.__db_data.chats[chatId]) window.__db_data.chats[chatId] = { messages: {} }; ' +
             '    const key = "msg_" + Date.now(); ' +
             '    window.__db_data.chats[chatId].messages[key] = { ...data, _key: key }; ' +
             '  } ' +
             '  return Promise.resolve({ key: "mock-key" }); ' +
             '};' +
             'export const update = (path, data) => Promise.resolve();' +
             'export const set = (path, data) => Promise.resolve();' +
             'export const remove = (path) => Promise.resolve();';
    } else if (url.includes('firebase-auth.js')) {
      body = 'export const getAuth = () => ({});' +
             'export const onAuthStateChanged = (auth, cb) => cb({ uid: "driver-123", email: "driver@nestle.com" });' +
             'export const signOut = () => Promise.resolve();' +
             'export const signInAnonymously = () => Promise.resolve({ user: { uid: "anon-123" } });';
    } else if (url.includes('firebase-storage.js')) {
      body = 'export const getStorage = () => ({});' +
             'export const ref = (storage, path) => path;' +
             'export const uploadString = () => Promise.resolve({ ref: "mock-ref" });' +
             'export const getDownloadURL = () => Promise.resolve("https://example.com/mock-image.png");';
    } else if (url.includes('firebase-messaging.js')) {
      body = 'export const getMessaging = () => ({});' +
             'export const getToken = () => Promise.resolve("mock-token");' +
             'export const onMessage = () => {};' +
             'export const isSupported = () => Promise.resolve(true);';
    } else {
      body = 'export default {};';
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: body
    });
  });

  // Inject initial DB state
  await page.addInitScript(() => {
    window.__db_data = {
      locations: {
        apiit: { id: 'apiit', name: 'APIIT Sri Lanka', status: 'READY', expected: 100, nestleHubId: 'nestle_peliyagoda' }
      },
      chats: {}
    };
    window.__QA_AUTO_CONFIRM = true;

    // NAMESPACED MOCK (for dashboard.html)
    const mockDb = {
      ref: (path) => ({
        update: (data) => Promise.resolve(),
        remove: () => Promise.resolve(),
        set: (data) => Promise.resolve(),
        push: (data) => Promise.resolve({ key: "mock-key" }),
        once: (type) => {
          const parts = path.split("/");
          let data = window.__db_data;
          for (const p of parts) { if (data) data = data[p]; }
          return Promise.resolve({
            val: () => data || null,
            exists: () => data !== undefined && data !== null
          });
        },
        off: () => {},
        on: (type, cb) => {
          const parts = path.split("/");
          let data = window.__db_data;
          for (const p of parts) { if (data) data = data[p]; }
          cb({
            val: () => data || null,
            exists: () => data !== undefined && data !== null
          });
        }
      })
    };
    window.firebase = {
      apps: [{ name: '[DEFAULT]' }],
      initializeApp: () => ({}),
      database: () => mockDb,
      auth: () => ({
        onAuthStateChanged: (cb) => cb({ uid: "manager-123", email: "manager@nestle.com" }),
        signOut: () => Promise.resolve(),
        signInAnonymously: () => Promise.resolve()
      }),
      messaging: () => ({
        onMessage: () => {},
        getToken: () => Promise.resolve("mock-token")
      })
    };
  });
};

test.describe('Automated QA - Driver Core Features', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    await QA_MOCK({ page });
    await page.goto('/driver.html');
    // Wait for the app and chat system to be fully ready
    await page.waitForFunction(() => window.__chat_initialized === true, { timeout: 15000 });
    await page.waitForSelector('#driverChatFab', { state: 'visible' });
  });

  test('should verify Chat and Incident Panel accessibility', async ({ page }) => {
    // 1. Verify Chat Opening
    await page.click('#driverChatFab');
    const overlay = page.locator('#driverChatOverlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveClass(/open/);
    
    // 2. Verify Incident Panel Toggle
    await page.click('#dChatIncidentToggle');
    const incidentPanel = page.locator('#dChatIncidentPanel');
    await expect(incidentPanel).toBeVisible();
    
    // 3. Verify interaction within panel
    await page.click('.inc-type-btn[data-type="pothole"]');
    await page.fill('#incNoteInput', 'Large pothole at junction');
    
    // 4. Verify Close
    await page.click('#dChatBackBtn');
    await expect(overlay).not.toBeVisible();
  });

  test('should handle offline mode and action queueing', async ({ page, context }) => {
    await page.click('#driverChatFab');
    
    // Simulate connectivity loss
    await context.setOffline(true);
    
    // Perform an action while offline
    const input = page.locator('#dChatInput');
    await input.fill('Urgent: Road blocked');
    await page.click('#dChatSendBtn');
    
    // Check UI
    const messages = page.locator('.dmsg-bubble');
    await expect(messages.last()).toContainText('Urgent: Road blocked');
    
    // Check localStorage
    const queue = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('nestle_driver_offline_queue') || '[]');
    });
    expect(queue.length).toBeGreaterThan(0);

    // Restore connectivity
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    
    // Wait for sync
    await page.waitForFunction(() => {
      const q = JSON.parse(localStorage.getItem('nestle_driver_offline_queue') || '[]');
      return q.length === 0;
    }, { timeout: 5000 });
  });
});

test.describe('Automated QA - Manager Control', () => {
  test.beforeEach(async ({ page }) => {
    await QA_MOCK({ page });
    await page.goto('/dashboard.html');
    await page.waitForFunction(() => typeof window.resetCollection === 'function', { timeout: 15000 });
  });

  test('should verify Fleet Reset functionality', async ({ page }) => {
    await page.evaluate(() => window.__QA_AUTO_CONFIRM = true);

    const resetResult = await page.evaluate(async () => {
      try {
        await window.resetCollection('apiit', 'driver-123');
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message, stack: e.stack };
      }
    });

    if (!resetResult.success) {
      console.error('Reset Failed:', resetResult.error, resetResult.stack);
    }
    expect(resetResult.success).toBe(true);
    
    const toast = page.locator('#toast');
    await expect(toast).toContainText(/Success/i);
  });
});
