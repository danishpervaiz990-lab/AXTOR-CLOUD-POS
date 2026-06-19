# Axtor POS Cloud — Alignment + Inventory Search Fix

Date: 2026-06-18

## Files changed

- `demo-static/sales.html`
- `demo-static/inventory.html`
- `demo-static/css/style.css`
- `demo-static/js/app-data.js`
- `demo-static/sw.js`
- `demo-static/*.html` asset query strings updated to `v=20260618-align-inventory1`
- `CHANGELOG-ALIGNMENT-INVENTORY-SEARCH-FIX.md`

## What was broken

1. Sales → New Sale → Current cart top controls were visually uneven. The Document Type, Customer, and Payment controls did not share a clean desktop row alignment and did not have consistent label/input spacing.
2. Inventory → Stock Adjustment had a plain Product / SKU input. It did not search existing products, did not show suggestions, and the Save Adjustment button was only a demo action instead of updating stock data.

## What was fixed

### Sales Current Cart alignment

- Added a narrow layout class to the Current cart meta row: `axtor-sale-meta-row`.
- Kept the same controls: Document Type, Customer, and Payment.
- Kept the same Sales Invoice / Quotation / Delivery Note / DN logic.
- Updated both the hardcoded `sales.html` row and the fallback row in `js/app-data.js` so edit/resume flows still create the same aligned layout if needed.
- Added CSS to keep labels and select heights consistent on desktop.
- Added responsive stacking behavior for tablet/mobile.
- Added Retro POS compatible suggestion/layout styling without changing the Retro theme itself.

### Inventory Stock Adjustment product search

- Added IDs and minimal UI to the Stock Adjustment form:
  - `stockAdjustmentDate`
  - `stockAdjustmentWarehouse`
  - `stockAdjustmentType`
  - `stockAdjustmentProductSearch`
  - `stockAdjustmentProductSuggestions`
  - `stockAdjustmentQty`
  - `saveStockAdjustmentBtn`
  - `stockLedgerBody`
- Added product search from the existing `axtorAdvancedDemoDB` products array.
- Search now supports product name, SKU, barcode, category, and brand when available.
- Added visible suggestions with product name, SKU, barcode when available, current stock, category, and brand when available.
- Clicking a suggestion selects that product.
- Pressing Enter selects the first matching product.
- Save Adjustment now validates selected product and Qty > 0.
- Increase Stock updates the selected product stock.
- Decrease Stock updates the selected product stock and blocks stock below zero unless the existing negative-stock setting allows it.
- Saves a stock movement row into the existing `stockMovements` collection inside `axtorAdvancedDemoDB`.
- Stock Ledger now renders the latest `stockMovements` rows dynamically.
- Successful save resets product and qty fields.
- Toast feedback added for product selected, adjustment saved, product not found, invalid quantity, and insufficient stock.

## Service worker cache version bump

- Old cache: `axtor-pos-cloud-static-demo-v12-purchasefix-20260617`
- New cache: `axtor-pos-cloud-static-demo-v13-align-inventory-20260618`

## Static asset query-string bump

- Old query string: `v=20260617-purchasefix1`
- New query string: `v=20260618-align-inventory1`
- Updated all `demo-static/*.html` local CSS/JS references.
- Updated service worker registration in `js/app-data.js` to `sw.js?v=20260618-align-inventory1`.

## Syntax check results

```bash
node --check demo-static/js/app-data.js        # PASS
node --check demo-static/js/axtor-fixes.js     # PASS
node --check demo-static/js/retail-advanced.js # PASS
node --check demo-static/sw.js                 # PASS
```

## Browser / harness QA results

Headless Chromium was available in the container. Direct navigation to local/file URLs was blocked by the container's Chromium administrator policy, so the browser QA was run by loading the fixed pages as inline browser fixtures with local scripts/CSS and storage shims. This still executed the real project JavaScript in Chromium.

### Sales alignment QA

- Opened `sales.html` fixture and activated `#new-sale`.
- Confirmed `#newSaleMetaRow` contains `axtor-sale-meta-row`.
- Desktop width: Document Type, Customer, and Payment select tops aligned and select heights matched.
- Mobile width: controls stacked vertically with full-width selects.
- Added a product to cart successfully.
- Changed Document Type to Quotation successfully.
- Changed Payment to Card successfully.
- No browser JS errors captured in the harness.

### Inventory product search QA

- Opened `inventory.html` fixture.
- Searched `AX-2K`; product suggestion appeared for `2K Solid Paint` / `AX-2K-101`.
- Clicked the suggestion and product was selected.
- Increased stock by 5: stock changed from 128 to 133.
- Pressed Enter on SKU search and selected first match.
- Decreased stock by 3: stock changed from 133 to 130.
- Attempted to decrease by 999999: blocked; stock remained 130.
- Stock movement records were created and Stock Ledger rendered the new rows.
- No browser JS errors captured in the harness.

### Purchase / Supplier SOA smoke QA

- Opened `purchase.html` fixture.
- Confirmed New Purchase tab still exists.
- Confirmed Supplier SOA tab still exists.
- Confirmed Pay Supplier tab still exists.
- Confirmed New Purchase product search enhancement still initializes.
- Confirmed Supplier payable search still initializes.
- No Supplier SOA code was rewritten.
- No browser JS errors captured in the harness.

## Notes

- No backend, Node app, package manager, build tool, React, Vue, or Vite was added.
- All data remains inside the existing `axtorAdvancedDemoDB` localStorage key.
- Supplier SOA logic was not changed.
- New Purchase supplier/product search logic was not changed.
- Saved Invoices search/resume/delete draft logic was not changed.
