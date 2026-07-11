# Axtor POS Cloud — Purchase + Supplier Payable Fix QA Report

## Scope
Fixed only purchase-side functionality in the static `demo-static/` app.

## Changed files
- `demo-static/js/axtor-fixes.js`
  - Added New Purchase localStorage flow.
  - Added purchase product search by name, SKU, barcode, and category.
  - Added purchase cart line calculation for quantity, cost, discount, tax, subtotal, and grand total.
  - Added purchase save logic that creates a `PUR-0001` style purchase, supplier bill/payable record, purchaseFlow bill entry, stock-in movement, and activity entry.
  - Added Saved Purchases list with view/delete for unpaid purchases.
  - Added Supplier Payable search/filter and fixed payable payment allocation/status updates.
- `demo-static/purchase.html`
  - Cache-bust query updated for this page so the new purchase/payable fix JS loads without Ctrl+F5.
- `demo-static/js/app-data.js`
  - Service worker registration query updated for the purchase fix cache version.
- `demo-static/sw.js`
  - Cache name bumped to `v10-purchasefix-20260617`.

## QA performed
1. JavaScript syntax checks passed for:
   - `js/core-data.js`
   - `js/app-data.js`
   - `js/retail-advanced.js`
   - `js/main.js`
   - `js/theme-switcher.js`
   - `js/invoice-templates.js`
   - `js/axtor-fixes.js`
2. Runtime smoke check passed: core data, app data, retail advanced, main, theme switcher, invoice templates, and axtor fixes loaded in a browser-like localStorage stub without runtime errors.
3. New Purchase flow reviewed:
   - Supplier dropdown populated from existing localStorage supplier/payable data.
   - Product search uses existing product data and matches name, SKU, barcode, category, brand, and status.
   - Clicking a product adds it to the purchase cart; adding the same product increases quantity.
   - Quantity, cost, discount, tax %, subtotal, discount total, tax total, and grand total recalculate instantly.
   - Save Purchase validates cart/supplier, creates `PUR-0001` style bill numbers, saves to `purchases`, `supplierBills`, and `purchaseFlow.bills`.
   - Stock quantity increases and stock movement records are added.
4. Supplier Payable flow reviewed:
   - Search bar added above payable invoice table.
   - Search matches purchase bill number, supplier name, phone, amount, date, due date, and payment status.
   - Payment allocation respects checked rows and pay-now amounts.
   - Partial/full payments update supplier bill paid/balance/status.
   - Fully paid bills move to paid status and disappear from open payable search.
   - Supplier payment history and aging/list summaries update from localStorage.
5. Regression checks:
   - Sales-side files and invoice/DN/quotation logic were not modified.
   - Green-glass and Retro POS theme files were not modified.
   - No external dependencies or backend/API calls were added.
