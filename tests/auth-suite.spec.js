const { test, expect } = require('@playwright/test');

test.describe.serial('Authentication Lifecycle', () => {

  async function setupMocks(page, expectedRole = 'manager') {
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
                export const createUserWithEmailAndPassword = async () => ({ user: { uid: 'fake-uid' } });
                export const signInWithEmailAndPassword = async () => ({ user: { uid: 'fake-uid' } });
                export const signOut = async () => ({});
            `;
        } else if (url.includes('firebase-database.js')) {
            body = `
                export const getDatabase = () => ({}); 
                export const ref = (db, path) => ({ path });
                export const onValue = (refObj, cb) => {
                    const path = refObj.path;
                    const initial = { role: '${expectedRole}', journeyStatus: 'active' }; 
                    setTimeout(() => cb({ val: () => initial }), 50);
                    return () => {};
                };
                export const set = async (refObj, data) => Promise.resolve();
                export const push = (refObj) => ({ ...refObj, key: 'fake-key', set: async (d) => Promise.resolve() });
            `;
        } else return route.continue();

        return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' }, body });
    });

    await page.addInitScript(() => {
        window.__firebase_ready = true;
        const style = document.createElement('style');
        style.innerHTML = ".hidden { display: block !important; visibility: visible !important; opacity: 1 !important; transform: none !important; } .animate-fade-up { animation: none !important; opacity: 1 !important; transform: none !important; }";
        document.head.appendChild(style);
    });
  }

    const password = 'TestAuthPassword123!';
    const uniqueId = Date.now();
    const roles = [
        { name: 'Manager', key: 'manager', target: 'dashboard.html' },
        { name: 'Center',  key: 'center',  target: 'center.html' },
        { name: 'Driver',  key: 'driver',  target: 'driver.html' }
    ];

    test('Verify empty field validation', async ({ page }) => {
        await setupMocks(page);
        await page.goto('/register.html');
        await page.click('button:has-text("Create Account")');
        await expect(page.locator('#error-msg')).toContainText(/fields|required/i, { timeout: 15000 });
    });

    test('Verify password strength reactivity', async ({ page }) => {
        await setupMocks(page);
        await page.goto('/register.html');
        const passInput = page.locator('#userPass');
        const strengthLabel = page.locator('#strengthLabel');
        await passInput.fill('abc'); await expect(strengthLabel).toHaveText('');
        await passInput.fill('abcdef'); await expect(strengthLabel).toHaveText('Weak');
        await passInput.fill('Abcdefg123!'); await expect(strengthLabel).toHaveText('Very Strong');
    });

    for (const role of roles) {
        test(`Register & Login flow for ${role.name}`, async ({ page }) => {
            const userEmail = `${role.key}_${uniqueId}@nestle-dev.com`;
            await setupMocks(page, role.key);
            
            await page.goto('/register.html');
            await page.fill('#firstName', 'Auth');
            await page.fill('#lastName', role.name);
            await page.fill('#userEmail', userEmail);
            await page.fill('#userPass', password);
            await page.locator(`.role-card[data-role="${role.key}"]`).click();
            await page.click('button:has-text("Create Account")');
            await page.waitForURL(url => url.href.includes(role.target.split('.')[0]), { timeout: 15000 });

            await page.goto('/login.html');
            await page.fill('#userEmail', userEmail);
            await page.fill('#userPass', password);
            await page.keyboard.press('Enter');
            await page.waitForURL(url => url.href.includes(role.target.split('.')[0]), { timeout: 15000 });
        });
    }

    test('Verify login error for invalid credentials', async ({ page }) => {
        await setupMocks(page);
        await page.route(/firebase-auth\.js/, route => route.fulfill({
            status: 200, headers: { 'Content-Type': 'application/javascript' },
            body: "export const getAuth = () => ({}); export const signInWithEmailAndPassword = async () => { throw new Error('auth/invalid-credential'); }; export const onAuthStateChanged = (auth, cb) => cb(null);"
        }));
        await page.goto('/login.html');
        await page.fill('#userEmail', 'invalid_user@nestle.com');
        await page.fill('#userPass', 'WrongPass123!');
        await page.click('button:has-text("Sign In")');
        await expect(page.locator('#error-msg')).not.toBeEmpty({ timeout: 15000 });
    });
});
