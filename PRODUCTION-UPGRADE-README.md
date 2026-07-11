# Axtor POS Cloud — Complete Production Upgrade

Release date: 10 July 2026  
Release scope: All three requested iterations in one coordinated package

## Included iterations

### Iteration 1 — Returns Financial Summary and New Sale Information

- Returns list now shows Invoice Total, Paid/Received, Returned, Refunded, Refund Balance, Net Retained, payment status, return status, refund status, and state-aware actions.
- Returns search includes invoice number, customer, LPO, PO, payment status, return status, and refund status.
- Mobile returns table supports horizontal scrolling with sticky invoice/action columns where practical.
- New Sale now captures document type, number preview, customer, salesperson, payment type, payment status preview, LPO, customer PO, PO, date, due date, branch, warehouse, currency, channel, delivery information, internal/customer notes, and reference numbers.
- Invoice, quotation, and delivery note posting behavior is separated.
- Full document print view includes customer-facing fields and excludes internal notes.

### Iteration 2 — Permissions, Audit Trail, Draft/Post, and Production Controls

- Database-enforced role permissions are available through Settings → Users / Roles.
- Owner/Admin retain full access. Only an existing Owner can grant or remove the Owner role.
- Draft and Post are separate operations.
- Drafts do not deduct stock, create payment, or post receivables.
- Posting validates customer, due date, branch, warehouse, stock, payment, credit limit, and LPO policy.
- Audit records capture user, action, business, entity, old/new data, IP, and user agent where available.
- Idempotency keys and PostgreSQL advisory locks protect sales, payments, returns, and refunds from duplicate submission.
- Warehouse stock is validated and updated atomically with sales posting.
- Legacy global-only products initialize their first warehouse record safely; once warehouse allocation exists, another warehouse cannot borrow global stock.

### Iteration 3 — Permission-Safe Invoice Editing

- Drafts are editable with `sales_documents.edit_draft`.
- Posted, paid, returned, and refunded documents require separate backend permissions.
- Returned/refunded invoice item and financial edits remain locked.
- Posted item edits require both financial and stock override permissions plus an edit reason.
- Stock reversal and replacement movements occur inside the same database transaction.
- Customer changes on posted invoices transfer the receivable safely between customer accounts and recheck credit limits.
- Every edit increments the document revision and writes an audit record.

## Architecture found and preserved

- Frontend: HTML, Bootstrap, Vanilla JavaScript, Vercel, branch `main`.
- Backend: Node.js, Express, TypeScript, Prisma 6, PostgreSQL, Railway, branch `phase-2-production-backend`.
- JWT storage remains `localStorage.axtorAuthToken`.
- Existing API base URL and route families are preserved.
- Existing green-glass and optional Retro themes are preserved.
- Existing Products, Customers, Sales, Payments, Returns, Refunds, Saved Invoices, authentication, counters, and deployment structure are retained.

## Database migration

Migration folder:

`backend/prisma/migrations/20260710120000_sales_production_upgrade/`

The migration is additive. It adds:

- Customer code/company fields.
- Warehouse, currency, sales channel, reference, notes, idempotency, posting/user/revision fields on sales documents.
- Idempotency fields for payments and sales returns.
- Required indexes and unique tenant-scoped idempotency constraints.

No existing table or column is removed.

## New and expanded API behavior

- `GET /api/v1/sales-documents/context`
- `GET /api/v1/sales-documents/number-preview`
- `POST /api/v1/sales-documents` with `postingMode: draft|post`
- `POST /api/v1/sales-documents/:id/post`
- `PATCH /api/v1/sales-documents/:id`
- `GET /api/v1/access-control`
- `PATCH /api/v1/access-control/roles/:roleId/permissions`
- `PATCH /api/v1/access-control/users/:userId/roles`

Existing sales, payment, return, and refund routes remain compatible. Extra response fields are additive.

## Local validation completed

- TypeScript `tsc --noEmit` passed against the final source using temporary dependency declaration stubs because external package/binary downloads were unavailable. This validates TypeScript syntax and local source typing, but Railway must still run the real Prisma-generated build.
- All changed frontend JavaScript files passed `node --check`.
- `sales.html` and `settings.html` have no duplicate IDs and no missing local script references.
- Frontend and backend mirrored `demo-static` files were synchronized.
- ZIP integrity is tested during packaging.

## Important validation limitation

This environment could not connect to the external Prisma binary download service, so a real `prisma generate`, PostgreSQL migration, Railway deployment, and live Vercel browser test were not executed here. Railway is configured to install Prisma, generate the client, build TypeScript, run `prisma migrate deploy`, and then start the API. Complete live QA must be performed after deployment using the included test plan.
