# Axtor POS Cloud — Full Backend Build-Out

## What this package fixes

The remaining pages are no longer intended to rely on browser-only demo arrays for business records. New PostgreSQL-backed, tenant-scoped modules have been added for dashboard analytics, salesmen and commission, suppliers and purchases, inventory and warehouses, branches and counters, accounts and expenses, shifts, reports, promotions, loyalty, notifications, approvals, settings, and communications.

The existing Auth, Products, Customers, Sales Documents, Payments, Returns, Refunds, and Access Control modules remain in place.

## Deployment order

### 1. Backend first

1. Replace the backend repository/branch with the complete backend package.
2. Railway Root Directory must remain `backend`.
3. Railway uses the committed `backend/railway.toml`:
   - Build: `npm ci --include=dev && npm run prisma:generate && npm run build`
   - Start: `npm run prisma:deploy && npm run start`
4. Add/confirm the variables listed in `ENVIRONMENT_VARIABLES.md`.
5. Deploy and verify:
   - `/health`
   - `/api/v1/health/db`
   - `/` should list all API route groups.

### 2. Frontend second

1. Replace the frontend `main` branch with the complete frontend package, or upload the replace-only files preserving their exact paths.
2. Let Vercel finish the deployment.
3. Open the live app and perform one hard refresh.
4. If an older service worker still serves stale code, unregister it once and clear site data only after confirming existing browser-only demo records have been backed up separately.

## Important data note

Existing PostgreSQL records are preserved by the migrations. Old records that existed only inside one browser's `localStorage` are not silently imported into relational tables. Automatic import was intentionally avoided because demo/fake records and real records cannot be safely distinguished without user review. Keep the original ZIPs and browser data until the live checks pass.

## Minimum live smoke test

1. Login and confirm Dashboard loads real summary figures.
2. Create a Product and Customer; refresh and confirm both remain.
3. Create a Branch and Warehouse.
4. Create a Supplier, Purchase, receive it, and confirm stock increases.
5. Perform an inventory decrease adjustment and confirm stock decreases.
6. Open a Shift, make a Sale, receive payment, and close the Shift.
7. Create an Expense and confirm it appears in Accounts/Reports.
8. Create a Salesman target and confirm the performance report resolves the same salesman ID.
9. Create Promotion, Loyalty rule, Notification, Approval request, and Settings record; refresh each page.
10. Open Sales repeatedly and add/remove cart items to confirm the verified freeze fix is still stable.

## Validation already completed before packaging

- Backend TypeScript `typecheck`: passed.
- Backend production TypeScript build: passed.
- Prisma schema DMMF/model validation: passed with 47 models.
- The three committed migrations were executed in order against a fresh embedded PostgreSQL-compatible validation database; 47 public tables were created.
- All 39 frontend JavaScript files passed `node --check`.
- All 244 local HTML script references resolve to existing files.
- Verified Sales freeze-fix files were preserved byte-for-byte from the known working baseline.

## Validation limitation

A full local Node/Prisma server boot could not be completed in the packaging container because the external Prisma native query-engine binary host was unavailable there. Railway's build explicitly runs `prisma generate`, which fetches the correct Linux engine before startup. Final runtime confirmation must therefore be made on Railway/Vercel using the smoke test above.

## Approvals scope

The build uses a minimal tenant-scoped `ApprovalRule` + `ApprovalRequest` workflow with list, create, approve, reject, and rule management endpoints. It does not automatically intercept every discount/credit override yet; those business actions can create requests through the provided API without inventing a second auth or permission system.

## External integrations not claimed

Communications currently persists communication jobs/logs and their status. It does not claim live WhatsApp/SMS/email delivery without an external provider and credentials. No payment-gateway or hardware cash-drawer integration was added.
