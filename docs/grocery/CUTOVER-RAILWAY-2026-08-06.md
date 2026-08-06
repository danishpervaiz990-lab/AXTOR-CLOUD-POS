# Grocery replacement and Railway cutover record

## Protected scope

- Replacement branch: `cutover/grocery-new-railway-20260806`
- Recovery branch: `backup/pre-grocery-rebuild-2026-08-06`
- Replacement application: `apps/grocery-pos`
- Railway service root: `apps/grocery-pos`
- Expected service name: `axtor-grocery-pos`
- Expected public origin: `https://axtor-grocery-pos-production.up.railway.app`

## Active legacy retirement

The central Grocery gateway no longer downloads HTML, JavaScript, CSS or other assets from `frontend-grocery`. It now redirects Grocery-only routes to the isolated Railway replacement. The dedicated legacy customer page and its special Vercel rewrite were deleted.

Historical Grocery branches remain only as rollback evidence. They are not active runtime sources.

## Non-Grocery preservation

The Retail, Pharmacy, Gym, School, Clinic, Restaurant, Hardware, Paint, Furniture, Workshop, Wholesale and Manufacturing entries in `demo-static/industry-hosts.json` were preserved byte-for-byte. Their branches, origins, dashboards and shared gateway behavior were not changed.

The shared multi-industry backend branch was not modified during this cutover preparation. Legacy Grocery APIs there must not be removed until the dedicated Railway service has a healthy database, successful migration and verified login/checkout evidence.

## Railway configuration

The replacement contains `railway.toml`, Railway release scripts and a dedicated Prisma migration/seed flow. Railway must use a Grocery-only PostgreSQL database and must not reuse the shared multi-industry database.

## Required final evidence

1. Railway service created with repository root `apps/grocery-pos`.
2. Required Grocery environment variables configured.
3. Public domain generated and recorded.
4. `/api/health` returns HTTP 200.
5. `/api/health/database` returns HTTP 200.
6. Green Basket owner login succeeds.
7. Dashboard, checkout, inventory, finance and cheques open successfully.
8. Main Vercel `/apps/grocery/grocery-dashboard.html` redirects to the replacement.
9. Retail and at least one other industry routing smoke test remain green.

Until items 1–9 are recorded, source replacement is prepared but production Railway connection is not certified.
