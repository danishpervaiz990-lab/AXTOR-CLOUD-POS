# Legacy Grocery Inventory

## Audit identity

- Repository: `danishpervaiz990-lab/AXTOR-CLOUD-POS`
- Baseline branch: `main`
- Baseline commit: `f52e2ff10caf24c314fe2fca83dd8fc5f4f5b374`
- Backup branch: `backup/pre-grocery-rebuild-2026-08-06`
- Rebuild branch: `feat/grocery-total-rebuild`
- Audit date: 2026-08-06

## Current delivery topology

The legacy Grocery frontend is not a self-contained application in `main`. `main` contains `demo-static/api/grocery-asset.js`, an Edge gateway that fetches runtime assets from the `frontend-grocery` branch and injects additional Grocery scripts. This makes the active Grocery implementation span multiple branches and means that deleting only files in `main` would not retire Grocery.

The shared backend is maintained on the `backend` branch and contains Grocery-specific routes, middleware, services, reports, QA scripts, tests and Prisma coupling alongside other industries.

## Legacy Grocery frontend surface

The branch comparison `main...frontend-grocery` identified the following active Grocery-only groups.

### Pages

- `demo-static/grocery-dashboard.html`
- `demo-static/grocery-terminal.html`
- `demo-static/grocery-products.html`
- `demo-static/grocery-categories.html`
- `demo-static/grocery-batches.html`
- `demo-static/grocery-expiry.html`
- `demo-static/grocery-inventory.html`
- `demo-static/grocery-receiving.html`
- `demo-static/grocery-waste.html`
- `demo-static/grocery-recalls.html`
- `demo-static/grocery-sales.html`
- `demo-static/grocery-purchases.html`
- `demo-static/grocery-customers.html`
- `demo-static/grocery-suppliers.html`
- `demo-static/grocery-promotions.html`
- `demo-static/grocery-loyalty.html`
- `demo-static/grocery-expenses.html`
- `demo-static/grocery-accounts.html`
- `demo-static/grocery-shifts.html`
- `demo-static/grocery-labels.html`
- `demo-static/grocery-notifications.html`
- `demo-static/grocery-settings.html`
- `demo-static/grocery-users.html`
- `demo-static/grocery-reports.html`
- `demo-static/session-handoff.html`

### Runtime and adapters

- `demo-static/js/grocery-app.js`
- `demo-static/js/grocery-branding-runtime.js`
- `demo-static/js/grocery-categories-v3.js`
- `demo-static/js/grocery-customer-payments.js`
- `demo-static/js/grocery-customers-page.js`
- `demo-static/js/grocery-dashboard-postgres.js`
- `demo-static/js/grocery-document-routing.js`
- `demo-static/js/grocery-dom-contract.js`
- `demo-static/js/grocery-finance-reports.js`
- `demo-static/js/grocery-financial-movement-reports.js`
- `demo-static/js/grocery-inventory-integrity.js`
- `demo-static/js/grocery-invoice-print-reconciliation.js`
- `demo-static/js/grocery-managed-modules.js`
- `demo-static/js/grocery-masterdata-v2.js`
- `demo-static/js/grocery-navigation-ui.js`
- `demo-static/js/grocery-operational-postgres.js`
- `demo-static/js/grocery-operations-pack.js`
- `demo-static/js/grocery-operations-v2.js`
- `demo-static/js/grocery-print-settings-backend.js`
- `demo-static/js/grocery-production-readiness.js`
- `demo-static/js/grocery-purchase-receiving.js`
- `demo-static/js/grocery-receiving-waste-api.js`
- `demo-static/js/grocery-report-shell.js`
- `demo-static/js/grocery-report-sync.js`
- `demo-static/js/grocery-returns-reconciliation.js`
- `demo-static/js/grocery-runtime-fixes-v1.js`
- `demo-static/js/grocery-sales-analytics.js`
- `demo-static/js/grocery-tenant-locale.js`
- `demo-static/js/grocery-terminal-reconciliation.js`
- `demo-static/js/grocery-transaction-guard.js`
- `demo-static/css/grocery-app.css`

### Tests, CI and deployment

- `.github/workflows/frontend-grocery-ci.yml`
- `demo-static/tests/grocery-branding-financial-movement.test.mjs`
- `tests/grocery-customer-payments.test.cjs`
- `tests/grocery-dashboard-postgres.test.cjs`
- `tests/grocery-finance-reports.test.cjs`
- `tests/grocery-frontend.test.cjs`
- `tests/grocery-inventory-integrity.test.cjs`
- `tests/grocery-invoice-print.test.cjs`
- `tests/grocery-locale-coverage.test.cjs`
- `tests/grocery-locale-currency.test.cjs`
- `tests/grocery-locale-money-adapters.test.cjs`
- `tests/grocery-purchase-receiving.test.cjs`
- `tests/grocery-release-candidate.test.cjs`
- `tests/grocery-reports-postgres.test.cjs`
- `tests/grocery-returns-refunds.test.cjs`
- `tests/grocery-terminal-reconciliation.test.cjs`
- `demo-static/vercel.json`
- `docs/grocery-frontend-release.md`

## Legacy Grocery backend surface

The branch comparison `main...backend` identified Grocery-specific backend files embedded in the shared backend.

### Routes and middleware

- `backend/src/routes/grocery.routes.ts`
- `backend/src/routes/grocery-masterdata.routes.ts`
- `backend/src/middleware/grocery-sale-validation.middleware.ts`
- Grocery branches inside `backend/src/app.ts`, industry guards, permission middleware and tenant middleware

### Services and reports

- `backend/src/services/grocery-finance-reports.service.ts`
- `backend/src/services/grocery-reports.service.ts`
- `backend/src/services/grocery-sales-analytics.service.ts`
- Grocery branches inside inventory, products, purchases, payments, reports, notifications and industry services

### QA and tests

- `backend/scripts/qa-grocery-authenticated-browser-audit.mjs`
- `backend/scripts/qa-grocery-browser-preflight.mjs`
- `backend/scripts/qa-grocery-extended-operations.mjs`
- `backend/scripts/qa-grocery-full-live-audit-with-payment-reconciliation.mjs`
- `backend/scripts/qa-grocery-full-live-audit.mjs`
- `backend/scripts/qa-grocery-live-helpers.mjs`
- `backend/scripts/qa-grocery-live-preflight.mjs`
- `backend/tests/grocery-finance-reports.test.mjs`
- `backend/tests/grocery-live-certification.test.mjs`
- `backend/tests/grocery-operational-reports.test.mjs`
- `backend/tests/grocery-sales-analytics-reports.test.mjs`
- `backend/tests/grocery-weighted-sale-validation.test.mjs`
- `.github/workflows/grocery-live-certification.yml`

### Shared database coupling

`backend/prisma/schema.prisma` is a shared multi-industry schema. Grocery data is not isolated by a dedicated schema or database in the legacy implementation. Grocery-specific rows, industry codes, seeded catalogue data, permissions and report behavior are mixed into shared tables. No shared table or migration may be dropped solely because Grocery uses it.

## Branches containing Grocery implementation or evidence

- `frontend-grocery`
- `frontend-grocery-readiness-work`
- `feat/grocery-production-readiness-20260801`
- `fix/grocery/dedicated-frontend-v1`
- `work/backend-grocery-*`
- `work/frontend-grocery-*`
- `work/grocery-*`
- multiple `fix/grocery-*` and `ops/grocery-*` branches

Historical branches are retained as recovery evidence. They are not approved as the source of the rebuilt application.

## Dependency map

1. `main/demo-static/api/grocery-asset.js` proxies the `frontend-grocery` branch.
2. The central SaaS router and deployment manifest identify Grocery as one of the industry routes.
3. Legacy Grocery pages load shared authentication and API adapters and then inject Grocery-specific controllers.
4. The legacy Grocery frontend calls the shared backend under `/api/v1` rather than an isolated Grocery namespace.
5. The shared backend uses common product, customer, inventory, sales, payment and reporting tables with industry-specific conditionals.
6. Non-Grocery industries depend on the same central router, authentication entry and backend infrastructure; these must be preserved.

## Audit conclusion

The legacy Grocery implementation is branch-proxied, mixed with shared backend infrastructure and not suitable for in-place incremental repair. The safe replacement strategy is:

1. Retire the legacy main-branch Grocery proxy.
2. Preserve historical branches as recovery evidence.
3. Remove Grocery-specific routes and conditionals from the shared backend only after the new isolated app is live and data migration is proven.
4. Build the replacement under `apps/grocery-pos` with its own package, schema, migrations, tests, documentation and Vercel root.
5. Keep central authentication and non-Grocery delivery unchanged until production cutover.