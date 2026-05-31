const { test, expect } = require('@playwright/test');

test.describe('Authentication & Role Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // NUCLEAR MOCK: intercept all external traffic and return 200
    await page.route(url => !url.href.includes('localhost'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          localId: "fake-uid", 
          idToken: "fake-token", 
          registered: true,
          users: [{ localId: "fake-uid", role: "driver" }]
        })
      });
    });

    // Also inject some readiness flags
    await page.addInitScript(() => {
        window.__firebase_ready = true;
    });

    page.on('console', msg => console.log(`BROWSER LOG [${msg.type()}]: ${msg.text()}`));
  });

  test('Registration Page Elements', async ({ page }) => {
    await page.goto('register.html');
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Create Account' })).toBeVisible();
  });

  test('Login Page Elements', async ({ page }) => {
    await page.goto('login.html');
    await expect(page.locator('#userEmail')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: /Sign In/i })).toBeVisible();
  });

  test('Role Selection Visibility', async ({ page }) => {
    await page.goto('register.html');
    await expect(page.locator('.role-card[data-role="driver"]')).toBeVisible();
    await expect(page.locator('.role-card[data-role="manager"]')).toBeVisible();
    await expect(page.locator('.role-card[data-role="center"]')).toBeVisible();
  });
});
