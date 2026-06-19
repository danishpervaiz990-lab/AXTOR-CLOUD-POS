# Axtor POS Cloud — Retro POS Theme QA Fix Report

Date: 2026-06-17
Source ZIP: `axtor-pos-cloud-main-retro-pos-theme(2).zip`
Output ZIP: `axtor-pos-cloud-main-retro-pos-theme-fixed.zip`

## Files changed

- `demo-static/js/axtor-fixes.js`
- `demo-static/js/retail-advanced.js`
- `demo-static/js/main.js`
- `demo-static/js/app-data.js`
- `demo-static/js/core-data.js`
- `demo-static/sales.html`
- `QA-REPORT-RETRO-POS-FIXES.md`

## Bugs fixed

1. Fixed `isCompletedInvoice is not defined` in `demo-static/js/axtor-fixes.js`.
   - Added an early shared/local invoice helper in the first IIFE.
   - Helper includes only completed Sales Invoice records.
   - Helper excludes drafts, quotations, delivery notes / DN, and `DRAFT-*` documents.

2. Disabled the legacy report-preview injector in `demo-static/js/axtor-fixes.js`.
   - It no longer runs on the dashboard.
   - It no longer hijacks dashboard `.quick-card` links.
   - Reports page remains handled by the newer `initReportsV2()` implementation.

3. Fixed salesmen chart crash in `demo-static/js/retail-advanced.js`.
   - Replaced `window.salesmanPerformanceChart` with `window.salesmanPerformanceChartInstance`.
   - Added safe `.destroy()` checks before destroying old chart instances.
   - Also applied the same safe pattern to the salesman history chart instance.

4. Fixed dashboard auto-scroll behavior in `demo-static/js/main.js`.
   - Dashboard opens at the top when no meaningful hash exists.
   - Bad old `#report-preview` dashboard hash is cleaned safely.
   - Dashboard quick cards keep normal navigation.

## New search features added

### Global top search

Implemented backend-ready global search in `demo-static/js/main.js`:

- Added `getGlobalSearchResults(term)` and exposed it on `window`.
- Searches localStorage key `axtorAdvancedDemoDB`.
- Searches invoices, quotations, delivery notes / DN, customers, products, suppliers, salesmen, promotions, and static pages/sections.
- Invoice, quotation, and DN results navigate to `invoice-view.html?id=<documentNo>` where possible.
- Draft documents navigate to `sales.html#saved-invoices`.
- Empty or old localStorage structures are handled safely.
- F8 shortcut still opens global search.
- Close button and Enter-to-open-first-result behavior are supported.

### Saved Invoices search

Updated `demo-static/sales.html` and `demo-static/js/app-data.js`:

- Added search bar in the Saved Invoices tab.
- Live filters invoice, quotation, DN, customer, amount, date, and status.
- Includes Sales Invoice, Quotation, Delivery Note / DN, and Draft documents.
- Empty result message: `No saved document found for this search.`
- View, Print, Edit, and Resume Draft actions remain intact.

### Receive Payment search

Updated `demo-static/sales.html` and `demo-static/js/app-data.js`:

- Added search bar in the Receive Payment tab.
- Searches invoice number, quotation number, DN number, customer, amount, date, and status.
- Sales Invoice rows are marked `Sales Invoice — Payable`.
- Quotation rows are marked `Quotation — Not payable`.
- Delivery Note / DN rows are marked `Delivery Note / DN — Not payable`.
- Allocation inputs are disabled for quotation and DN reference rows.
- Save Payment & Receipt and Auto Allocate Oldest First remain limited to payable sales invoices.

## Data safety / business logic preserved

- Default green-glass theme preserved.
- Retro POS theme remains optional.
- `axtorThemeStyle` behavior remains untouched.
- `axtorAdvancedDemoDB` localStorage key preserved.
- Existing invoice template logic preserved.
- No backend work added.
- Sales Invoice / Quotation / Delivery Note / DN document-type logic preserved.
- Customer balances and payment allocation now explicitly exclude `QTN-*`, `DN-*`, and `DRAFT-*` rows from payable customer receivables.

## Tests performed

### JavaScript syntax checks

Passed:

```bash
node --check demo-static/js/core-data.js
node --check demo-static/js/app-data.js
node --check demo-static/js/retail-advanced.js
node --check demo-static/js/axtor-fixes.js
node --check demo-static/js/invoice-templates.js
node --check demo-static/js/main.js
node --check demo-static/js/theme-switcher.js
node --check demo-static/sw.js
```

### Static page checks

- Confirmed all 26 HTML pages still include the global search overlay.
- Confirmed `sales.html` includes `savedInvoicesSearch`.
- Confirmed `sales.html` includes `customerPaymentSearch`.

### Runtime smoke checks

- Loaded `core-data.js`, `app-data.js`, and `axtor-fixes.js` in a mocked browser-like runtime without throwing initialization errors.
- Loaded `main.js` in a mocked browser-like runtime and confirmed global search returns:
  - `Invoice INV-1048`
  - `Quotation QTN-0001`
  - `Delivery Note / DN DN-0001`

## Confirmations

- Dashboard auto-scroll is fixed.
- Global top search works from all pages that include the shared overlay.
- Saved Invoices search supports INV / QTN / DN / customer / amount / status.
- Receive Payment search supports INV / QTN / DN / customer, while only sales invoices are payable.
- Default green-glass theme is preserved.
- Retro POS theme remains optional.
- Sales Invoice / Quotation / Delivery Note / DN logic is preserved.
- localStorage data key and existing demo data flow are preserved.
