# Axtor Wholesale Frontend Release

- Production branch: `frontend-wholesale`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

This release provides 15 Wholesale/Distribution pages covering price lists and assignments, unit conversions, sales orders, allocation/picking, detailed packing lists, routes, dispatch, proof of delivery, collections, customer credit profiles and checks, receivables ageing, reports and settings.

Sales orders and collections use idempotency keys. Allocation and packing preserve order-line quantities. Proof of delivery closes both the dispatch and order. Credit checks compare requested value with customer limits and current exposure. All operations are tenant-scoped and protected by Release D server-side role permissions.
