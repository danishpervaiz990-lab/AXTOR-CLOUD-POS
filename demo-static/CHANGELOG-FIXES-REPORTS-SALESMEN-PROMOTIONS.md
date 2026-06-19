# Axtor POS Cloud — Reports, Salesmen & Promotions Fix

## Changed files

- `demo-static/reports.html`
  - Rebuilt the report module layout using the existing green-glass card style.
  - Added stable report card IDs and a real filter panel.
  - Added live preview table, summary cards, Copy Report, Reset Filters, Apply Filters and Export PDF buttons.

- `demo-static/promotions.html`
  - Added `js/axtor-fixes.js` script include so the final promotion patch loads on GitHub Pages.

- `demo-static/js/axtor-fixes.js`
  - Added final functional patch for:
    - Report filters and report previews.
    - Salesmen list Edit / Activate / Deactivate / View / Set Target actions.
    - Sales target and editable commission tier saving.
    - Promotion add/edit/activate/deactivate/delete flow.
  - Added safe localStorage migration for demo expenses, branches, product costs and invoice branch/balance fields without wiping existing data.
  - Kept all data in the existing `axtorAdvancedDemoDB` localStorage key.

- `demo-static/sw.js`
  - Bumped service worker cache version to force GitHub Pages/browser refresh.

## Reports fixed

Supported report cards now render a preview and apply filters:

- Profit & Loss Report
- Daily Sale Report
- Sale Report by Products
- Sale Report by Customer
- Sales Return Report
- Stock Valuation Report
- Purchase Report
- Tax Report
- Trial Balance demo
- Balance Sheet demo
- Expense Report
- General Ledger Report
- Salesman Commission Report
- Customer Profit/Loss Report

Filters supported where relevant:

- Today / This week / This month / This year / Custom date range
- Month
- Year
- Branch
- Customer
- Product
- Supplier
- Salesman

## Salesmen fixed

- Salesmen list now renders from localStorage.
- Edit opens the modal and saves changes.
- Activate / Deactivate updates status and active dropdown eligibility.
- View opens current month performance and invoice list.
- Set Target opens target modal.
- Commission tiers can be added/removed and saved.
- Same salesman/month target updates instead of duplicating.

## Promotions fixed

- Added full Add / Edit Promotion form.
- Duplicate promotion codes are blocked case-insensitively.
- Promotions save to localStorage `promotions` inside `axtorAdvancedDemoDB`.
- List actions now work: Edit, Activate/Deactivate, Delete.
- Coupon validation checks active, date range and code.

## QA performed

JavaScript syntax checks passed:

- `demo-static/js/main.js`
- `demo-static/js/app-data.js`
- `demo-static/js/retail-advanced.js`
- `demo-static/js/axtor-fixes.js`
- `demo-static/js/invoice-templates.js`
- `demo-static/js/charts.js`
- `demo-static/sw.js`
