# Axtor Furniture Frontend Release

- Production branch: `frontend-furniture`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

The release contains 13 Furniture-specific pages for custom orders, measurements, production stages, design approvals, payments, deliveries, installations/sign-off, procurement, returns, warranty claims, reports and settings.

Order and payment operations are idempotent where money or order creation is involved. All records are tenant-scoped and server-side permissions separate design, production, finance, delivery and warranty duties.
