# Axtor Workshop Frontend Release

- Production branch: `frontend-workshop`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

The release contains 13 Workshop-specific pages covering vehicles, inspections, estimates, job cards, reserved and posted parts, quality checks, invoices, payments, service reminders, vehicle delivery, reports and settings.

Estimate, job-card, part-posting, invoice and payment operations use idempotency keys. Parts posting verifies stock before consumption. Vehicle delivery requires a completed quality-approved job. All records remain tenant-scoped, and Release D server permissions separate vehicle intake, estimating, jobs, inventory, quality, billing and collections.
