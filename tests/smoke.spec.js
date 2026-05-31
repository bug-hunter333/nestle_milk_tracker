const { test, expect } = require('@playwright/test');

const PAGES = [
  { path: 'index.html', title: 'Nestlé' },
  { path: 'login.html', title: 'Login' },
  { path: 'register.html', title: 'Create Account' },
  { path: 'driver.html', title: 'Driver Hub' },
  { path: 'center.html', title: 'Center Portal' },
  { path: 'dashboard.html', title: 'Control Tower' },
  { path: 'analytics.html', title: 'Analytics' },
  { path: 'analytical.html', title: 'Analytics' },
  { path: 'incident.html', title: 'Incident' },
  { path: '404.html', title: 'Page Not Found' },
];

test.describe('Smoke Tests - Page Loading', () => {
  for (const pageInfo of PAGES) {
    test(`Page: ${pageInfo.path} should load successfully`, async ({ page }) => {
      // Use no auth for smoke tests to just check if the files exist/load
      await page.goto(`./${pageInfo.path}`);
      
      // Check for partial title match or common structure
      await expect(page).toHaveTitle(new RegExp(pageInfo.title, 'i'));
      
      // Ensure no connection error displayed in page
      const content = await page.content();
      expect(content).not.toContain('ERR_CONNECTION_REFUSED');
    });
  }
});
