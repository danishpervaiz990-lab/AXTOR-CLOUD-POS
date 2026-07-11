# Axtor POS Cloud — Static Demo Fixes

## 16 Jun 2026 — GitHub Pages static fixes

Fixed the 11 requested demo issues without changing the branding, green-glass theme, sidebar/topbar layout, filenames, or static HTML/CSS/JS architecture.

### Changed files

- `demo-static/js/axtor-fixes.js` — new static demo enhancement layer for missing localStorage features.
- `demo-static/js/app-data.js` — safely corrected Proceed Payment amount behavior so Amount Received no longer auto-fills invoice total.
- `demo-static/products.html` — loads the enhancement layer for product image upload, category creation, SKU/barcode actions, edit/delete actions, and industry fields.
- `demo-static/purchase.html` — loads supplier add/list/dropdown/SOA enhancements.
- `demo-static/setup.html` — loads industry persistence enhancements.
- `demo-static/sales.html` — loads payment amount, credit days, product image grid, and invoice due date enhancements.
- `demo-static/customer.html` — loads customer credit days and dynamic Customer SOA enhancements.
- `demo-static/salesmen.html` — keeps existing modal/list target logic active and loads shared migrations.
- `demo-static/reports.html` — loads functional report preview actions.
- `demo-static/terminal.html` — loads product image grid support for terminal fast products.
- `demo-static/index.html` and `demo-static/settings.html` — loads selected industry/migration support where useful.
- `demo-static/sw.js` — cache version bumped and `js/axtor-fixes.js` added to cache list.

### Fixed issues

1. Add New Product now supports product picture upload as base64/Data URL, thumbnails in product list, and product images in Sales and Terminal grids.
2. Purchase module now has Add Supplier form with localStorage save/update and supplier dropdown/list refresh.
3. Setup Wizard industry selection now persists and drives dynamic Product Add custom fields.
4. Product category creation is supported with duplicate checking and immediate dropdown refresh.
5. Product list now has Edit/Delete actions. Delete hides products from active grids while invoice history remains safe.
6. SKU Auto Generate, Barcode Generate, and scan/Enter confirmation behavior are enabled.
7. Salesmen target/list functionality remains wired through existing modal handlers and migrated data defaults.
8. Proceed Payment Amount Received now defaults to `0.00`; invoice total and balance remain separate, with optional Full Paid button.
9. Customer and New Sale credit days options support 30/60/90/120 days and invoice due-date saving.
10. Customer SOA now populates from localStorage customers and builds rows dynamically from opening balance, invoices, and payments.
11. Reports cards now open a localStorage-based report preview/table and print/export uses browser print.

### QA performed

- JavaScript syntax checks passed for:
  - `demo-static/js/main.js`
  - `demo-static/js/app-data.js`
  - `demo-static/js/retail-advanced.js`
  - `demo-static/js/invoice-templates.js`
  - `demo-static/js/charts.js`
  - `demo-static/js/axtor-fixes.js`
  - `demo-static/sw.js`

The project remains a static GitHub Pages demo. No backend or framework was added.
