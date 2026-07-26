# Remaining Gaps

These items are not safe to call complete without a seeded PostgreSQL staging environment and real browser sessions:

1. Run `prisma migrate deploy` against a copy of the current Railway schema.
2. Confirm the Railway database role can create/use `pgcrypto`.
3. Execute authenticated CRUD and transaction tests for every core module.
4. Execute cross-tenant negative tests with two businesses.
5. Execute owner, manager, cashier and industry-role permission tests.
6. Test idempotency by retrying sales, payments, refunds, payroll and industry postings.
7. Verify stock and financial totals after sale, return, refund and purchase reversals.
8. Test A4, 80 mm and 58 mm printing on actual browsers/printers.
9. Test camera barcode/QR scanning over HTTPS on Android and iOS.
10. Complete full Release A–D browser workflow acceptance tests.

The replacement is build-clean and structurally deployable. It is not yet evidence of full customer acceptance testing against production data.
