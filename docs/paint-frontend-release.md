# Axtor Paint Frontend Release

- Production branch: `frontend-paint`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

This release provides 12 purpose-built Paint pages covering dashboard, brands/colours, formula creation, formula revisions, mix jobs, component stock, formula consumption, quality checks, labels, delivery/reversal, reports and settings.

The workflow preserves immutable formula revision numbers on each mix job, validates component stock before consumption, records actual consumption, requires quality approval before labels and delivery, and restores consumed quantities when a cancelled mix is reversed. Custom mix jobs require a non-returnable acknowledgement and idempotency key.

Release gates include frontend CI, Release C backend CI/Railway, an independent Vercel project, and authenticated manager/colorist/stock/read-only E2E testing.
