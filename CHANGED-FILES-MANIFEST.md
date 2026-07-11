# Changed Files Manifest

## Frontend branch: `main`

Modified:

- `demo-static/sales.html`
- `demo-static/settings.html`
- `demo-static/js/sales-backend.js`
- `demo-static/js/returns-backend.js`
- `demo-static/js/receive-payment-backend.js`

Added:

- `demo-static/js/sales-production-upgrade.js`
- `demo-static/js/access-control-backend.js`

## Backend branch: `phase-2-production-backend`

Added:

- `.gitignore`
- `backend/.gitignore`
- `backend/prisma/migrations/20260710120000_sales_production_upgrade/migration.sql`
- `backend/src/controllers/access-control.controller.ts`
- `backend/src/routes/access-control.routes.ts`
- `backend/src/services/access.service.ts`
- `backend/src/services/audit.service.ts`
- `demo-static/js/access-control-backend.js`
- `demo-static/js/receive-payment-backend.js`
- `demo-static/js/returns-backend.js`
- `demo-static/js/sales-backend.js`
- `demo-static/js/sales-production-upgrade.js`

Modified:

- `backend/prisma/schema.prisma`
- `backend/railway.toml`
- `backend/src/app.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/controllers/customers.controller.ts`
- `backend/src/controllers/payments.controller.ts`
- `backend/src/controllers/refunds.controller.ts`
- `backend/src/controllers/sales-documents.controller.ts`
- `backend/src/controllers/sales-returns.controller.ts`
- `backend/src/routes/sales-documents.routes.ts`
- `backend/src/utils/document-number.ts`
- `demo-static/sales.html`
- `demo-static/settings.html`

## Documentation added to each full repository

- `PRODUCTION-UPGRADE-README.md`
- `GIT-DEPLOYMENT-GUIDE.md`
- `QA-TEST-PLAN.md`
- `CHANGED-FILES-MANIFEST.md`

The replace-only ZIPs contain only the implementation files listed above and their correct folder paths. The complete repository ZIPs additionally contain the documentation files.
