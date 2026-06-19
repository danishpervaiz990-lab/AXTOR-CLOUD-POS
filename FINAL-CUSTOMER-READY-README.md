# Axtor POS Cloud — Final Customer-Ready Fresh Copy

This package is the final customer-ready static frontend version of Axtor POS Cloud.

## Purpose

This build starts like a brand-new company account for a subscription customer. It does not auto-load old demo customers, suppliers, invoices, purchases, stock movements, payments, shifts, counters, SOA history, or report data.

## Current technical mode

- Static frontend only
- Plain HTML, CSS, and JavaScript
- Bootstrap 5.3.3, Bootstrap Icons, Chart.js
- Data is stored in browser localStorage under `axtorAdvancedDemoDB`
- No backend or database server is included in this package
- No React, Vue, Vite, build tools, Node app, or package manager are required

## First customer setup

On first run, the system creates a fresh customer-ready localStorage structure and shows a setup banner:

> Welcome to Axtor POS Cloud. Complete setup to start your company.

The customer should complete setup before real use:

1. Company name and business details
2. Industry / business type
3. Tax / VAT setting
4. Branch name
5. Warehouse name
6. Owner/admin user
7. Counter setup
8. Products, customers, suppliers, and opening balances as needed

## Fresh data behavior

The first-run `axtorAdvancedDemoDB` starts with empty business records:

- customers
- suppliers
- products
- invoices
- purchases
- supplier bills
- customer payments
- supplier payments
- stock movements
- stock transfers
- stock counts
- shift records
- terminal cart
- held sales
- expenses
- reports/activity/audit history
- promotions
- salesman targets and payouts

Only neutral role users are kept for static mode compatibility:

- Owner / Owner
- Manager / Manager
- Cashier / Cashier
- Warehouse User / Warehouse User

Counters, branches, warehouses, products, customers, suppliers, invoices, and purchases are not preloaded.

## Reset to fresh customer copy

A safe reset utility is available:

```js
window.AxtorResetToFreshCustomer()
```

It asks for confirmation, clears local business data, resets invoice numbering, preserves theme preference, and reloads the app.

A Settings page card is also injected automatically:

> Reset to Fresh Customer Copy

Use this before handing the system to a new customer or before a clean test cycle.

## Optional demo data

Demo data does not auto-load. A tiny optional developer-only loader exists for presentation/testing:

```js
window.AxtorLoadDemoData()
```

Do not use it for customer handoff.

## Cache and hard refresh

The service worker cache was bumped to:

`axtor-pos-cloud-final-customer-ready-v17-20260618`

Static asset query strings were updated to:

`v=20260618-final-customer-ready1`

This prevents GitHub Pages/browser cache from serving the old demo-memory version.

## Phase 2 backend/database connection

When moving to Phase 2 production SaaS:

1. Keep this UI as the approved frontend reference.
2. Replace localStorage reads/writes with API calls gradually.
3. Use PostgreSQL + Prisma + Express/TypeScript backend from the Phase 2 blueprint.
4. Keep tenant/business isolation from day one.
5. Map `axtorAdvancedDemoDB` collections to backend tables during migration.
6. Keep this fresh-copy logic as the customer onboarding/default tenant seed behavior.
