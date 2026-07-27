# Axtor Restaurant Frontend Release

- Production branch: `frontend-restaurant`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

This release provides dedicated Restaurant pages for dashboard, floor/tables, menu, orders, kitchen display, reservations, modifiers, recipes, wastage, reports and settings.

Primary workflows use `/api/v1/restaurant/*`. The frontend verifies the authenticated tenant industry before rendering data. Order and wastage creation send idempotency keys. All writes remain protected by server-side action permissions and tenant-scoped PostgreSQL operations.

Release gates: frontend CI, Release C backend CI/Railway, independent Vercel deployment, and authenticated manager/cashier/kitchen/read-only E2E testing.
