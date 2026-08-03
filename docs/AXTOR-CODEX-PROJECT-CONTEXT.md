# AXTOR POS Cloud — Codex Project Context

**Status date:** 2026-08-03  
**Repository:** `danishpervaiz990-lab/AXTOR-CLOUD-POS`  
**Purpose:** Single source of project context for Codex, maintainers, QA, deployment, and future implementation tasks.

## 1. Product identity

AXTOR POS Cloud is an existing multi-tenant, multi-industry SaaS POS/ERP platform. It is not a prototype and must not be rebuilt from scratch.

Primary commercial objective: provide dedicated, production-grade POS systems for multiple industries while sharing a secure, maintainable backend and reusable platform services.

## 2. Current architecture

### Frontend
- Static HTML
- Bootstrap 5
- Vanilla JavaScript
- Chart.js
- PWA/service worker
- Production hosting: Vercel
- Live URL: `https://axtorpos.vercel.app`
- Approved visual identity: green-glass interface; optional Retro theme must remain available

### Backend
- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Production hosting: Railway
- Live URL: `https://axtor-cloud-pos-production.up.railway.app`
- Required health routes include `/health` and `/api/v1/health/db`
- Production server must start from compiled output, normally `node dist/server.js`

### Authentication and tenancy
- JWT is stored in browser localStorage using key `axtorAuthToken`
- Every business-owned read/write must be scoped to the authenticated tenant/business
- Never trust a client-supplied `businessId`
- PostgreSQL is the authenticated cloud source of truth
- Authenticated workflows must not silently fall back to demo/localStorage records

### Repository and branches
- Main repository: `danishpervaiz990-lab/AXTOR-CLOUD-POS`
- Default branch: `main`
- Backend production branch: `backend`
- Grocery frontend branch: `frontend-grocery`
- Additional working/industry branches may exist; inspect current refs before changing deployment configuration
- Vercel must deploy the intended frontend branch/root only
- Railway must deploy the intended backend branch/root only

## 3. Non-negotiable working rules

1. Do not redesign or replace the approved UI without a proven technical reason.
2. Do not migrate the frontend to React, Vue, Angular, Next.js, or another framework.
3. Preserve working modules and existing URLs wherever possible.
4. Do not remove `demo-static` or introduce duplicated nested roots such as `demo-static/demo-static` or `backend/backend`.
5. Do not expose secrets, database URLs, credentials, tokens, deployment hooks, or production passwords in commits, logs, screenshots, evidence, or documentation.
6. Do not use destructive production database operations.
7. Never run `prisma db push --accept-data-loss` against production.
8. Use ordered additive Prisma migrations and `prisma migrate deploy`.
9. Use transactions and idempotency for invoices, payments, returns, refunds, purchases, inventory movements, document numbering, and other financial/stock writes.
10. Frontend hiding is not authorization; backend permissions must enforce access.
11. Never claim a module, industry, deployment, or release is complete based only on pages existing, compilation passing, or a PR merging.
12. Mark unexecuted environment-dependent tests as `NOT VERIFIED` with the blocker.
13. Preserve Railway and Vercel settings unless a verified defect requires a narrowly scoped change.
14. Before production changes: create/confirm backup, validate staging/preview, deploy backend safely, then frontend, then run authenticated QA.
15. Continue fixing and retesting root causes when an action fails; do not loop blindly or weaken safety controls to force a pass.

## 4. Industry strategy

The platform must provide genuinely dedicated industry experiences while remaining one maintainable SaaS platform.

Target industries include:
- General Retail
- Grocery / Supermarket
- Pharmacy
- Hardware / Building Materials
- Paint / Colour Mixing
- Gym / Fitness Centre
- Clinic
- School
- Restaurant
- Furniture
- Workshop
- Wholesale
- Manufacturing and other approved catalogue entries

A recognized tenant must receive its own landing dashboard, navigation, terminology, workflows, forms, reports, notifications, permissions, print fields, onboarding, and subscription presentation. A generic retail sidebar with only a renamed dashboard link is not acceptable.

Industry selection must be resolved from authenticated backend tenant context. Cross-industry routes and data must be blocked server-side.

## 5. Core modules and capabilities to preserve/regression-test

### Authentication and onboarding
- Login and session restore
- Tenant/business provisioning
- Industry selection and routing
- Subscription/entitlement checks
- Role and permission assignment

### Master data
- Products
- Categories and brands
- Customers
- Suppliers
- Salespeople
- Branches, warehouses, counters, terminals, shifts

### Sales and POS
- Terminal product grid and cart
- Invoice, quotation, and delivery note
- Saved documents
- Cash, card-test, bank-test, credit, and split payments
- Customer and salesperson selection
- Counter, terminal, shift, and cashier context
- Credit due dates and customer credit controls
- Unique/idempotent document numbering

### Receivables, returns, and refunds
- Customer payments and allocation
- Partial/full returns
- Partial/full refunds
- Stock restoration
- Over-return and over-refund prevention
- Returned, refunded, retained, and outstanding reconciliation

### Purchasing and inventory
- Purchases and GRN
- Warehouse stock
- Transfers
- Adjustments
- Stock counts
- Batch and expiry
- FEFO
- Low-stock and near-expiry controls
- Waste/spoilage and recalls where industry-relevant

### Reports
- Sales by item
- Sales by category/brand
- Salesperson reports
- Payment method reports
- Counter/terminal/cashier reports
- Profit and profit-by-customer
- Customer and supplier statements
- Returns/refunds financial impact
- Inventory valuation and industry-specific operational reports

### Printing
- A4
- Thermal 80 mm
- Thermal 58 mm
- Ctrl+P/browser print
- Required metadata: counter, terminal, shift, cashier, payment breakdown, salesperson, batch/expiry where relevant

## 6. Confirmed historical fixes that must not regress

- Sales page freeze/unresponsive behavior was previously repaired; prevent duplicate listeners, duplicate API calls, route collisions, and duplicate Chart.js instances.
- Credit invoices gained a due-date workflow with customer `creditDays` and a fallback period.
- Credit-hold override permission was introduced and must remain server-enforced.
- Salesman and Terminal conflicts caused by legacy `axtor-fixes.js` loading were addressed in prior sources.
- Reports were expanded to include salesperson/category/profit-related reports.
- Grocery invoice printing was reconciled for A4/80 mm/58 mm with counter/terminal/shift/cashier/payment/batch/expiry metadata.
- Grocery terminal checkout was reconciled with saved customers, salespeople, counters, terminals, shifts, due date, and idempotency context.
- Grocery payments, returns/refunds, purchasing/GRN, inventory integrity, finance reports, locale/currency coverage, and production route auditing were implemented through recent merged PRs.
- Railway deploy failure introduced by overriding Nixpacks setup packages was fixed in PR #148 by explicitly including Node.js 22 and PostgreSQL 16 tooling.
- Encrypted backup/restore worker support was merged in PR #147; it remains configuration-gated and must be tested with real storage/backup variables before being considered operationally certified.

## 7. Current live repository status as of 2026-08-03

### Recently merged/high-value work
- PR #148 — Railway Node setup override fix; reported TypeScript build pass, 91 tests pass, one DB-only test skipped, zero production dependency vulnerabilities.
- PR #147 — encrypted PostgreSQL backup/restore worker, queue, encryption, storage providers, restore guards, and regression coverage.
- PRs #133–146 — Grocery PostgreSQL reports, dashboard reconciliation, printing, terminal context, payments, returns/refunds, purchasing, inventory, finance reconciliation, locale/currency, route audit, and robots policy.

### Open certification work
- PR #149 — draft Grocery live production certification.
  - Target: isolated Grocery tenant, role users, counters/terminals/shifts, 50 products, 10 customers, suppliers, purchases, 100 invoices, payment mix, returns/refunds, printing, permissions, tenant isolation, and reconciliation evidence.
- PR #150 — draft Pharmacy live production certification.
  - Target: isolated Pharmacy tenant, role users, medicines, patients, 500 invoices, prescriptions, FEFO, expiry, suppliers, billing, reports, and authenticated browser evidence.

These certification PRs must not be called complete until their live evidence gates pass.

## 8. Known historical defects requiring regression coverage

- Retail Customers and Products pages broken or not loading correctly.
- Saved customers not appearing in Terminal; only Walk-in Customer visible.
- Saved salespeople not appearing on Salesmen page or Terminal.
- Role settings effective only for Owner in earlier builds.
- Duplicate sales document number unique-constraint failures.
- Credit invoice blocked by missing/editable due date.
- Incorrect Trial Version label.
- Refund/return totals not reconciling correctly on invoices.
- Dashboard Chart.js repeated-render crash.
- Counter/terminal details absent from invoice printing.
- Generic/shared sidebar/dashboard shown for Gym, School, Clinic, Pharmacy, and other industries.
- Service-worker/stale-cache regressions after frontend deployment.
- Frontend/backend API contract mismatches and accidental localStorage fallback.

Do not assume these are still present or fixed. Reproduce against the current branch and live/preview environment before changing code, then add regression tests for confirmed issues.

## 9. Immediate priorities

1. Complete Grocery live certification in PR #149 with real persisted evidence and zero unexplained reconciliation differences.
2. Complete Pharmacy live certification in PR #150 with prescription, FEFO, expiry, role, tenant, invoice, and reporting evidence.
3. Re-test Retail Customers, Products, Salespeople, roles, invoice numbering, credit due dates, returns/refunds, and all print profiles against current production code.
4. Verify backup worker configuration, encrypted backup creation, retention, integrity check, and isolated restore verification.
5. Establish an authoritative industry completion matrix separating:
   - implemented and live-certified;
   - implemented but not live-certified;
   - partial/preview;
   - not started.
6. Complete remaining dedicated industry frontends/backend workflows one industry at a time without mixing business logic.
7. Run production security, tenancy, permission, data-integrity, performance, PWA/cache, responsive, and print certification.

## 10. Required definition of done

A feature or industry is complete only when:
- frontend and backend are integrated;
- PostgreSQL records persist correctly;
- tenant and role isolation are tested;
- financial and inventory effects reconcile;
- happy paths and failure paths are tested;
- browser/print/mobile behavior is verified where applicable;
- deployment succeeds on the intended Vercel/Railway branches;
- no critical/high defect remains;
- executed evidence is attached or referenced;
- skipped tests and external dependencies are explicitly disclosed.

## 11. Codex operating instructions

When starting a Codex task:
1. Read this file first.
2. Inspect the target branch, open PRs, recent merged PRs, deployment config, Prisma migrations, and existing tests.
3. State the exact baseline and target scope.
4. Reproduce each claimed defect before editing.
5. Make the smallest safe root-cause fix.
6. Add or update automated regression tests.
7. Run relevant syntax, TypeScript, Prisma, test, dependency-audit, and packaging checks.
8. Do not commit generated secrets, local environment files, production credentials, database dumps, or unencrypted QA evidence.
9. Open an isolated draft PR with validation results, known limitations, deployment impact, rollback notes, and exact unexecuted tests.
10. Do not merge or promote to production until acceptance gates pass.

## 12. Recommended first Codex task

Use Ask mode first:

> Read `docs/AXTOR-CODEX-PROJECT-CONTEXT.md`, inspect branches `main`, `backend`, and `frontend-grocery`, and review open PRs #149 and #150. Produce an evidence-based completion matrix for every industry and core module. Do not modify code. Separate verified live, merged but not live-certified, partial/preview, blocked, and not implemented items. Cite exact files, routes, migrations, tests, PRs, and deployment evidence.

Then use Code mode only after reviewing that matrix.
