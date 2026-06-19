# Changelog — Final Customer-Ready Fresh Copy

## Build name

`axtor-pos-cloud-final-customer-ready-fresh-copy.zip`

## Goal

Convert the latest working static Axtor POS Cloud build into a final customer-ready fresh copy. A subscription customer should open the system as a brand-new empty company account, not as an old demo system.

## Files changed

- `demo-static/js/core-data.js`
- `demo-static/js/app-data.js`
- `demo-static/js/axtor-fixes.js`
- `demo-static/js/retail-advanced.js`
- `demo-static/js/invoice-templates.js`
- `demo-static/js/main.js`
- `demo-static/css/style.css`
- `demo-static/sw.js`
- `demo-static/*.html`
- `FINAL-CUSTOMER-READY-README.md`
- `demo-static/FINAL-CUSTOMER-READY-README.md`
- `CHANGELOG-FINAL-CUSTOMER-READY-FRESH-COPY.md`
- `demo-static/CHANGELOG-FINAL-CUSTOMER-READY-FRESH-COPY.md`

## What was broken / risky

- The shared localStorage data layer still merged old demo seed data on first load.
- Old demo customers, products, invoices, supplier bills, shift records, counters, warehouses, promotions, loyalty points, and report data could return after reset/reload.
- Secondary modules still had demo fallbacks such as sample suppliers, customers, counters, staff names, and invoice numbers.
- Customer-facing UI still said “Live demo mode” and “Static HTML / CSS / JS”.
- Reset behavior removed the DB but allowed seed data to come back.

## What was fixed

### Fresh customer data mode

`core-data.js` now creates a clean customer-ready DB structure with:

- `_schemaVersion: 5`
- `_mode: "customer-ready"`
- `_freshCustomerReady: true`
- `setupCompleted: false`
- empty business arrays
- neutral user roles only
- document counters starting from 1
- purchase counter starting from 1
- no default counters, warehouses, products, customers, suppliers, invoices, payments, shifts, SOA, stock history, reports, or promotions

### Demo seed prevention

The previous auto-merge of demo seed data was removed from runtime initialization. Old demo data is no longer reintroduced on reload.

### Reset utility

Added:

```js
window.AxtorResetToFreshCustomer()
```

Behavior:

- confirms before reset
- clears local business data
- removes old draft/session keys
- removes old company/user/demo-role keys
- resets invoice numbering to fresh values
- preserves theme preference
- reloads into setup/onboarding state

### Settings reset button

A Settings page card is injected:

`Reset to Fresh Customer Copy`

### First-run onboarding

A non-blocking banner is injected until setup/company details exist:

`Welcome to Axtor POS Cloud. Complete setup to start your company.`

### Optional demo data separation

Demo data does not auto-load. A developer-only optional loader exists:

```js
window.AxtorLoadDemoData()
```

### Customer-ready UI labels

- `Live demo mode` changed to `Customer Ready Mode`
- `Static HTML / CSS / JS` changed to `Local Browser Mode`
- top user chip changed from old personal demo name to `Owner`
- obvious old demo names removed from customer-facing HTML/JS runtime areas

### Cache/versioning

Service worker cache bumped to:

`axtor-pos-cloud-final-customer-ready-v17-20260618`

Static asset query strings bumped to:

`v=20260618-final-customer-ready1`

## Demo memory removed from runtime first-run DB

The fresh DB starts with empty arrays for:

- customers
- suppliers
- products
- invoices
- customerCreditInvoices
- supplierBills
- customerPayments
- supplierPayments
- purchases
- purchaseReturns
- stockMovements
- stockTransfers
- stockCountSessions
- shiftRecords
- terminalCart
- heldSales
- expenses
- returnsExchanges
- approvalRequests
- approvalHistory
- auditEvents
- loyaltyPoints
- loyaltyHistory
- commissionPayouts
- salesmanTargets
- salesmen
- promotions
- activity
- syncQueue
- branches
- warehouses
- counters
- productCategories

## Fresh customer structure created

Neutral runtime defaults:

```js
{
  _schemaVersion: 5,
  _mode: "customer-ready",
  _freshCustomerReady: true,
  setupCompleted: false,
  selectedIndustry: "",
  documentCounters: { invoice: 1, quotation: 1, delivery_note: 1 },
  purchaseCounter: 1,
  currentShift: null,
  terminalSession: null,
  userRoles: [
    { user: "Owner", role: "Owner" },
    { user: "Manager", role: "Manager" },
    { user: "Cashier", role: "Cashier" },
    { user: "Warehouse User", role: "Warehouse User" }
  ]
}
```

## Syntax check results

Passed:

```bash
node --check demo-static/js/core-data.js
node --check demo-static/js/app-data.js
node --check demo-static/js/axtor-fixes.js
node --check demo-static/js/retail-advanced.js
node --check demo-static/js/main.js
node --check demo-static/js/theme-switcher.js
node --check demo-static/js/invoice-templates.js
node --check demo-static/sw.js
```

## Static/runtime QA results

Passed with Node VM localStorage harness:

- Fresh DB creates with zero customers
- Fresh DB creates with zero products
- Fresh DB creates with zero suppliers
- Fresh DB creates with zero invoices
- Fresh DB creates with zero purchases
- Fresh DB creates with zero counters
- Fresh DB creates with zero branches
- Fresh DB creates with zero warehouses
- Neutral users only: Owner, Manager, Cashier, Warehouse User
- Old schema v4 DB is purged into fresh customer-ready schema v5
- Old `companySettings` is cleared during fresh conversion/reset
- Invoice numbering resets to `0001`

## Browser QA note

Chromium/Playwright browser navigation was attempted using both `file://` and `http://127.0.0.1` served locally. This container blocked navigation with:

`net::ERR_BLOCKED_BY_ADMINISTRATOR`

Because of that environment restriction, full browser-click QA could not be completed inside this container. The browser QA checklist below should be run in Chrome/Edge after extracting the ZIP.

## Manual browser QA checklist

1. Clear browser localStorage.
2. Open `demo-static/index.html`.
3. Confirm no old customer/supplier/invoice/purchase/demo data appears.
4. Confirm setup/onboarding alert appears.
5. Go to Setup Wizard.
6. Add company/industry/tax/branch/warehouse/counter/user settings.
7. Add first product.
8. Add first customer.
9. Create first sale invoice.
10. Confirm saved invoice appears.
11. Add first supplier.
12. Create first purchase.
13. Confirm supplier bill appears.
14. Run Supplier SOA.
15. Open shift with cashier/counter.
16. Open terminal session.
17. Complete terminal sale.
18. Confirm invoice includes cashier/counter metadata.
19. Use Settings reset button.
20. Confirm system returns to clean fresh state.
21. Hard refresh normally and confirm old demo memory does not return.

## Regression areas preserved

Code paths were kept for:

- Sales Invoice / Quotation / Delivery Note / DN
- Saved Invoices search/resume/delete draft
- New Purchase supplier dropdown/product search/suggestions
- Supplier Payable search/payment allocation
- Supplier SOA calculation
- Inventory Stock Count search/suggestions
- Warehouse Map preview
- Stock Transfer and Stock Adjustment search
- Shift / Closing counter management
- Terminal cashier/counter session
- Terminal sale metadata
- Purchase Authorized Person
- Default green-glass theme
- Optional Retro POS theme
- PWA cache/version update

