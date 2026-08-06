# AXTOR Grocery POS Cloud — API Implementation Status

Updated: 2026-08-06

Repository: `danishpervaiz990-lab/AXTOR-CLOUD-POS`

Application root: `apps/grocery-pos`

Feature branch: `feat/grocery-total-rebuild`

Draft pull request: `#208`

This document records implemented source code only. It does not claim production deployment or production certification.

## Implemented foundations

- Isolated Next.js and TypeScript Grocery application.
- Isolated Prisma/PostgreSQL schema and versioned initial migration.
- Decimal financial fields and Decimal application calculations.
- Secure cookie session backed by hashed database sessions.
- Workspace login, logout, current-user lookup, lockout and audit.
- Backend-derived tenant identity.
- Eight Grocery roles and granular backend permission checks.
- Branch, warehouse, register and open-shift context.
- Structured audit and idempotency records.
- Vercel-oriented application and cron configuration.
- No Railway dependency in `apps/grocery-pos`.

## Health and authentication

- `GET /api/health`
- `GET /api/health/database`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Organization and users

- `GET /api/grocery/organization`
- `GET /api/grocery/users`
- `POST /api/grocery/users`
- `PATCH /api/grocery/users/:id`

Role/status changes revoke active sessions. The final active owner cannot be removed or disabled.

## Catalogue and barcode

- `GET /api/grocery/products/search`
- `POST /api/grocery/products`

Implemented server-side search includes product name, local name, SKU, PLU and barcode. Product creation enforces tenant-unique SKU, PLU and barcodes. Configurable scale-barcode parsing supports embedded weight and embedded price.

## Customers and suppliers

- `GET /api/grocery/customers`
- `POST /api/grocery/customers`
- `GET /api/grocery/customers/:id/statement`
- `POST /api/grocery/customers/:id/payments`
- `GET /api/grocery/suppliers`
- `POST /api/grocery/suppliers`
- `GET /api/grocery/suppliers/:id/statement`
- `POST /api/grocery/suppliers/:id/payments`

Customer statements use debit to increase receivable and credit to decrease receivable. Supplier statements use credit to increase payable and debit to decrease payable.

## Inventory and purchasing

- `GET /api/grocery/inventory`
- `POST /api/grocery/inventory/adjustments`
- `POST /api/grocery/purchase-orders`
- `POST /api/grocery/purchase-orders/:id/approve`
- `POST /api/grocery/goods-receipts`

Draft purchase orders do not alter stock. Posted goods receipts support partial receipt limits, batch/expiry validation, supplier ledger posting and immutable inventory movements.

## Register and shift

- `POST /api/grocery/shifts/open`
- `POST /api/grocery/shifts/movements`
- `POST /api/grocery/shifts/close`

Only one open shift is allowed per register. Closing calculates expected cash from posted cash transactions and controlled cash movements, then records actual cash and variance.

## Sales, returns and refunds

- `POST /api/grocery/sales/complete`
- `POST /api/grocery/sales/:id/returns`

Checkout requires an idempotency key and an open cashier shift. It snapshots price, cost, discount and tax, posts stock movements, separates posted payment components from pending cheques and unsecured credit, and records customer receivable by ledger direction.

Returns use original sale-line values and remaining returnable quantities. Stock restoration, credit-note ledger posting and optional refund payment are executed in one serializable transaction.

## Payments, finance and expenses

- `GET /api/grocery/payment-accounts`
- `GET /api/grocery/reports/payment-reconciliation`
- `POST /api/grocery/expenses`

Credit card and debit card remain separate payment methods. Sales are counted once while split components are reconciled separately. Pending cheques are not included in posted bank movement.

## Cheques

- `POST /api/grocery/cheques`
- `POST /api/grocery/cheques/:id/transition`
- `GET /api/grocery/reports/cheques`
- `GET /api/cron/cheque-reminders`

Implemented cheque operations include inward/outward creation, post-dated status, due-today, deposit, submission, clearing, bounce, return, stop, cancel and replacement transitions. Clearing posts the linked pending payment and creates the correct customer or supplier ledger entry. Failed outcomes mark the linked pending payment failed. Status history and audit records are immutable.

## Connected frontend routes

- `/login`
- `/dashboard`
- `/checkout`
- `/inventory`
- `/finance`
- `/cheques`

The connected pages consume real APIs and authenticated tenant context. They are not copied Retail pages.

## Automated tests currently included

- Decimal money rules.
- Scale-barcode embedded-weight and embedded-price parsing.
- Cheque transition rules and reminder windows.
- Role and tenant-context permission rules.
- Customer and supplier debit/credit conventions.

## Required before production certification

The following remain mandatory and are not claimed complete:

- Green certification evidence for the latest branch head.
- Dedicated Grocery PostgreSQL production database or approved isolated schema credentials.
- Migration deployment against that database.
- Dedicated Vercel project with root `apps/grocery-pos`.
- Production environment variables, cron authentication and protected attachment storage.
- Production health and database-health verification.
- Browser tests for every required role and critical workflow.
- Realistic 500-product and 100-sale simulation against a real database.
- Promotions, loyalty, stock transfer/count, purchase return and complete import/export/printing workflows.
- Protected cheque attachment upload/download.
- Full sales, tax, profit, cashier, purchasing and valuation report set.
- Final legacy Grocery cutover and safe deletion after replacement deployment passes.
- Final non-Grocery browser regression after cutover.
- Merge commit, production tag and release notes.

## Current external blockers

The connected Vercel action set can inspect and deploy existing projects but does not expose creation of a new project. The only discovered Vercel project is the existing non-Grocery `axtor_pos` project and must not be overwritten for this rebuild.

No dedicated Grocery production PostgreSQL connection has been provided through connected secure settings. Source code, migration and seed exist, but production database deployment cannot be truthfully claimed without credentials and an executed migration result.
