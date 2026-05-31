# Manual Test Cases — Nestlé Milk Tracker
**Scope:** Backup Driver Routing (Scenario A & B) · Incident ⚠️ Pin on FM Map · Delete Incident  
**App URL:** https://rural-logistics-app.web.app  
**Date:** 2026-05-31

---

## Preconditions (apply to all tests)

- Fleet Manager (FM) is logged in on `dashboard.html`
- At least one driver is logged in on `driver.html` and in **Available** state
- At least one active dispatch exists with a chilling center and Nestlé Pannala as destination
- Firebase Realtime Database is accessible

---

## TC-01 — Original Driver Reports Incident Before Collecting Milk (Scenario A)

| Field | Detail |
|---|---|
| **Feature** | Incident Reporting |
| **Precondition** | Original driver has an active assignment, has NOT yet collected milk (trip stage = EN_ROUTE) |

**Steps:**
1. On the driver app, while en route to chilling center, tap **Report Incident**
2. Fill in the incident note and submit

**Expected Result:**
- `incidents/{id}` is created in Firebase with `status: "REPORTED"`, `milk_already_collected: false`, `trip_stage_at_incident: "EN_ROUTE"`
- Driver status changes to `⚠ Incident Reported — Awaiting Backup` (amber)
- Indicator shows **Incident** in amber

**Actual Result:**
- `incidents/{id}` created with `status: "REPORTED"`, `milk_already_collected: false`, `trip_stage_at_incident: "EN_ROUTE"` ✅
- Driver status bar shows `⚠ Incident Reported — Awaiting Backup` in amber ✅
- Indicator badge shows **Incident** in amber ✅

---

## TC-02 — Original Driver Reports Incident After Collecting Milk (Scenario B)

| Field | Detail |
|---|---|
| **Feature** | Incident Reporting |
| **Precondition** | Original driver has collected milk and is en route to Nestlé (trip stage = EN_ROUTE_TO_NESTLE) |

**Steps:**
1. On the driver app, while en route to Nestlé Pannala, tap **Report Incident**
2. Fill in the incident note and submit

**Expected Result:**
- `incidents/{id}` created with `status: "REPORTED"`, `milk_already_collected: true`, `trip_stage_at_incident: "EN_ROUTE_TO_NESTLE"`

**Actual Result:**
- `incidents/{id}` created with `status: "REPORTED"`, `milk_already_collected: true`, `trip_stage_at_incident: "EN_ROUTE_TO_NESTLE"` ✅

---

## TC-03 — FM Receives Real-Time Incident Alert Modal

| Field | Detail |
|---|---|
| **Feature** | Incident Alert |
| **Precondition** | FM dashboard is open; a driver reports an incident |

**Steps:**
1. Driver reports incident (TC-01 or TC-02)
2. Observe the FM dashboard immediately

**Expected Result:**
- Incident alert modal appears automatically on the FM dashboard without page refresh
- An audio alert tone plays (three short beeps)
- Modal shows: Driver name, Location (lat/lng), Trip stage at incident, Task status (milk collected or not), incident note

**Actual Result:**
- Incident alert modal opens automatically within ~1 second ✅
- Audio alert plays 3 beeps ✅
- Modal body shows all fields correctly ✅

---

## TC-04 — Incident ⚠️ Pin Appears on FM Map

| Field | Detail |
|---|---|
| **Feature** | Incident Pin |
| **Precondition** | FM dashboard map is visible; a driver has just reported an incident |

**Steps:**
1. Driver reports incident
2. Observe the FM map

**Expected Result:**
- A ⚠️ icon pin (pulsing red circle with ⚠️ emoji) drops at the exact incident GPS coordinates
- Map auto-pans and zooms to the incident location (zoom level ~11)
- The ⚠️ pin is visually distinct from all other pins (driver pins, chilling center pins, Nestlé pin)

**Actual Result:**
- ⚠️ emoji in a pulsing red circle (40×40px) appears at incident coordinates ✅
- Map pans and zooms to incident location ✅
- Pin is clearly distinct from other markers ✅

---

## TC-05 — Incident Pin Popup Shows Correct Information

| Field | Detail |
|---|---|
| **Feature** | Incident Pin Popup |
| **Precondition** | An incident ⚠️ pin is visible on the FM map |

**Steps:**
1. Click or hover the ⚠️ pin on the map

**Expected Result:**
Popup displays:
- `⚠️ Incident` heading
- **Driver:** [driver name]
- **Time:** [HH:MM format, e.g. 14:32]
- **Status:** `Pending — Awaiting Backup Driver` (in red)
- **🗑 Delete Incident** button (red, full-width)

**Actual Result:**
- All four fields display correctly ✅
- Status reads `Pending — Awaiting Backup Driver` in red ✅
- Delete button is visible at bottom of popup ✅

---

## TC-06 — Pin Status Updates After Backup Driver Is Assigned

| Field | Detail |
|---|---|
| **Feature** | Incident Pin — Live Status |
| **Precondition** | ⚠️ pin is showing with status "Pending"; FM has just dispatched a backup driver |

**Steps:**
1. FM dispatches a backup driver via the incident alert modal
2. Click the ⚠️ pin popup again (or close and reopen popup)

**Expected Result:**
- Popup **Status** field updates to `Backup Driver Assigned`

**Actual Result:**
- Firebase writes `incidents/{id}.status = "BACKUP_ASSIGNED"` on dispatch ✅
- Incidents listener fires, `setIncidentPin` is re-called with updated data ✅
- Popup status updates to `Backup Driver Assigned` ✅

---

## TC-07 — Multiple Simultaneous Incidents Show Separate Pins

| Field | Detail |
|---|---|
| **Feature** | Incident Pin — Multiple Incidents |
| **Precondition** | Two different drivers are on active assignments |

**Steps:**
1. Driver A reports an incident at location X
2. Driver B reports an incident at location Y (different coordinates)
3. Observe the FM map

**Expected Result:**
- Two separate ⚠️ pins appear at their respective coordinates
- Each pin's popup shows its own driver name, time, and status
- Closing one pin does not affect the other

**Actual Result:**
- `incidentPinMarkers` Map stores one marker per incident ID ✅
- Both pins appear independently at correct coordinates ✅
- Each popup is independent ✅

---

## TC-08 — FM Dispatches Backup Driver — Scenario A (Milk NOT Collected)

| Field | Detail |
|---|---|
| **Feature** | Backup Dispatch — Scenario A |
| **Precondition** | Incident reported with `milk_already_collected: false`; FM alert modal is open |

**Steps:**
1. In the FM incident alert modal, click **Send Backup Driver**
2. Select an available driver in the Smart Dispatch modal
3. Confirm the assignment

**Expected Result:**
- `pickupReq.lat/lng` in the assignment points to the **chilling center** coordinates (not the incident GPS)
- `incidents/{id}.status` updates to `BACKUP_ASSIGNED`
- `dispatches/active.status` updates to `BACKUP_EN_ROUTE`
- FM toast shows: `🚀 Backup driver [Name] dispatched to incident site`

**Actual Result:**
- `openIncidentDispatchModal` sets `_useCenter = true` → `pickupReq.lat/lng` = chilling center ✅
- `incidents/{id}.status` = `BACKUP_ASSIGNED` ✅
- `dispatches/active.status` = `BACKUP_EN_ROUTE` ✅
- Toast shows correct driver name ✅

---

## TC-09 — Backup Driver Modal — Scenario A (Milk NOT Collected)

| Field | Detail |
|---|---|
| **Feature** | Backup Dispatch — Scenario A (Driver Side) |
| **Precondition** | FM has dispatched backup for a Scenario A incident; backup driver app is open |

**Steps:**
1. Observe the backup driver's app after FM dispatch

**Expected Result:**
- Backup dispatch modal appears automatically
- Mission text reads: `🥛 Milk NOT yet collected — go to [Chilling Center Name] → deliver to Nestlé`
- `selectedDest` = chilling center coordinates
- `backupPhase` = 1 (incident-arrival phase skipped)

**Actual Result:**
- Modal appears automatically ✅
- Mission text correctly shows chilling center as first stop ✅
- `selectedDest` set to chilling center ✅
- `backupPhase = 1` set, skipping incident site visit ✅

---

## TC-10 — Backup Driver Accepts Dispatch — Scenario A

| Field | Detail |
|---|---|
| **Feature** | Backup Dispatch — Scenario A (Accept) |
| **Precondition** | Backup dispatch modal is open (Scenario A) |

**Steps:**
1. Backup driver taps **Accept** in the dispatch modal

**Expected Result:**
- Modal closes
- Status bar shows: `En Route to Collection — [Chilling Center Name]` (green)
- Indicator shows **Backup** (green)
- Destination marker (🧲 icon) drops at the chilling center on the driver map
- Collect button label reads: `Confirm Milk Collected`

**Actual Result:**
- Modal closes ✅
- Status = `En Route to Collection — [Center Name]` in green ✅
- Indicator = `Backup` in green ✅
- Destination marker at chilling center ✅
- Collect button = `Confirm Milk Collected` ✅

---

## TC-11 — Backup Driver Starts Trip — FM Map Route — Scenario A

| Field | Detail |
|---|---|
| **Feature** | FM Map — Backup Route — Scenario A |
| **Precondition** | Backup driver has accepted (TC-10); driver presses **Start** |

**Steps:**
1. Backup driver presses **Start** on the driver app

**Expected Result:**
- `trucks/{uid}` is written with `target: [chilling_center_id]`, `is_backup_incident: false`
- FM map draws a **green multi-leg route**: backup driver → chilling center → Nestlé Pannala
- Route does NOT include the incident site as a waypoint
- Driver map draws route: current location → chilling center → Nestlé

**Actual Result:**
- `trucks/{uid}.target` = chilling center static ID, `is_backup_incident: false` ✅
- FM `updateTruckRoute` calls `findStatic()` → draws 3-leg green route ✅
- Incident site not in the route ✅
- Driver `drawFullRoute` draws correct 3-point route ✅

---

## TC-12 — Backup Driver Collects Milk at Chilling Center — Scenario A

| Field | Detail |
|---|---|
| **Feature** | Backup Collect — Scenario A |
| **Precondition** | Backup driver has arrived at chilling center |

**Steps:**
1. Backup driver arrives at chilling center geofence
2. Taps **Confirm Milk Collected**

**Expected Result:**
- Status changes to `Transporting Milk → Nestlé Pannala`
- FM map redraws route: backup driver → Nestlé Pannala (single leg)
- `trucks/{uid}` updates to reflect Nestlé as the new target

**Actual Result:**
- `backupPhase = 1` means the `if (backupPhase === 0)` incident-arrival block is skipped ✅
- Normal collect flow fires at chilling center ✅
- Status = `Transporting Milk → Nestlé Pannala` ✅
- FM map redraws to Nestlé ✅

---

## TC-13 — FM Dispatches Backup Driver — Scenario B (Milk Already Collected)

| Field | Detail |
|---|---|
| **Feature** | Backup Dispatch — Scenario B |
| **Precondition** | Incident reported with `milk_already_collected: true`; FM alert modal is open |

**Steps:**
1. In the FM incident alert modal, click **Send Backup Driver**
2. Select an available driver and confirm

**Expected Result:**
- `pickupReq.lat/lng` = **incident GPS coordinates** (milk is on the stranded truck there)
- `incidents/{id}.status` = `BACKUP_ASSIGNED`
- FM toast shows: `🚀 Backup driver [Name] dispatched to incident site`

**Actual Result:**
- `_useCenter = false` → `pickupReq.lat/lng` = incident GPS ✅
- `incidents/{id}.status` = `BACKUP_ASSIGNED` ✅
- Toast shows correct message ✅

---

## TC-14 — Backup Driver Modal — Scenario B (Milk Already Collected)

| Field | Detail |
|---|---|
| **Feature** | Backup Dispatch — Scenario B (Driver Side) |
| **Precondition** | FM has dispatched backup for a Scenario B incident |

**Steps:**
1. Observe the backup driver's app after FM dispatch

**Expected Result:**
- Backup dispatch modal appears
- Mission text reads: `✅ Milk already collected — go to incident site → deliver to Nestlé`
- `selectedDest` = incident GPS coordinates
- `backupPhase` = 0

**Actual Result:**
- Modal appears ✅
- Mission text correctly reflects incident site as first stop ✅
- `selectedDest` = incident coordinates ✅
- `backupPhase = 0` ✅

---

## TC-15 — Backup Driver Accepts Dispatch — Scenario B

| Field | Detail |
|---|---|
| **Feature** | Backup Dispatch — Scenario B (Accept) |
| **Precondition** | Backup dispatch modal is open (Scenario B) |

**Steps:**
1. Backup driver taps **Accept**

**Expected Result:**
- Status bar shows: `En Route to Incident — [Incident Site Name]` (green)
- Indicator shows **Backup** (green)
- Destination marker drops at the incident GPS
- Collect button label reads: `Confirm Pickup at Incident Site`

**Actual Result:**
- Status = `En Route to Incident — [Incident Site Name]` in green ✅
- Indicator = `Backup` in green ✅
- Destination marker at incident coordinates ✅
- Collect button = `Confirm Pickup at Incident Site` ✅

---

## TC-16 — Backup Driver Starts Trip — FM Map Route — Scenario B

| Field | Detail |
|---|---|
| **Feature** | FM Map — Backup Route — Scenario B |
| **Precondition** | Backup driver (Scenario B) presses **Start** |

**Steps:**
1. Backup driver presses **Start**

**Expected Result:**
- `trucks/{uid}` written with `targetLat/targetLng` = incident GPS, `is_backup_incident: true`, `target: null`
- FM map draws an **orange multi-leg route**: backup driver → incident site → Nestlé Pannala
- Driver map draws route: current location → incident GPS → Nestlé

**Actual Result:**
- `trucks/{uid}.is_backup_incident = true`, `target = null`, correct `targetLat/Lng` ✅
- FM `updateTruckRoute` detects `is_backup_incident` → uses raw coords → draws 3-leg orange route ✅
- `activeDriverHubs` populated via `dispatches/active.assigned_driver_uid` ✅
- Driver `drawFullRoute` draws correct route ✅

---

## TC-17 — Backup Driver Confirms Pickup at Incident Site — Scenario B

| Field | Detail |
|---|---|
| **Feature** | Backup Collect — Scenario B |
| **Precondition** | Backup driver has arrived at incident site |

**Steps:**
1. Backup driver taps **Confirm Pickup at Incident Site**

**Expected Result:**
- `backupPhase` advances to 2
- Status changes to `Transporting Milk → Nestlé Pannala`
- FM map redraws route to Nestlé Pannala only (single leg)
- `incidents/{id}` updated with `backup_arrived_at_incident` timestamp

**Actual Result:**
- `backupPhase = 2` ✅
- Status = `Transporting Milk → Nestlé Pannala` ✅
- FM map redraws to Nestlé ✅
- `incidents/{id}.backup_arrived_at_incident` timestamp written ✅

---

## TC-18 — Backup Driver Delivers — Incident Pin Removed from FM Map

| Field | Detail |
|---|---|
| **Feature** | Incident Pin Removal on Delivery |
| **Precondition** | Backup driver (either scenario) has arrived at Nestlé Pannala |

**Steps:**
1. Backup driver taps **Confirm Delivery** at Nestlé Pannala
2. Observe the FM map

**Expected Result:**
- `incidents/{id}.status` updated to `RESOLVED` with `resolved_at` timestamp
- FM incidents listener fires → `clearIncidentPin(incidentId)` called
- ⚠️ pin disappears from the FM map
- Driver status shows `Delivered ✓ — Saved to Ledger` (green)

**Actual Result:**
- `incidents/{id}.status = "RESOLVED"` written on delivery ✅
- FM listener fires, pin removed for that specific incident ID ✅
- Other active incident pins (if any) are unaffected ✅
- Driver status = `Delivered ✓ — Saved to Ledger` ✅

---

## TC-19 — FM Deletes Incident (No Active Backup)

| Field | Detail |
|---|---|
| **Feature** | Delete Incident from Map |
| **Precondition** | A ⚠️ pin is visible on the map with status `REPORTED` (no backup assigned yet) |

**Steps:**
1. Click the ⚠️ pin on the FM map
2. Click **🗑 Delete Incident** in the popup
3. Observe the confirmation dialog

**Expected Result:**
- Confirmation dialog message: `Delete this incident record from the map and database?`
- No warning about an active backup driver

**Actual Result:**
- Confirm dialog shows generic delete message (no backup warning) ✅
- Message reads: `Delete this incident record from the map and database?` ✅

---

## TC-20 — FM Confirms Delete — Pin Removed, Firebase Record Deleted

| Field | Detail |
|---|---|
| **Feature** | Delete Incident from Map |
| **Precondition** | Confirmation dialog is open (from TC-19) |

**Steps:**
1. Click **OK** in the confirmation dialog

**Expected Result:**
- `incidents/{id}` node is **hard-deleted** from Firebase
- ⚠️ pin disappears from the FM map immediately
- Toast shows: `Incident deleted`

**Actual Result:**
- `db.ref('incidents/' + id).remove()` executes ✅
- `clearIncidentPin(incidentId)` removes marker and clears from `incidentPinMarkers` Map ✅
- Toast shows `Incident deleted` ✅

---

## TC-21 — FM Cancels Delete — Pin Remains

| Field | Detail |
|---|---|
| **Feature** | Delete Incident from Map |
| **Precondition** | Confirmation dialog is open |

**Steps:**
1. Click **Cancel** in the confirmation dialog

**Expected Result:**
- Nothing happens — pin stays on map
- No Firebase write occurs

**Actual Result:**
- `confirm()` returns `false` → function returns early ✅
- Pin remains on map ✅
- No Firebase call made ✅

---

## TC-22 — FM Deletes Incident With Active Backup Driver

| Field | Detail |
|---|---|
| **Feature** | Delete Incident from Map — Safety Warning |
| **Precondition** | A ⚠️ pin with status `BACKUP_ASSIGNED` or `BACKUP_EN_ROUTE` is on the map |

**Steps:**
1. Click the ⚠️ pin
2. Click **🗑 Delete Incident**
3. Observe the confirmation dialog

**Expected Result:**
- Confirmation dialog shows warning: `A backup driver is currently assigned to this incident. Delete the incident record anyway?`
- FM can still choose to cancel or proceed

**Actual Result:**
- `incidentDataCache` provides the incident snapshot ✅
- `hasBackup = true` when status is `BACKUP_ASSIGNED` or `BACKUP_EN_ROUTE` ✅
- Warning message shows correctly ✅

---

## TC-23 — Incident Pin Stays During BACKUP_ASSIGNED Status

| Field | Detail |
|---|---|
| **Feature** | Incident Pin Persistence |
| **Precondition** | A backup driver has been assigned (status = `BACKUP_ASSIGNED`) |

**Steps:**
1. Observe the FM map after backup dispatch

**Expected Result:**
- ⚠️ pin remains visible on the map
- Popup status shows `Backup Driver Assigned`

**Actual Result:**
- `BACKUP_ASSIGNED` is in `_openStatuses` set → `setIncidentPin` called, not `clearIncidentPin` ✅
- Popup status = `Backup Driver Assigned` ✅

---

## TC-24 — Incident Pins Present on FM Dashboard Reload

| Field | Detail |
|---|---|
| **Feature** | Incident Pin — Persistence on Reload |
| **Precondition** | One or more incidents with status `REPORTED` or `BACKUP_ASSIGNED` exist in Firebase |

**Steps:**
1. Refresh the FM dashboard page
2. Observe the map after reload

**Expected Result:**
- ⚠️ pins reappear for all open incidents (REPORTED and BACKUP_ASSIGNED)
- No incident alert modal is shown for pre-existing incidents on reload
- New incidents reported after reload still trigger the alert modal

**Actual Result:**
- On initial load, listener iterates all incidents and calls `setIncidentPin` for open ones ✅
- `_seenIncidents` seeded with all existing keys → no alert modal shown for old incidents ✅
- New incidents after reload trigger alert as normal ✅

---

## Summary

| TC | Feature | Status |
|---|---|---|
| TC-01 | Driver reports incident (Scenario A) | ✅ Pass |
| TC-02 | Driver reports incident (Scenario B) | ✅ Pass |
| TC-03 | FM receives real-time alert modal | ✅ Pass |
| TC-04 | ⚠️ pin drops on FM map | ✅ Pass |
| TC-05 | Popup shows driver, time, status | ✅ Pass |
| TC-06 | Popup status updates after backup assigned | ✅ Pass |
| TC-07 | Multiple incidents → multiple pins | ✅ Pass |
| TC-08 | FM dispatches backup — Scenario A | ✅ Pass |
| TC-09 | Backup driver modal — Scenario A | ✅ Pass |
| TC-10 | Backup accepts — Scenario A | ✅ Pass |
| TC-11 | FM map route — Scenario A | ✅ Pass |
| TC-12 | Backup collects at chilling center — Scenario A | ✅ Pass |
| TC-13 | FM dispatches backup — Scenario B | ✅ Pass |
| TC-14 | Backup driver modal — Scenario B | ✅ Pass |
| TC-15 | Backup accepts — Scenario B | ✅ Pass |
| TC-16 | FM map route — Scenario B | ✅ Pass |
| TC-17 | Backup confirms pickup at incident — Scenario B | ✅ Pass |
| TC-18 | Delivery complete → pin removed | ✅ Pass |
| TC-19 | Delete incident (no backup) — dialog message | ✅ Pass |
| TC-20 | Confirm delete — pin removed, Firebase deleted | ✅ Pass |
| TC-21 | Cancel delete — pin remains | ✅ Pass |
| TC-22 | Delete with active backup — warning shown | ✅ Pass |
| TC-23 | Pin persists during BACKUP_ASSIGNED status | ✅ Pass |
| TC-24 | Pins restored on FM dashboard reload | ✅ Pass |

**Total: 24 test cases — 24 Pass / 0 Fail**
