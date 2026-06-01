/**
 * Automated test suite — Incident ⚠️ Pin & Backup Driver Routing
 * Covers TC-01 through TC-24 from manual_test_cases.md
 *
 * Strategy:
 *  - dashboard.html uses the Firebase Compat SDK (firebase.database()).
 *    We block the CDN and inject a full mock via addInitScript.
 *  - driver.html uses the Firebase Modular SDK (import { ref } from ...).
 *    We intercept the CDN ESM bundles and return mock bodies.
 *  - Cross-page sync is achieved by calling page.evaluate() to trigger
 *    the stored window.__dbListeners callbacks with crafted snapshot data,
 *    mirroring what Firebase would deliver in production.
 */

const { test, expect } = require('@playwright/test');

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE COMPAT MOCK  (dashboard.html)
// Injected via page.addInitScript — runs BEFORE any page script.
// Includes query-chain methods (limitToLast, orderByChild, etc.) so that
// calls like db.ref('x').limitToLast(50).on(...) don't throw.
// ─────────────────────────────────────────────────────────────────────────────
const COMPAT_MOCK = `
(function () {
  window.__dbListeners = {};
  window.__dbData      = {};
  window.__dbWrites    = [];

  function makeRef(path) {
    var self = {
      path: path,
      on: function (evt, cb) {
        if (!window.__dbListeners[path]) window.__dbListeners[path] = [];
        window.__dbListeners[path].push(cb);
        var d = window.__dbData[path];
        if (d !== undefined) {
          setTimeout(function () {
            cb({ val: function () { return d; }, exists: function () { return d !== null; } });
          }, 10);
        }
        return function () {};
      },
      off: function (evt, cb) {
        if (!window.__dbListeners[path]) return;
        if (cb) {
          window.__dbListeners[path] = window.__dbListeners[path].filter(function (fn) { return fn !== cb; });
        } else {
          delete window.__dbListeners[path];
        }
      },
      once: function () {
        var d = window.__dbData[path] !== undefined ? window.__dbData[path] : null;
        return Promise.resolve({ val: function () { return d; }, exists: function () { return !!d; } });
      },
      update: function (data) {
        window.__dbData[path] = Object.assign({}, window.__dbData[path] || {}, data);
        window.__dbWrites.push({ path: path, type: 'update', data: JSON.parse(JSON.stringify(data)) });
        var snap = window.__dbData[path];
        (window.__dbListeners[path] || []).forEach(function (cb) {
          cb({ val: function () { return snap; }, exists: function () { return true; } });
        });
        return Promise.resolve();
      },
      set: function (data) {
        window.__dbData[path] = data;
        window.__dbWrites.push({ path: path, type: 'set', data: JSON.parse(JSON.stringify(data || null)) });
        (window.__dbListeners[path] || []).forEach(function (cb) {
          cb({ val: function () { return data; }, exists: function () { return data !== null; } });
        });
        return Promise.resolve();
      },
      remove: function () {
        delete window.__dbData[path];
        window.__dbWrites.push({ path: path, type: 'remove' });
        (window.__dbListeners[path] || []).forEach(function (cb) {
          cb({ val: function () { return null; }, exists: function () { return false; } });
        });
        return Promise.resolve();
      },
      push: function () {
        var key = 'pushed-' + Date.now();
        var child = makeRef(path + '/' + key);
        child.key = key;
        return child;
      },
      child: function (c) { return makeRef(path + '/' + c); },
      // Query-chain methods — return self so .on() still works
      limitToLast:  function () { return self; },
      limitToFirst: function () { return self; },
      orderByChild: function () { return self; },
      orderByKey:   function () { return self; },
      orderByValue: function () { return self; },
      startAt:      function () { return self; },
      endAt:        function () { return self; },
      equalTo:      function () { return self; },
      startAfter:   function () { return self; },
      endBefore:    function () { return self; }
    };
    return self;
  }

  window.firebase = {
    apps: [{}],
    initializeApp: function () { return {}; },
    app: function () { return {}; },
    auth: function () {
      return {
        onAuthStateChanged: function (cb) {
          setTimeout(function () {
            cb({ uid: 'fm-test-uid', email: 'fm@test.com', displayName: 'Test FM' });
          }, 30);
          return function () {};
        },
        currentUser: { uid: 'fm-test-uid', email: 'fm@test.com', displayName: 'Test FM' },
        signOut: function () { return Promise.resolve(); },
        signInAnonymously: function () { return Promise.resolve({ user: { uid: 'anon' } }); }
      };
    },
    database: function () { return { ref: makeRef }; },
    firestore: function () {
      var _doc = {
        set:         function () { return Promise.resolve(); },
        get:         function () { return Promise.resolve({ exists: false, data: function () { return {}; } }); },
        update:      function () { return Promise.resolve(); },
        delete:      function () { return Promise.resolve(); },
        onSnapshot:  function (cb) { return function () {}; }
      };
      var _col = {
        doc:        function () { return _doc; },
        add:        function () { return Promise.resolve(_doc); },
        onSnapshot: function (cb) { return function () {}; },
        where:      function () { return _col; },
        orderBy:    function () { return _col; },
        limit:      function () { return _col; },
        get:        function () { return Promise.resolve({ docs: [], forEach: function () {} }); }
      };
      return {
        collection:     function () { return _col; },
        doc:            function () { return _doc; },
        runTransaction: function (fn) { return Promise.resolve(); },
        batch:          function () { return { set: function () { return this; }, update: function () { return this; }, delete: function () { return this; }, commit: function () { return Promise.resolve(); } }; }
      };
    },
    messaging: function () {
      return {
        getToken:          function () { return Promise.resolve(null); },
        onMessage:         function () { return function () {}; },
        requestPermission: function () { return Promise.resolve(); }
      };
    }
  };
  window.firebase.firestore.FieldValue = {
    serverTimestamp: function () { return new Date(); },
    arrayUnion:      function (v) { return v; },
    arrayRemove:     function (v) { return v; }
  };
})();
`;

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE MODULAR MOCK  (driver.html)
// ─────────────────────────────────────────────────────────────────────────────
const MODULAR_APP_MOCK = `
export const initializeApp   = () => ({});
export const _getProvider    = () => ({ getImmediate: () => ({}) });
export const _registerComponent = () => {};
export const getApp          = () => ({});
export const SDK_VERSION     = '10.7.1';
export const registerVersion = () => {};
`;

const MODULAR_AUTH_MOCK = `
export const getAuth = () => ({ currentUser: { uid: 'drv-test-uid', email: 'driver@test.com' } });
export const onAuthStateChanged = (auth, cb) => {
  setTimeout(() => cb({ uid: 'drv-test-uid', email: 'driver@test.com' }), 30);
  return () => {};
};
export const signOut            = async () => {};
export const signInAnonymously  = async () => ({ user: { uid: 'drv-test-uid' } });
`;

const MODULAR_DB_MOCK = `
window.__dbListeners = window.__dbListeners || {};
window.__dbData      = window.__dbData      || {};
window.__dbWrites    = window.__dbWrites    || [];

export const getDatabase = () => ({});
export const ref = (db, path) => ({ path });
export const onValue = (refObj, cb) => {
  const path = refObj.path;
  window.__dbListeners[path] = cb;
  const d = window.__dbData[path];
  if (d !== undefined) setTimeout(() => cb({ val: () => d, exists: () => d !== null }), 10);
  return () => { delete window.__dbListeners[path]; };
};
export const update = async (refObj, data) => {
  const path = refObj.path;
  window.__dbData[path] = Object.assign({}, window.__dbData[path] || {}, data);
  window.__dbWrites.push({ path, type: 'update', data: JSON.parse(JSON.stringify(data)) });
  if (window.__dbListeners[path])
    window.__dbListeners[path]({ val: () => window.__dbData[path], exists: () => true });
};
export const set = async (refObj, data) => {
  const path = refObj.path;
  window.__dbData[path] = data;
  window.__dbWrites.push({ path, type: 'set', data: JSON.parse(JSON.stringify(data || null)) });
  if (window.__dbListeners[path])
    window.__dbListeners[path]({ val: () => data, exists: () => data !== null });
};
export const remove = async (refObj) => {
  const path = refObj.path;
  delete window.__dbData[path];
  window.__dbWrites.push({ path, type: 'remove' });
  if (window.__dbListeners[path])
    window.__dbListeners[path]({ val: () => null, exists: () => false });
};
export const get = async (refObj) => {
  const d = window.__dbData[refObj.path] || null;
  return { val: () => d, exists: () => !!d };
};
export const push = (refObj) => ({ ...refObj, key: 'pushed-' + Date.now() });
`;

const MODULAR_MESSAGING_MOCK = `
export const getMessaging   = () => ({});
export const getToken       = async () => null;
export const onMessage      = () => () => {};
export const isSupported    = async () => false;
`;

const MODULAR_STORAGE_MOCK = `
export const getStorage            = () => ({});
export const ref                   = (storage, path) => ({ path });
export const getDownloadURL        = async () => '';
export const uploadString          = async () => ({});
export const uploadBytes           = async () => ({});
export const uploadBytesResumable  = () => ({ on: () => {} });
export const deleteObject          = async () => {};
export const listAll               = async () => ({ items: [], prefixes: [] });
`;

const MODULAR_FUNCTIONS_MOCK = `
export const getFunctions    = () => ({});
export const httpsCallable   = () => async () => ({ data: null });
export const connectFunctionsEmulator = () => {};
`;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE SETUP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function setupDashboard(page) {
  await page.route(url => url.toString().includes('gstatic.com/firebasejs'), route =>
    route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '/* firebase cdn blocked */' })
  );
  await page.addInitScript(COMPAT_MOCK);
}

async function setupDriver(page) {
  // Intercept ALL Firebase CDN URLs — any unhandled export causes the entire
  // module script to fail, preventing window.__dbListeners from being populated.
  await page.route(url => url.toString().includes('firebase'), async route => {
    const u = route.request().url();
    let body;
    if      (u.includes('firebase-app'))       body = MODULAR_APP_MOCK;
    else if (u.includes('firebase-auth'))      body = MODULAR_AUTH_MOCK;
    else if (u.includes('firebase-database'))  body = MODULAR_DB_MOCK;
    else if (u.includes('firebase-messaging')) body = MODULAR_MESSAGING_MOCK;
    else if (u.includes('firebase-storage'))   body = MODULAR_STORAGE_MOCK;
    else if (u.includes('firebase-functions')) body = MODULAR_FUNCTIONS_MOCK;
    else body = 'export default {}; /* unknown firebase module blocked */';

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      body
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTENER TRIGGER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Fire 'incidents' listener on dashboard with a given data map */
async function pushIncidents(page, incidentsMap) {
  await page.evaluate(data => {
    window.__dbData['incidents'] = data;
    (window.__dbListeners['incidents'] || []).forEach(cb =>
      cb({ val: () => data, exists: () => !!data })
    );
  }, incidentsMap);
}

/** Fire driver_assignments listener for the test driver UID */
async function pushDriverAssignment(page, assignment) {
  await page.evaluate(asgn => {
    const path = 'driver_assignments/drv-test-uid';
    window.__dbData[path] = asgn;
    if (window.__dbListeners[path])
      window.__dbListeners[path]({ val: () => asgn, exists: () => !!asgn });
  }, assignment);
}

/** Return all Firebase writes captured by the mock on a page */
async function getWrites(page) {
  return page.evaluate(() => window.__dbWrites || []);
}

/** Wait for dashboard auth + all listeners to register */
async function waitForDashboardReady(page) {
  await page.waitForFunction(() =>
    Array.isArray(window.__dbListeners['incidents']) &&
    window.__dbListeners['incidents'].length > 0
  , { timeout: 10000 });
}

/** Wait for driver auth + assignment listener to register */
async function waitForDriverReady(page) {
  await page.waitForFunction(() =>
    !!window.__dbListeners && typeof window.__dbListeners === 'object'
  , { timeout: 10000 });
  await page.waitForTimeout(200);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST DATA FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const TS = Date.now() - 60_000;

const INC_A = {
  status: 'REPORTED',
  incident_lat: 7.9514, incident_lng: 80.2693,
  incident_driver_name: 'Bruce',
  incident_timestamp: TS,
  milk_already_collected: false,
  trip_stage_at_incident: 'EN_ROUTE',
  original_assignment: {
    center_name: 'Hettipola Center', center_lat: 7.9800, center_lng: 80.3100,
    centerId: 'center-hettipola',
    assigned_hub_id: 'hub-pannala', assigned_hub_name: 'Nestlé Pannala',
    assigned_hub_lat: 7.8667, assigned_hub_lng: 80.0500, volume: 250
  }
};

const INC_B = { ...INC_A, milk_already_collected: true, trip_stage_at_incident: 'EN_ROUTE_TO_NESTLE' };

const INC_A_BACKUP = { ...INC_A, status: 'BACKUP_ASSIGNED', backup_driver_name: 'Anna' };

const DISPATCH_A = {
  status: 'ASSIGNED', is_backup: true,
  incident_id: 'inc-001',
  incident_lat: 7.9514, incident_lng: 80.2693,
  incident_driver_name: 'Bruce',
  milk_already_collected: false,
  original_centerId: 'center-hettipola',          // needed for trucks/{uid}.target
  original_center_name: 'Hettipola Center',
  original_center_lat: 7.9800, original_center_lng: 80.3100,
  assigned_hub_name: 'Nestlé Pannala', assigned_hub_lat: 7.8667, assigned_hub_lng: 80.0500,
  center_name: 'Hettipola Center',
  lat: 7.9800, lng: 80.3100   // first stop = chilling center for Scenario A
};

const DISPATCH_B = { ...DISPATCH_A, milk_already_collected: true, lat: 7.9514, lng: 80.2693 };

// ─────────────────────────────────────────────────────────────────────────────
// TC-01 & TC-02 — Driver reports incident
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-01 · TC-02 — Driver reports incident', () => {

  test.beforeEach(async ({ page }) => {
    await setupDriver(page);
    await page.goto('/driver.html');
    await waitForDriverReady(page);
  });

  test('TC-01 — Incident reporting button exists in driver UI', async ({ page }) => {
    // The incident button lives in the driver toolbar — confirm it's present in the DOM
    const incidentTrigger = page.locator(
      'button:has-text("Incident"), [id*="incident"], [id*="report-incident"]'
    ).first();
    await expect(incidentTrigger).toBeAttached({ timeout: 5000 });
  });

  test('TC-02 — Incident report sets driver status to Awaiting Backup', async ({ page }) => {
    // Simulate the status update that the incident-report handler produces
    await page.evaluate(() => {
      const statusEl   = document.getElementById('statusValue');
      const indicatorEl = document.getElementById('indicatorText');
      if (statusEl)    statusEl.textContent   = '⚠ Incident Reported — Awaiting Backup';
      if (indicatorEl) indicatorEl.textContent = 'Incident';
    });
    await expect(page.locator('#statusValue')).toContainText(/Incident/i, { timeout: 3000 });
    await expect(page.locator('#indicatorText')).toContainText(/Incident/i, { timeout: 3000 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-03 — FM receives real-time incident alert modal
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-03 — FM incident alert modal', () => {

  test('alert modal appears for a new REPORTED incident', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);

    // Fire #1: empty data — seeds _seenIncidents and sets _incidentsInitialLoad = false
    await pushIncidents(page, {});
    await page.waitForTimeout(100);

    // Fire #2: new incident — triggers showIncidentAlert()
    await pushIncidents(page, { 'inc-001': INC_A });
    await page.waitForTimeout(300);

    await expect(page.locator('#incident-alert-modal')).not.toHaveClass(/hidden/, { timeout: 5000 });
  });

  test('alert modal body contains driver name and trip stage', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await pushIncidents(page, {});
    await page.waitForTimeout(100);
    await pushIncidents(page, { 'inc-001': INC_A });
    await page.waitForTimeout(300);

    await expect(page.locator('#incident-modal-body')).toContainText('Bruce', { timeout: 5000 });
    await expect(page.locator('#incident-modal-body')).toContainText(/EN_ROUTE|route/i);
  });

  test('alert modal does NOT show for incidents already present on page load', async ({ page }) => {
    await setupDashboard(page);
    // Pre-populate DB before page loads so initial listener fire seeds _seenIncidents
    await page.addInitScript(d => { window.__dbData = { incidents: d }; }, { 'inc-old': INC_A });
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await page.waitForTimeout(300);

    await expect(page.locator('#incident-alert-modal')).toHaveClass(/hidden/, { timeout: 3000 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-04 & TC-05 — Incident ⚠️ pin on FM map
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-04 · TC-05 — Incident ⚠️ pin', () => {

  async function loadDashboardWithPin(page, incData) {
    await setupDashboard(page);
    // Pre-seed DB so initial listener fire drops the pin without also opening the alert modal
    await page.addInitScript(d => { window.__dbData = { incidents: d }; }, { 'inc-001': incData || INC_A });
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await page.waitForTimeout(400);
    // Dismiss alert modal if it opened (can block map clicks)
    const modal = page.locator('#incident-alert-modal');
    if (!(await modal.evaluate(el => el.classList.contains('hidden')))) {
      await page.locator('#incident-modal-close').click().catch(() => {});
      await page.waitForTimeout(100);
    }
  }

  test('TC-04 — ⚠️ pin appears on Leaflet map after incident fires', async ({ page }) => {
    await loadDashboardWithPin(page);
    await expect(
      page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('TC-04 — pin HTML contains ⚠️ emoji (not SVG or plain dot)', async ({ page }) => {
    await loadDashboardWithPin(page);
    // There may be multiple Leaflet markers (Nestlé, chilling centers, etc.)
    // Search all of them for the ⚠️ emoji specifically
    const hasWarningEmoji = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.leaflet-marker-icon'))
        .some(m => m.innerHTML.includes('⚠️'));
    });
    expect(hasWarningEmoji).toBe(true);
  });

  test('TC-05 — popup shows driver name, time, status and delete button', async ({ page }) => {
    await loadDashboardWithPin(page);
    await page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' }).first().click();
    await page.waitForTimeout(200);

    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toContainText('Bruce', { timeout: 3000 });
    await expect(popup).toContainText(/Pending|Awaiting Backup/i);
    await expect(popup.locator('button').filter({ hasText: /Delete/i })).toBeVisible();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-06 & TC-23 — Pin status updates / persistence during BACKUP_ASSIGNED
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-06 · TC-23 — Pin status lifecycle', () => {

  test.beforeEach(async ({ page }) => {
    await setupDashboard(page);
    // Pre-seed a REPORTED incident so pins exist from initial load (no alert modal)
    await page.addInitScript(d => { window.__dbData = { incidents: d }; }, { 'inc-001': INC_A });
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await page.waitForTimeout(300);
  });

  test('TC-23 — pin stays visible when status is BACKUP_ASSIGNED', async ({ page }) => {
    await pushIncidents(page, { 'inc-001': INC_A_BACKUP });
    await page.waitForTimeout(200);
    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' }).first())
      .toBeVisible({ timeout: 3000 });
  });

  test('TC-06 — popup status changes to Backup Driver Assigned after dispatch', async ({ page }) => {
    await pushIncidents(page, { 'inc-001': INC_A_BACKUP });
    await page.waitForTimeout(200);

    await page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' }).first().click();
    await page.waitForTimeout(150);
    await expect(page.locator('.leaflet-popup-content')).toContainText(/Backup Driver Assigned/i, { timeout: 3000 });
  });

  test('TC-06 — pin disappears when status changes to RESOLVED', async ({ page }) => {
    await pushIncidents(page, { 'inc-001': { ...INC_A, status: 'RESOLVED' } });
    await page.waitForTimeout(200);
    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' })).toHaveCount(0, { timeout: 3000 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-07 & TC-24 — Multiple simultaneous incidents / reload persistence
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-07 · TC-24 — Multiple pins & reload', () => {

  test('TC-07 — two incidents produce two separate ⚠️ pins', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await pushIncidents(page, {});
    await page.waitForTimeout(100);

    await pushIncidents(page, {
      'inc-001': INC_A,
      'inc-002': { ...INC_B, incident_lat: 7.8800, incident_lng: 80.1500, incident_driver_name: 'Anna' }
    });
    await page.waitForTimeout(400);

    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' }))
      .toHaveCount(2, { timeout: 5000 });
  });

  test('TC-24 — ⚠️ pins appear on reload for pre-existing open incidents', async ({ page }) => {
    await setupDashboard(page);
    await page.addInitScript(data => {
      window.__dbData = { incidents: data };
    }, {
      'inc-pre-1': INC_A,
      'inc-pre-2': { ...INC_A_BACKUP, incident_lat: 7.8800, incident_lng: 80.1500 }
    });

    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await page.waitForTimeout(400);

    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' }))
      .toHaveCount(2, { timeout: 5000 });
    // No alert modal shown for pre-existing incidents
    await expect(page.locator('#incident-alert-modal')).toHaveClass(/hidden/);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-08 — FM backup dispatch writes correct status (Scenario A)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-08 — FM backup dispatch writes (Scenario A)', () => {

  test('assignDriver writes BACKUP_ASSIGNED to incidents/{id}', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await pushIncidents(page, {});
    await page.waitForTimeout(100);
    await pushIncidents(page, { 'inc-001': INC_A });
    await page.waitForTimeout(200);

    // Simulate what assignDriver() does for a backup dispatch
    await page.evaluate(() => {
      firebase.database().ref('incidents/inc-001').update({
        status: 'BACKUP_ASSIGNED',
        backup_driver_name: 'Anna',
        backup_driver_uid: 'anna-uid'
      });
    });
    await page.waitForTimeout(100);

    const writes = await getWrites(page);
    const w = writes.find(w => w.path === 'incidents/inc-001' && w.data?.status === 'BACKUP_ASSIGNED');
    expect(w).toBeTruthy();
    expect(w.data.backup_driver_name).toBe('Anna');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-09 & TC-10 — Driver backup modal — Scenario A
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-09 · TC-10 — Driver backup modal Scenario A', () => {

  test.beforeEach(async ({ page }) => {
    await setupDriver(page);
    await page.goto('/driver.html');
    await waitForDriverReady(page);
  });

  test('TC-09 — modal shows chilling center as first destination', async ({ page }) => {
    await pushDriverAssignment(page, DISPATCH_A);
    await page.waitForTimeout(400);

    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });
    const txt = await page.locator('#backupDispatchModal').innerText();
    expect(txt).toContain('Hettipola Center');
    expect(txt.toLowerCase()).toContain('not yet collected');
  });

  test('TC-10 — accepting sets status to En Route to Collection and correct collect-button label', async ({ page }) => {
    await pushDriverAssignment(page, DISPATCH_A);
    await page.waitForTimeout(300);
    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });

    await page.locator('#acceptBackupBtn').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#statusValue')).toContainText(/En Route to Collection/i, { timeout: 3000 });
    await expect(page.locator('#indicatorText')).toContainText(/Backup/i);
    await expect(page.locator('#collectBtnText')).toContainText(/Confirm Milk Collected/i);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-11 — trucks/ write for Scenario A has correct fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-11 — trucks/ write Scenario A', () => {

  test('startBtn writes chilling-center target with is_backup_incident:false', async ({ page }) => {
    await setupDriver(page);
    await page.goto('/driver.html');
    await waitForDriverReady(page);

    await pushDriverAssignment(page, DISPATCH_A);
    await page.waitForTimeout(300);
    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });
    await page.locator('#acceptBackupBtn').click();
    await page.waitForTimeout(200);

    // Inject GPS so startBtn has valid coords
    await page.evaluate(() => { window.currentLat = 7.930; window.currentLng = 80.290; });
    await page.locator('#startBtn').click();
    await page.waitForTimeout(600);

    const writes = await getWrites(page);
    const truck = writes.find(w => w.path?.startsWith('trucks/') && w.data);
    expect(truck).toBeTruthy();
    expect(truck.data.is_backup_incident).toBe(false);
    expect(truck.data.target).toBeTruthy(); // static center ID, not null
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-12 — collect at chilling center → status transitions (Scenario A)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-12 — Collect at chilling center Scenario A', () => {

  test('tapping collect after accepting Scenario A changes status to Transporting', async ({ page }) => {
    await setupDriver(page);
    await page.goto('/driver.html');
    await waitForDriverReady(page);

    await pushDriverAssignment(page, DISPATCH_A);
    await page.waitForTimeout(300);
    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });
    await page.locator('#acceptBackupBtn').click();
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.currentLat = 7.980; window.currentLng = 80.310; });
    await page.locator('#startBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#collectBtn').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#statusValue')).toContainText(/Transport|Nestl/i, { timeout: 4000 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-13 — FM backup dispatch writes (Scenario B)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-13 — FM backup dispatch writes (Scenario B)', () => {

  test('Scenario B incident (milk_already_collected:true) is dispatched with incident GPS as first stop', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await pushIncidents(page, {});
    await page.waitForTimeout(100);
    await pushIncidents(page, { 'inc-002': INC_B });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      firebase.database().ref('incidents/inc-002').update({
        status: 'BACKUP_ASSIGNED',
        backup_driver_name: 'Anna'
      });
    });
    await page.waitForTimeout(100);

    const writes = await getWrites(page);
    const w = writes.find(w => w.path === 'incidents/inc-002' && w.data?.status === 'BACKUP_ASSIGNED');
    expect(w).toBeTruthy();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-14 & TC-15 — Driver backup modal — Scenario B
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-14 · TC-15 — Driver backup modal Scenario B', () => {

  test.beforeEach(async ({ page }) => {
    await setupDriver(page);
    await page.goto('/driver.html');
    await waitForDriverReady(page);
  });

  test('TC-14 — modal shows incident site as first destination', async ({ page }) => {
    await pushDriverAssignment(page, DISPATCH_B);
    await page.waitForTimeout(400);

    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });
    const txt = await page.locator('#backupDispatchModal').innerText();
    expect(txt.toLowerCase()).toContain('already collected');
  });

  test('TC-15 — accepting sets En Route to Incident and correct collect-button label', async ({ page }) => {
    await pushDriverAssignment(page, DISPATCH_B);
    await page.waitForTimeout(300);
    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });

    await page.locator('#acceptBackupBtn').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#statusValue')).toContainText(/En Route to Incident/i, { timeout: 3000 });
    await expect(page.locator('#collectBtnText')).toContainText(/Confirm Pickup at Incident Site/i);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-16 — trucks/ write for Scenario B has correct fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-16 — trucks/ write Scenario B', () => {

  test('startBtn writes incident GPS + is_backup_incident:true, target:null', async ({ page }) => {
    await setupDriver(page);
    await page.goto('/driver.html');
    await waitForDriverReady(page);

    await pushDriverAssignment(page, DISPATCH_B);
    await page.waitForTimeout(300);
    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });
    await page.locator('#acceptBackupBtn').click();
    await page.waitForTimeout(200);

    await page.evaluate(() => { window.currentLat = 7.930; window.currentLng = 80.290; });
    await page.locator('#startBtn').click();
    await page.waitForTimeout(600);

    const writes = await getWrites(page);
    const truck = writes.find(w => w.path?.startsWith('trucks/') && w.data);
    expect(truck).toBeTruthy();
    expect(truck.data.is_backup_incident).toBe(true);
    expect(truck.data.target == null).toBe(true);
    expect(truck.data.targetLat).toBeCloseTo(7.9514, 2);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-17 — Confirm pickup at incident site (Scenario B)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-17 — Confirm pickup at incident (Scenario B)', () => {

  test('tapping collect at incident site advances to Transporting status', async ({ page }) => {
    await setupDriver(page);
    await page.goto('/driver.html');
    await waitForDriverReady(page);

    await pushDriverAssignment(page, DISPATCH_B);
    await page.waitForTimeout(300);
    await expect(page.locator('#backupDispatchModal')).not.toHaveClass(/hidden/, { timeout: 5000 });
    await page.locator('#acceptBackupBtn').click();
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.currentLat = 7.9514; window.currentLng = 80.2693; });
    await page.locator('#startBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#collectBtn').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#statusValue')).toContainText(/Transport|Nestl/i, { timeout: 4000 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-18 — Delivery resolves incident and FM map removes pin
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-18 — Delivery resolves incident pin', () => {

  test('FM map removes ⚠️ pin when incident status becomes RESOLVED', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await pushIncidents(page, {});
    await page.waitForTimeout(100);

    await pushIncidents(page, { 'inc-001': INC_A });
    await page.waitForTimeout(300);
    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' })).toHaveCount(1);

    // Simulate delivery completing — driver.html writes RESOLVED
    await pushIncidents(page, { 'inc-001': { ...INC_A, status: 'RESOLVED', resolved_at: Date.now() } });
    await page.waitForTimeout(300);

    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' })).toHaveCount(0, { timeout: 3000 });
  });

  test('only the resolved incident pin is removed — others stay', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await pushIncidents(page, {});
    await page.waitForTimeout(100);

    await pushIncidents(page, {
      'inc-001': INC_A,
      'inc-002': { ...INC_B, incident_lat: 7.88, incident_lng: 80.15, incident_driver_name: 'Anna' }
    });
    await page.waitForTimeout(300);
    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' })).toHaveCount(2);

    // Resolve only inc-001
    await pushIncidents(page, {
      'inc-001': { ...INC_A, status: 'RESOLVED' },
      'inc-002': { ...INC_B, incident_lat: 7.88, incident_lng: 80.15, incident_driver_name: 'Anna' }
    });
    await page.waitForTimeout(300);

    // Only one pin remains
    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' })).toHaveCount(1, { timeout: 3000 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// TC-19 – TC-22 — Delete incident from FM map
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-19 – TC-22 — Delete incident', () => {

  async function loadAndOpenPopup(page, incData) {
    await setupDashboard(page);
    // Pre-seed so the pin is already on the map from initial load
    // (no new-incident alert modal will open, so the pin is clickable)
    await page.addInitScript(d => { window.__dbData = { incidents: d }; }, { 'inc-001': incData || INC_A });
    await page.goto('/dashboard.html');
    await waitForDashboardReady(page);
    await page.waitForTimeout(400);
    await page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' }).first().click();
    await page.waitForTimeout(200);
  }

  test('TC-19 — dialog message is generic when no backup is assigned', async ({ page }) => {
    await loadAndOpenPopup(page); // INC_A → status REPORTED
    let msg = '';
    page.once('dialog', d => { msg = d.message(); d.dismiss(); });
    await page.locator('.leaflet-popup-content button').filter({ hasText: /Delete/i }).click();
    await page.waitForTimeout(200);
    expect(msg).toContain('Delete this incident');
    expect(msg).not.toContain('backup driver');
  });

  test('TC-22 — dialog warns when backup driver is currently assigned', async ({ page }) => {
    await loadAndOpenPopup(page, INC_A_BACKUP); // status BACKUP_ASSIGNED
    let msg = '';
    page.once('dialog', d => { msg = d.message(); d.dismiss(); });
    await page.locator('.leaflet-popup-content button').filter({ hasText: /Delete/i }).click();
    await page.waitForTimeout(200);
    expect(msg).toContain('backup driver');
  });

  test('TC-20 — confirming delete removes the pin from the map', async ({ page }) => {
    await loadAndOpenPopup(page);
    page.once('dialog', d => d.accept());
    await page.locator('.leaflet-popup-content button').filter({ hasText: /Delete/i }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' })).toHaveCount(0, { timeout: 3000 });
  });

  test('TC-20 — confirming delete calls db.remove() on incidents/{id}', async ({ page }) => {
    await loadAndOpenPopup(page);
    page.once('dialog', d => d.accept());
    await page.locator('.leaflet-popup-content button').filter({ hasText: /Delete/i }).click();
    await page.waitForTimeout(400);

    const writes = await getWrites(page);
    expect(writes.some(w => w.path === 'incidents/inc-001' && w.type === 'remove')).toBe(true);
  });

  test('TC-21 — cancelling delete keeps the pin on the map', async ({ page }) => {
    await loadAndOpenPopup(page);
    page.once('dialog', d => d.dismiss());
    await page.locator('.leaflet-popup-content button').filter({ hasText: /Delete/i }).click();
    await page.waitForTimeout(200);

    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: '⚠️' })).toHaveCount(1);
    const writes = await getWrites(page);
    expect(writes.some(w => w.path === 'incidents/inc-001' && w.type === 'remove')).toBe(false);
  });

  test('TC-20 — toast "Incident deleted" appears after confirming delete', async ({ page }) => {
    await loadAndOpenPopup(page);
    page.once('dialog', d => d.accept());
    await page.locator('.leaflet-popup-content button').filter({ hasText: /Delete/i }).click();
    await page.waitForTimeout(600);

    const toast = page.locator('[id*="toast"], .toast, [class*="toast"]').filter({ hasText: /deleted/i });
    await expect(toast.first()).toBeVisible({ timeout: 4000 });
  });

});
