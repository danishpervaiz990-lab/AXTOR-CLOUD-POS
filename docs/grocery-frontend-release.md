# Axtor Grocery Frontend Release

- Production branch: `frontend-grocery`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

This release provides ten dedicated Grocery pages for dashboard, FEFO checkout, barcode/PLU products, batches, expiry control, receiving, waste/spoilage, recalls, reports and settings.

Checkout chooses the earliest saleable batch and sends `inventoryBatchId` with each line. Expired, recalled, quarantined and damaged batches are excluded. Batch receiving records production, best-before, expiry, units, quantity and cost. Waste and recall workflows use tenant-scoped Grocery entity definitions. Sales, receiving and operational writes use idempotency keys where duplicate posting would be harmful.
