# Grocery Live Production Certification

## Goal
Certify the dedicated Grocery POS against the live Vercel frontend, Railway backend and PostgreSQL database using a disposable isolated QA tenant.

## Mandatory dataset
- 1 Grocery tenant
- 1 owner, 1 manager, 3 cashiers, 3 salespeople
- 2 counters, 2 terminals, 2 shifts
- 10 categories, 50 products, 10 customers, 5 suppliers
- 10+ purchases and exactly 100 posted invoices
- Cash, card-test, bank-test, credit and split payments
- Partial/full returns, refunds and customer receipts
- Weighted products, scale barcode metadata, batches, expiry, FEFO, near-expiry, low stock, waste and recalls

## Required verification
- Fresh login and tenant routing through the public login page
- PostgreSQL persistence after refresh/logout/new browser context
- Unique invoice numbering and idempotent duplicate-submit protection
- Customer, salesperson, counter, terminal and shift context
- Stock, batch and FEFO reconciliation
- Customer/supplier balances and payment reconciliation
- Grocery dashboard and reports reconciliation
- A4, 80 mm and 58 mm output profiles
- Role restrictions and cross-tenant denial
- Browser console, page and failed HTTP diagnostics

## Evidence
- Machine-readable report with PASS/FAIL/BLOCKED/NOT IMPLEMENTED results
- Screenshots for dashboard, products, customers, terminal, invoices 1/50/100, credit invoice, payment, return, refund, inventory, reports and print profiles
- Encrypted temporary credential package
- QA-tenant-scoped cleanup SQL using ROLLBACK by default

## Acceptance gate
The Grocery release may be marked ready for controlled live beta only when exactly 100 invoices persist, all required financial and inventory reconciliations have zero unexplained differences, tenant isolation passes and no critical/high defect remains.

## Repair loop
Any reproducible defect must be fixed in an isolated Grocery/frontend/backend branch, tested, deployed and the failed checkpoint rerun. This operations branch must not carry unrelated application changes.
