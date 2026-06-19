# Axtor POS Cloud — Inventory, Warehouse, Stock Transfer, Supplier SOA Fix

Date: 2026-06-18
Project: Axtor POS Cloud static demo
Storage: existing `axtorAdvancedDemoDB` localStorage key only

## Files changed

- `demo-static/js/axtor-fixes.js`
  - Added Inventory Stock Count search/suggestions/count posting layer.
  - Added Inventory Warehouse management + Google Maps static preview layer.
  - Added Inventory Stock Transfer product search/suggestions/posting layer.
  - Strengthened Supplier SOA supplier discovery and newly-added supplier refresh.
  - Prevented Supplier SOA duplicate opening-balance rows when legacy `OPEN-*` supplier bills exist.
- `demo-static/inventory.html`
  - Added missing `js/axtor-fixes.js` script include so final fixes actually run on Inventory page.
  - Bumped static asset query strings.
- `demo-static/js/app-data.js`
  - Bumped service worker registration query string.
- `demo-static/sw.js`
  - Bumped cache version to `axtor-pos-cloud-static-demo-v15-inventory-warehouse-soa-20260618`.
- All `demo-static/*.html`
  - Bumped static asset query strings from `v=20260618-supplier-soa1` to `v=20260618-inventory-warehouse-soa2` to reduce GitHub Pages/browser cache issues and avoid Ctrl+F5.
- `demo-static/CHANGELOG-INVENTORY-WAREHOUSE-SOA-FIX.md`
  - This changelog.

## What was broken

1. Inventory page did not load the final `axtor-fixes.js` script, so late patch logic could not run on Inventory at all.
2. Inventory → Stock Count was demo/static only; scan/search did not search saved products and count posting did not safely update product stock.
3. Inventory → Warehouses had static placeholder fields and no localStorage-backed warehouse list or map preview.
4. Inventory → Stock Transfer had static placeholder fields and no working product lookup, validation, or transfer posting.
5. Supplier SOA needed stronger handling for newly added suppliers and suppliers discovered from purchases/payments/bills.
6. Old synthetic `OPEN-*` supplier bills could duplicate supplier opening balance in SOA.
7. Browser/PWA cache version and asset query strings needed a new bump.

## What was fixed

### Inventory → Stock Count

- Searches `axtorAdvancedDemoDB.products` by product name, SKU, barcode, category, brand, and related product fields.
- Shows visible suggestions/dropdown with product name, SKU, barcode, category, brand, and system stock.
- Pressing Enter selects/adds the first matching product; exact SKU/barcode scans are supported through Enter.
- Clicking a suggestion adds the product into the count sheet.
- Count sheet now includes Product, SKU, System Qty, Counted Qty, Difference, and Remove.
- Counted Qty is editable and Difference updates live.
- Approve/Post Stock Count validates quantities, updates product stock, updates product status, creates stock movement rows, and saves a stock count session in `stockCountSessions`.
- Added recommended products based on low stock / minStock / reorderLevel and stock movement frequency.
- “Add to count” buttons work from recommendations.

### Inventory → Warehouse + Google Maps

- Added warehouse form fields:
  - Warehouse name
  - Branch/location name
  - Address
  - Contact person
  - Phone
  - Status Active/Inactive
  - Opening stock value
- Saves warehouses into `axtorAdvancedDemoDB.warehouses` only.
- Shows saved warehouses in a table.
- Added edit, activate/deactivate, and delete-from-demo-list controls.
- Added Google Maps static embed/search preview using the warehouse address.
- Added “Open in Google Maps” link.
- No private Google Maps API key is used or hardcoded.
- Warehouse dropdowns in Stock Count, Stock Adjustment, and Stock Transfer refresh from `axtorAdvancedDemoDB.warehouses`.

### Inventory → Stock Transfer

- Replaced static placeholders with working fields:
  - From warehouse
  - To warehouse
  - Transfer No
  - Product / SKU / Barcode search
  - Qty
- Product search uses `axtorAdvancedDemoDB.products` and supports product name, SKU, barcode, category, and brand.
- Suggestions show product name, SKU, stock, category, barcode, and brand.
- Clicking a suggestion selects the product; Enter selects an exact SKU/barcode or first match.
- Validates product, warehouses, same-warehouse transfers, qty > 0, and insufficient product stock when negative stock is not allowed.
- Saves transfer records into `axtorAdvancedDemoDB.stockTransfers`.
- Creates paired stock movement rows for transfer out/in while preserving product-level stock, because this static demo does not yet maintain full warehouse-wise stock quantities.
- Resets the transfer form after a successful transfer.

### Purchase → Supplier SOA

- Supplier SOA supplier dropdown now includes suppliers from:
  - `suppliers`
  - `supplierBills`
  - `purchases`
  - `supplierPayments`
  - `purchaseFlow.bills`
- Newly added suppliers appear in Supplier SOA immediately after save.
- Newly added suppliers with no purchases/payments show no transactions and zero totals/balance.
- Supplier opening balance still appears as an opening row.
- Synthetic `OPEN-*` supplier bills are skipped in SOA when supplier openingBalance already exists, avoiding double counting.
- Purchases continue to appear as Credit.
- Supplier payments continue to appear as Debit.
- Closing balance continues to use: previous balance + credit - debit.

## Service worker cache version bump

- Old: `axtor-pos-cloud-static-demo-v14-supplier-soa-20260618`
- New: `axtor-pos-cloud-static-demo-v15-inventory-warehouse-soa-20260618`

## Static asset query-string bump

- Old: `v=20260618-supplier-soa1`
- New: `v=20260618-inventory-warehouse-soa2`

## Syntax check results

Executed successfully:

```bash
node --check demo-static/js/core-data.js
node --check demo-static/js/app-data.js
node --check demo-static/js/axtor-fixes.js
node --check demo-static/js/retail-advanced.js
node --check demo-static/sw.js
```

All checked files passed syntax validation.

## Browser harness QA results

A headless Chromium harness was used with a minimal Inventory DOM and the real `core-data.js` + `axtor-fixes.js` scripts.

Inventory harness verified:

- Stock Count search input was created.
- Stock Transfer search input was created.
- Warehouse Save button was created.
- Google Maps iframe was created.
- Transfer number auto-generated as `TRF-1001`.
- SKU `EP-PR-4L` was added to Stock Count sheet through search/Enter.
- New warehouse `Test Paint Warehouse` saved to `axtorAdvancedDemoDB.warehouses`.
- Google Maps open link updated to the saved warehouse address.
- SKU `AX-2K-101` transfer posted successfully.
- `stockTransfers` received one transfer record.
- `stockMovements` received paired transfer in/out movement rows.

Supplier SOA harness verified:

- New supplier `Test Paint Supplier` saved to `axtorAdvancedDemoDB.suppliers`.
- Supplier SOA dropdown included the new supplier.
- Running SOA for that new supplier showed “No transactions found for this supplier/date range.”
- Debit total = `QAR 0`.
- Credit total = `QAR 0`.
- Closing balance = `QAR 0`.

## Manual QA checklist to repeat in browser

### Inventory Stock Count

1. Open `inventory.html`.
2. Go to Stock Count tab.
3. Type product name, SKU, or barcode.
4. Confirm suggestions appear.
5. Press Enter and confirm first/exact product adds to count sheet.
6. Click a suggestion and confirm it adds.
7. Edit Counted Qty and confirm Difference updates live.
8. Click Approve / Post Stock Count.
9. Confirm product stock updates in localStorage.
10. Confirm stock count session and movement records are saved.
11. Confirm recommended products appear and “Add to count” works.

### Inventory Warehouse + Map

1. Open `inventory.html`.
2. Go to Warehouses tab.
3. Add warehouse name, branch/location, address, contact, phone, status, and opening value.
4. Save warehouse.
5. Confirm it appears in the warehouse table.
6. Confirm it is saved in `axtorAdvancedDemoDB.warehouses`.
7. Confirm map preview and “Open in Google Maps” link use the warehouse address.
8. Confirm Stock Transfer warehouse dropdowns update.

### Inventory Stock Transfer

1. Open `inventory.html`.
2. Go to Stock Transfer tab.
3. Type product name/SKU/barcode.
4. Confirm suggestions appear.
5. Select product by click or Enter.
6. Select different From/To warehouses.
7. Enter Qty.
8. Click Post Transfer.
9. Confirm transfer record is saved.
10. Confirm same warehouse, invalid qty, and insufficient stock are blocked.
11. Confirm transfer history shows the posted transfer.

### Purchase Supplier SOA

1. Open `purchase.html`.
2. Add a new supplier.
3. Go to Supplier SOA.
4. Confirm the new supplier appears in the dropdown.
5. Run SOA.
6. Confirm zero debit, zero credit, zero closing balance when no transactions exist.
7. Save a purchase for that supplier.
8. Run SOA and confirm purchase appears as Credit.
9. Pay the supplier partially.
10. Run SOA and confirm payment appears as Debit and balance decreases.

## Regression QA notes

The implementation is additive and defensive:

- No backend, build tool, framework, or new localStorage key was added.
- Existing `axtorAdvancedDemoDB` remains the only app data store.
- Sales Invoice / Quotation / Delivery Note logic was not changed.
- Saved Invoices search/resume/delete draft logic was not changed.
- New Purchase supplier/product search logic was preserved.
- Supplier Payable payment allocation was preserved.
- Inventory Stock Adjustment product search remains in `app-data.js` and still uses the existing suggestion UI.
- Default green-glass theme and Retro POS theme CSS were not redesigned or removed.
