# Axtor POS Cloud — Shift Counter, Terminal Session, Supplier SOA Date Alignment, Purchase Authorization Fix

Date: 18 Jun 2026
Project area: `demo-static/`
Build type: static HTML/CSS/JS only
LocalStorage key preserved: `axtorAdvancedDemoDB`

## Files changed

- `demo-static/shifts.html`
- `demo-static/terminal.html`
- `demo-static/purchase.html`
- `demo-static/js/core-data.js`
- `demo-static/js/retail-advanced.js`
- `demo-static/js/axtor-fixes.js`
- `demo-static/js/app-data.js`
- `demo-static/css/style.css`
- `demo-static/sw.js`
- All `demo-static/*.html` static asset query strings were bumped to the new version.

## What was broken / missing

1. Shift / Closing page did not have a working Owner/Manager controlled Add New Counter workflow.
2. Terminal page did not clearly require or show the active cashier + counter session.
3. Terminal invoices were hardcoded to `Counter User` and did not save counter/session metadata.
4. Supplier SOA calculation was working, but Date column alignment was unstable and could wrap poorly.
5. New Purchase did not record the authorized person / created by / purchase by user.
6. Browser/GitHub Pages cache version needed to be bumped again so users do not need Ctrl+F5.

## What was fixed

### Shift / Closing — Counter Management

- Added Counter Management tab to `shifts.html` through the existing final patch file `axtor-fixes.js`.
- Added Add New Counter form with:
  - Counter name
  - Branch / warehouse / location
  - Assigned cashier optional
  - Status: Active / Inactive
  - Opening date/time optional
  - Notes optional
- Counters are saved inside `axtorAdvancedDemoDB.counters` only.
- Added safe migration/normalization for:
  - `counters`
  - `userRoles`
  - `shiftRecords`
  - `currentShift`
  - `terminalSession`
- Added sample demo users:
  - Danish / Owner
  - Manager / Manager
  - Naeem / Cashier
  - Counter User / Cashier
  - Warehouse User / Warehouse User
- Added role protection:
  - Owner and Manager can add/edit/deactivate counters.
  - Cashier cannot manage counters and sees the warning: `Only Owner or Manager can manage counters.`
- Added counter list/table with edit and activate/deactivate actions.
- Added counter selector to Open Shift.
- Opening a shift now records cashier, cashier role, counter, counter id, branch, opened time, and shift id.

### Terminal — Cashier / Counter Session

- Added Cashier / Counter Session panel to `terminal.html`.
- Added cashier dropdown from `axtorAdvancedDemoDB.userRoles`.
- Added counter dropdown from `axtorAdvancedDemoDB.counters`.
- Added session open/clear controls.
- Session is saved in `axtorAdvancedDemoDB.terminalSession` and synced with `currentShift` when needed.
- Terminal header now shows:
  - Cashier name
  - Cashier role
  - Counter name
  - Shift open time
- If no active session exists, terminal shows a warning before checkout.
- Terminal invoice saving now records:
  - `cashier`
  - `cashierName`
  - `cashierRole`
  - `counter`
  - `counterName`
  - `counterId`
  - `shiftNo`
  - `shiftId`
  - `terminalSessionId`
  - `terminalOpened`
  - `branch`

### Purchase — Supplier SOA Date Alignment

- Added stable Supplier SOA table classes.
- Date column now has fixed width, no bad wrapping, left alignment, and vertical alignment.
- Debit/Credit/Balance columns are right-aligned and vertically aligned.
- Opening rows and transaction rows use the same alignment structure.
- No SOA calculation logic was changed.

### Purchase — Authorized Person / Created By

- Added `Authorized Person / Purchase By` dropdown to New Purchase.
- Dropdown uses users/cashiers from `userRoles` and demo fallbacks.
- Defaults to current user if present, otherwise Owner/Danish demo fallback.
- Saved purchase records now include:
  - `authorizedBy`
  - `purchaseBy`
  - `createdBy`
  - `createdByRole`
- Related supplier bill records now include the same authorized/created metadata.
- Saved Purchases list now shows Authorized By.
- Purchase view panel now shows Authorized / Purchase By.
- Supplier Bill tab shows Created/Authorized By where available.
- Supplier SOA purchase/bill notes can show `By <person>` where metadata is available.

## Cache/version changes

- Service worker cache changed from:
  - `axtor-pos-cloud-static-demo-v15-inventory-warehouse-soa-20260618`
- To:
  - `axtor-pos-cloud-static-demo-v16-shift-counter-purchase-auth-20260618`
- Static asset query strings changed to:
  - `v=20260618-shift-counter-auth1`
- PWA registration changed to:
  - `sw.js?v=20260618-shift-counter-auth1`

## Syntax check results

Commands run from `demo-static/`:

```bash
node --check js/core-data.js
node --check js/app-data.js
node --check js/axtor-fixes.js
node --check js/retail-advanced.js
node --check sw.js
```

Result: all passed with no syntax errors.

## Automated QA performed

A source/static QA script verified:

- `shifts.html`, `terminal.html`, and `purchase.html` load `axtor-fixes.js` with the new cache query string.
- Counter migration and demo user seed exist in `core-data.js`.
- Shift Counter Management UI injection exists.
- Terminal Cashier / Counter Session UI injection exists.
- Terminal invoice metadata now uses session metadata instead of hardcoded cashier only.
- Purchase Authorized Person field exists.
- Purchase and supplier bill records save authorized metadata.
- Supplier SOA date alignment classes exist.
- Service worker cache version is bumped.

Result: all static QA checks passed.

## Browser harness note

A Playwright/Chromium browser harness was prepared and attempted against the local static server, but the execution environment blocked Chromium navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Because of that environment restriction, full interactive browser automation could not be completed inside this container. The included app files are syntax-checked and source-QA checked, and the manual QA checklist below is ready to run in a normal browser.

## Manual browser QA checklist to run after opening the ZIP locally or on GitHub Pages

### Shift / Closing Counter QA

1. Open `shifts.html`.
2. Confirm the Counter Management tab appears.
3. Confirm Add New Counter form appears.
4. Add `Counter 3`.
5. Select Main Branch.
6. Assign `Naeem / Cashier`.
7. Save counter.
8. Confirm it appears in Saved Counters.
9. Confirm it is saved in `axtorAdvancedDemoDB.counters`.
10. Set role to Cashier through localStorage key `axtorCurrentRole = Cashier`.
11. Reload and confirm counter save/edit/deactivate controls are blocked.
12. Set role back to Owner/Manager and confirm controls work.

### Terminal Cashier / Counter QA

1. Open `terminal.html`.
2. Confirm Cashier / Counter Session panel appears.
3. Select `Naeem / Cashier`.
4. Select `Counter 1` or newly created `Counter 3`.
5. Open Session.
6. Confirm header shows cashier, counter, and opened time.
7. Add product to terminal cart.
8. Complete sale/payment.
9. Confirm invoice saved in `axtorAdvancedDemoDB.invoices` includes cashier/counter/shift metadata.
10. Reload page and confirm active session persists.
11. Clear terminal session and confirm warning appears before checkout.

### Supplier SOA Alignment QA

1. Open `purchase.html`.
2. Go to Supplier SOA.
3. Select supplier.
4. Run SOA.
5. Confirm Date column alignment is clean.
6. Confirm Opening row alignment is clean.
7. Confirm Debit/Credit/Balance still calculate correctly.

### Purchase Authorized Person QA

1. Open `purchase.html`.
2. Go to New Purchase.
3. Confirm Authorized Person / Purchase By field exists.
4. Select `Naeem / Cashier`.
5. Add supplier and products.
6. Save purchase.
7. Confirm saved purchase list shows authorized person.
8. Confirm purchase view panel shows authorized person.
9. Confirm supplier bill record includes authorized person.
10. Confirm Supplier SOA row note can show authorized person.

## Regression areas preserved

- Static app only; no backend/build tools added.
- Existing `axtorAdvancedDemoDB` key preserved.
- Existing Sales Invoice / Quotation / Delivery Note / DN logic not modified.
- Saved invoice search/resume/delete logic not modified.
- New Purchase product search/suggestions preserved.
- Supplier Payable search/payment allocation preserved.
- Supplier SOA calculation preserved.
- Inventory Stock Count / Warehouse Map / Stock Transfer fixes preserved.
- Green-glass default theme preserved.
- Retro POS theme preserved.
