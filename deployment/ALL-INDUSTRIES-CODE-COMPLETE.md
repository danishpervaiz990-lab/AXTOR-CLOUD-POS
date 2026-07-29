# Axtor POS Cloud — All Industries Code-Complete Release

## Deployment status

This release is intentionally **not deployed**. Vercel deployment automation is disabled and no production promotion is authorized until the account plan or quota is available and the project owner explicitly requests deployment.

## Shared architecture

- One tenant-aware Node.js, Express, TypeScript, Prisma and PostgreSQL backend.
- One SaaS entry, authentication, onboarding and tenant router on `main`.
- Thirteen isolated frontend release branches.
- Same-origin `/apps/<industry>/...` delivery gateway prepared for a future production deployment.
- Server-authoritative authentication, tenant scoping, permissions and industry selection.

## Code-complete industry branches

1. `frontend-retail`
2. `frontend-grocery`
3. `frontend-pharmacy`
4. `frontend-gym`
5. `frontend-school`
6. `frontend-clinic`
7. `frontend-restaurant`
8. `frontend-hardware`
9. `frontend-paint`
10. `frontend-furniture`
11. `frontend-workshop`
12. `frontend-wholesale`
13. `frontend-manufacturing`

## Manufacturing Release E

The final previously unreleased vertical now includes dedicated pages for dashboard, materials, bills of materials, work orders, work-order detail, material issue, material return, work in progress, stages, quality checks, finished goods, scrap and yield, production costing, capacity, reports and settings.

Backend Release E adds operational registry activation, granular roles, work-order detail/update, quality checkpoints, material and finished-goods stock posting, capacity, cost variance and tenant-scoped audit-ready records.

## Certification gates

- Backend clean install, Prisma validation/generation, TypeScript build and tests.
- Manufacturing remote frontend syntax and 16-page manifest test.
- Central router manifest contains exactly 13 branches.
- Gateway branch/dashboard whitelist contains exactly 13 industries.
- Every dashboard loads its vertical runtime.
- Every vertical runtime integrates authenticated `/api/v1/` APIs and has a tenant guard.
- Generic `industry.html?module=...` routing is rejected.
- Login credential hints and permanent-token URL transfer are rejected.
- Vercel deployment is not part of code certification.

## Future release order

1. Merge the certified Manufacturing backend PR into `backend` and verify Railway.
2. Merge the certified Manufacturing frontend PR into `frontend-manufacturing`.
3. Merge the all-industries main/router PR into `main` only when Vercel is ready.
4. Publish one complete production build.
5. Run public HTTP route/header smoke tests.
6. Run authenticated role and cross-tenant E2E tests with secret-backed accounts.

Do not describe this release as production-deployed until steps 1–6 have passed.
