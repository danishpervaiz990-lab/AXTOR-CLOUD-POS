# Axtor Hardware Frontend Release

- Production branch: `frontend-hardware`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

This release provides 12 Hardware-specific pages: dashboard, trade checkout, contractor projects, quotations/LPO, price levels, staged deliveries, backorders, rentals, warranties, unit conversions, reports and settings.

The trade checkout is an independent Hardware interface using shared product and sales-document APIs while preserving project and LPO references. Hardware operational modules use `/api/v1/hardware/*`. Tenant-industry verification, idempotent sales/quotations/delivery posting, and backend action permissions are enforced.

Release gates include frontend CI, Release C backend CI/Railway, a separate Vercel project, and authenticated manager/sales/warehouse/read-only E2E testing.
