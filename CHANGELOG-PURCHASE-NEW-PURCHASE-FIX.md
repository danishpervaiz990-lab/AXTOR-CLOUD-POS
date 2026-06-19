# Axtor POS Cloud — Purchase New Purchase Fix

## Changed files

- `demo-static/js/axtor-fixes.js`
  - Fixed the New Purchase enhancement so it uses the stable core migration/data helper (`migrateCore()`) instead of relying on purchase-side calls that could fail before supplier/product UI was populated.
  - Fixed the Supplier dropdown on `purchase.html#new-purchase` so it is populated from `data.suppliers`, `data.supplierBills`, and saved purchases inside the existing `axtorAdvancedDemoDB` localStorage key.
  - Added selection persistence for the New Purchase supplier dropdown using `localStorage.axtorSelectedPurchaseSupplier`.
  - Fixed Product Search on the New Purchase page so it searches active localStorage products by product name, product alias, SKU, barcode, category, brand, and status.
  - Added visible Product Suggestions when the search box is empty. Suggestions come from existing saved products and show product name, SKU, barcode, category, stock, and purchase cost.
  - Added a native datalist (`#purchaseProductSuggestionList`) to the purchase search input for browser autocomplete suggestions.
  - Added Enter-key support: pressing Enter in the purchase product search adds the first visible matching product suggestion.
  - Preserved the existing Save Purchase flow: saved purchase, supplier bill, supplier payable, stock movement, and product stock-in all continue to use the same localStorage schema.

- `demo-static/js/app-data.js`
  - Bumped service worker registration query to `sw.js?v=20260617-purchasefix1` so browsers/GitHub Pages pick up the latest static JS.

- `demo-static/sw.js`
  - Bumped service worker cache version to `axtor-pos-cloud-static-demo-v12-purchasefix-20260617`.

- `demo-static/*.html`
  - Updated static asset query strings from `v=20260617-bugfixpass1` to `v=20260617-purchasefix1` to reduce stale-cache/Ctrl+F5 issues.

## Design decisions

### Supplier dropdown

The supplier dropdown is kept as a normal Bootstrap `<select>` in the existing New Purchase layout. It now fills from existing static-demo data sources instead of staying empty. No backend, build step, layout redesign, or new schema migration was added.

### Product suggestions

The purchase search box now shows product suggestions immediately when empty, because the user needs a cashier-style/add-to-purchase workflow similar to the sales side. Search results and suggestions use the same `data-purchase-add-product` action, so clicking a suggestion or pressing Enter adds the item to the purchase list consistently.

## Syntax checks performed

```text
node --check demo-static/js/axtor-fixes.js
# demo-static/js/axtor-fixes.js: OK

node --check demo-static/js/app-data.js
# demo-static/js/app-data.js: OK

node --check demo-static/sw.js
# demo-static/sw.js: OK
```

## Browser workflow QA performed

QA was executed in a Chromium DOM harness using the real `demo-static/purchase.html` file and real local JS loaded in page order. The sandbox blocks direct `http://127.0.0.1` / `file://` navigation, so the harness loaded the HTML/JS inline into Chromium and provided browser-compatible mocked `localStorage` / `sessionStorage` under the existing `axtorAdvancedDemoDB` key.

### 1. Supplier dropdown on New Purchase

Steps:

1. Opened `purchase.html` in Chromium harness.
2. Waited for the delayed `initPurchaseSideFixes()` enhancement to run.
3. Checked `#purchaseSupplier option` values.
4. Changed supplier from the first option to the second option.
5. Confirmed the selected supplier remained available before saving.

Result:

- No page errors occurred.
- Supplier options appeared: `Starlux Paints`, `Diamond Paints`.
- Supplier dropdown was usable on the New Purchase page.

### 2. Product suggestions before typing

Steps:

1. Opened `purchase.html` in Chromium harness.
2. Left `#purchaseProductSearch` empty.
3. Checked `#purchaseSearchResults`.
4. Counted visible `[data-purchase-add-product]` suggestion buttons.

Result:

- Suggestions header displayed: `Product suggestions`.
- 5 product suggestion buttons appeared from localStorage demo products.

### 3. Product search and add-to-purchase

Steps:

1. Typed `AX` into `#purchaseProductSearch`.
2. Triggered the input event.
3. Confirmed search results filtered to matching products.
4. Pressed Enter in the search field.
5. Checked `#purchaseItemsBody`.

Result:

- Search results displayed with matching product rows.
- 2 filtered Add buttons appeared for the `AX` search.
- Pressing Enter added the first matching product to the purchase list.
- Purchase table changed from the empty-state row to a real product row.

### 4. Save Purchase end-to-end

Steps:

1. Selected `Diamond Paints` in the supplier dropdown.
2. Added one product to the purchase list from the search/suggestions flow.
3. Clicked `Save Purchase`.
4. Inspected `localStorage.axtorAdvancedDemoDB`.
5. Confirmed purchase, supplier bill, and stock movement were created.

Result:

- Saved purchase number: `PUR-0001`.
- Saved supplier: `Diamond Paints`.
- Purchase item count: `1`.
- Purchase total: `99.75`.
- Matching supplier bill was created: `PUR-0001`.
- Stock movements increased by `1`.

## Notes

- No branding, theme, sidebar, topbar, layout direction, filenames, backend, Node app, package file, or build step was added or changed.
- Default green-glass theme and optional Retro POS theme were preserved.
- All purchase-side data remains inside the existing `axtorAdvancedDemoDB` localStorage key.
- Changes are additive and preserve the current static demo data structure.
