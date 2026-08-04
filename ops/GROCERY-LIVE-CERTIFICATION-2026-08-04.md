# Grocery Live Production Certification — 2026-08-04

## Release boundary

Grocery is not tenant-ready merely because its dedicated pages and APIs exist. This gate must pass against the live Vercel gateway, Railway backend and PostgreSQL database before a Grocery release can be claimed.

## Deployed frontend dependency

The final run is pinned to Grocery frontend commit `3eb9c0fcb1539d1882ea0fb37e01b056df97e0a7`, promoted through the main Vercel gateway from `frontend-grocery`.

That release establishes one owner for each critical workspace:

- `grocery-report-shell.js` owns only the authenticated shell and navigation for Dashboard and Reports;
- `grocery-report-sync.js` is the sole Dashboard and core Reports renderer;
- Quick Actions, analytics, operational and finance modules are extensions rather than competing page renderers;
- the dedicated invoice page renders persisted documents without the generic application bootstrap.

The final browser gate must reject any regression that reintroduces competing Dashboard or Reports renderers.

## Isolated production dataset

The workflow creates one uniquely named QA Grocery tenant through the public registration API and verifies:

- authenticated Owner tenant resolution and mandatory password rotation;
- five suppliers and ten customers;
- fifty Grocery products across ten categories;
- ten weighted products with validated scale-barcode metadata;
- five initial atomic receipts creating fifty saleable inventory batches;
- exactly one hundred FEFO invoices with persisted `inventoryBatchId` values;
- cash, card, bank-transfer, credit and mixed payment coverage;
- exactly one hundred unique invoice IDs and document numbers.

## Extended operations

The same isolated tenant must then pass:

- five additional atomic Grocery receipts, for ten total receipts;
- five batch-scoped waste postings;
- ten partial and five full-line returns;
- five refunds;
- purchase, return and refund persistence reconciliation;
- shared dashboard, inventory and report endpoints;
- Grocery expiry, waste, recall, category, brand, payment, cashier and terminal reports.

## Browser and printing

The authenticated browser gate verifies the live Grocery dashboard, terminal, products, batches, expiry, receiving, waste, recalls, reports and settings pages using stable Grocery shell selectors. It also verifies A4, Thermal 80 mm and Thermal 58 mm invoice rendering from persisted QA invoices.

Any HTTP failure, browser console error, tenant redirect, permission error, missing document or stale route fails the gate.

## Evidence and data safety

- Plaintext credentials are encrypted with the existing audit recipient certificate and then shredded.
- Session tokens and runtime files are shredded.
- Screenshots, JSON reports, encrypted credentials and tenant-scoped cleanup SQL are retained for fourteen days.
- Cleanup SQL is evidence only and is never executed automatically.
- No existing tenant or customer data is read or modified.
- No destructive Prisma or PostgreSQL command is used.
