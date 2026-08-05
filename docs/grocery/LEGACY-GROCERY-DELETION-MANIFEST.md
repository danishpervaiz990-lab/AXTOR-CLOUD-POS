# Legacy Grocery Deletion Manifest

## Scope and authority

This manifest governs removal of the legacy Grocery implementation from `danishpervaiz990-lab/AXTOR-CLOUD-POS` while preserving Retail and every other industry.

- Baseline commit: `f52e2ff10caf24c314fe2fca83dd8fc5f4f5b374`
- Recovery branch: `backup/pre-grocery-rebuild-2026-08-06`
- Implementation branch: `feat/grocery-total-rebuild`
- Replacement root: `apps/grocery-pos`
- Replacement product: **AXTOR Grocery POS Cloud**

## Deletion classes

### Class A — active legacy delivery on `main`

The following active delivery component must be retired when the replacement route is ready:

- `demo-static/api/grocery-asset.js`

It currently fetches the legacy `frontend-grocery` branch, injects legacy Grocery controllers and serves them through the shared production origin. Its retirement must be committed separately from the new application implementation.

### Class B — legacy dedicated frontend branch

The active source branch `frontend-grocery` contains the old Grocery pages, scripts, styles, tests, workflow and branch-level Vercel configuration documented in `LEGACY-GROCERY-INVENTORY.md`.

Deletion policy:

1. The branch is retained as historical recovery evidence.
2. No production router, gateway, build or Vercel project may load assets from it after cutover.
3. No new code may import from it.
4. Legacy service-worker or manifest references must be removed from active delivery.
5. The branch must be marked archived in documentation after production cutover; it is not an approved runtime source.

### Class C — Grocery-specific shared-backend code

The following files are approved for removal or replacement after the isolated Grocery backend is operational:

- `backend/src/routes/grocery.routes.ts`
- `backend/src/routes/grocery-masterdata.routes.ts`
- `backend/src/middleware/grocery-sale-validation.middleware.ts`
- `backend/src/services/grocery-finance-reports.service.ts`
- `backend/src/services/grocery-reports.service.ts`
- `backend/src/services/grocery-sales-analytics.service.ts`
- `backend/scripts/qa-grocery-*.mjs`
- `backend/tests/grocery-*.test.mjs`
- `.github/workflows/grocery-live-certification.yml`

Grocery conditionals embedded in shared files must be removed only after dependency analysis proves the change does not alter non-Grocery behavior. Shared authentication, tenancy, products, customers, inventory, payments, reports and permissions must not be deleted merely because Grocery used them.

### Class D — routing, deployment and documentation references

Active references to remove or update at cutover include:

- Grocery entry in the legacy branch-proxy release map
- Grocery dashboard path pointing at `grocery-dashboard.html`
- Legacy `frontend-grocery` source alias
- Old Grocery Vercel project aliases and deployment notes
- Legacy Grocery release labels, query-string cache versions and gateway headers
- Service-worker precache entries for old Grocery files
- Browser tests expecting the old route or old UI

### Class E — database objects and data

No shared table, column, enum, index, sequence or migration may be dropped blindly.

Required sequence:

1. Identify Grocery tenants and Grocery-owned records using authoritative tenant and industry fields.
2. Export a protected data snapshot before destructive migration.
3. Create mapping scripts from legacy entities to the isolated Grocery schema.
4. Migrate products, customers, suppliers, inventory, sales, purchases, payments, cheques, ledgers and audit history transactionally.
5. Reconcile source and destination counts and monetary totals.
6. Keep immutable financial and audit history.
7. Disable legacy Grocery writes.
8. Run a read-only verification window.
9. Remove only Grocery-specific database objects that are proven unused by other industries.
10. Record rollback instructions and recovery evidence.

`--accept-data-loss` is prohibited for this rebuild unless a reviewed, documented and backed-up disposable environment is being used.

## Separate purge commits

The purge will be split into reviewable commits:

1. Retire the main-branch legacy Grocery asset gateway.
2. Remove active Grocery references from shared router and deployment manifests.
3. Remove legacy Grocery service-worker caches and frontend runtime references.
4. Remove Grocery-specific shared-backend routes, middleware and services after cutover.
5. Remove obsolete Grocery tests and CI that certify the retired implementation.
6. Add migration archive and reconciliation evidence.

## Proof required before purge completion

- The backup branch resolves to the recorded baseline SHA.
- No active route fetches from `frontend-grocery`.
- Legacy Grocery HTML and JavaScript bundles are not loaded by production.
- Old Grocery API routes return 404 or a documented retired response.
- No Grocery tenant falls back to Retail.
- Grocery users receive only the replacement Grocery application.
- Retail and every other industry still pass routing, login and dashboard smoke tests.
- Database reconciliation is zero-difference for protected financial and inventory totals.
- Browser cache and service-worker tests prove old assets cannot reappear.

## Current status

The inventory and controlled-deletion plan are complete. Destructive database removal and production cutover are intentionally gated behind the isolated replacement application, migration verification and non-Grocery regression tests.