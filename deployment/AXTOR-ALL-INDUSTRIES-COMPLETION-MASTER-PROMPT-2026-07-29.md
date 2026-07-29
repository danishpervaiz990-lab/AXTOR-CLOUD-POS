# AXTOR POS CLOUD — ALL INDUSTRIES COMPLETION, AUDIT & CLIENT-READY MASTER PROMPT

**Date:** 29 July 2026  
**Repository:** `danishpervaiz990-lab/AXTOR-CLOUD-POS`  
**Frontend production branch:** `main`  
**Shared backend branch:** `backend`  
**Frontend hosting:** Vercel  
**Backend hosting:** Railway  
**Database:** PostgreSQL with Prisma  

---

## 1. Role and operating mode

Act as the senior SaaS architect, POS/ERP product owner, frontend lead, Node/Express/TypeScript engineer, Prisma/PostgreSQL engineer, security reviewer, QA lead, Git release manager, and deployment engineer for **Axtor POS Cloud**.

This is an existing multi-tenant, multi-industry SaaS project. Do not restart it, replace the approved green-glass design, discard working Retail functionality, duplicate the shared backend, or convert the project into a mock/demo application.

Your assignment is to:

1. audit the current state of every industry application;
2. distinguish code-complete work from truly production-certified work;
3. repair every verified code, integration, security, navigation, data, permission, printing, performance, and workflow defect;
4. complete all missing shared and industry-specific functionality;
5. maintain one shared Railway/PostgreSQL backend;
6. preserve independent frontend branches for each industry;
7. produce deployment-free previews and test evidence;
8. prepare a controlled release candidate;
9. do not deploy or promote anything to Vercel or Railway until the owner gives explicit written approval.

Use these status labels only:

```text
PASS
FAIL
NOT VERIFIED
BLOCKED
```

Never report an item as complete merely because a page renders or CI syntax passes.

---

## 2. Non-negotiable architecture

### Shared backend

Keep one shared authenticated backend and one PostgreSQL database for all industries.

The backend is responsible for:

- authentication and session handoff;
- users, roles, permissions and direct-API authorization;
- businesses, branches, counters and warehouses;
- subscriptions, entitlements and onboarding;
- products, customers, suppliers and inventory;
- sales documents, payments, returns and refunds;
- purchases, expenses and accounting records;
- industry-specific operational records;
- reports, audit logs and notifications;
- tenant isolation through `businessId` on every applicable record.

Do not create separate Prisma schemas or databases for individual industries.

Never run destructive production commands. In particular, never run:

```bash
prisma db push --accept-data-loss
```

against production.

Use additive, reviewed Prisma migrations only when a real schema change is required.

### Independent frontend branches

Preserve these permanent branches:

```text
main
frontend-core
frontend-retail
frontend-grocery
frontend-pharmacy
frontend-gym
frontend-school
frontend-clinic
frontend-restaurant
frontend-hardware
frontend-paint
frontend-furniture
frontend-workshop
frontend-wholesale
frontend-manufacturing
backend
```

Each industry frontend must be independently testable, releasable, patchable and reversible.

A Pharmacy expiry fix must not modify the Clinic, Gym, School, Restaurant or Retail frontend. A Clinic appointment-calendar fix must not redeploy Pharmacy. Shared authentication/API-client/security fixes belong in `frontend-core` and must be deliberately synchronized.

### Central main application

`main` is the SaaS entry layer only:

- public landing;
- login and registration;
- password reset and forced password change;
- tenant onboarding;
- plan and industry selection;
- secure tenant-industry router;
- same-origin `/apps/<industry>/...` gateway;
- profile/account entry;
- global error and maintenance pages.

Do not return authenticated users to a generic `industry.html?module=...` workspace.

---

## 3. Current verified status

### Code and branch status

The repository currently has three final release PRs open and intentionally unmerged:

```text
PR #43 — Manufacturing backend Release E
PR #44 — Dedicated Manufacturing frontend
PR #45 — Final 13-industry router, gateway and certification
```

All three are merge-ready or CI-ready, but they remain unmerged because merging backend/main can trigger Railway or Vercel.

### Deployment-free preview status

A local Chromium preview rendered all 13 dedicated dashboards from their isolated branches with mocked tenant/API data.

The preview verified:

- dashboard HTTP 200 from the local static server;
- dedicated heading and navigation;
- no login redirect;
- no generic `industry.html?module=...` route;
- no captured JavaScript console errors;
- no Vercel or Railway deployment.

This proves visual/static branch readiness. It does **not** prove live database writes, permissions, accounting accuracy or complete production workflows.

### Industry code coverage

| Industry | Branch | Current code scope | Current truth |
|---|---|---|---|
| Retail | `frontend-retail` | Proven POS terminal, sales, customers, products, inventory, purchases, shifts, promotions, loyalty, accounts, expenses and reports | Code isolated; authenticated full regression still required |
| Grocery | `frontend-grocery` | FEFO checkout, products/PLU, batches, expiry, receiving, waste, recalls, reports and settings | Code/preview passed; live FEFO and inventory-posting tests required |
| Pharmacy | `frontend-pharmacy` | Medicines, prescriptions, patients, prescribers, batches, near-expiry, quarantine, stock, purchases, recalls, billing and reports | Code/preview passed; regulated workflow and role tests required |
| Gym | `frontend-gym` | Members, admissions, plans, memberships, renewals, payments, trainers, classes, bookings, check-ins, programs, facilities, lockers and measurements | Code/preview passed; live membership and access tests required |
| School | `frontend-school` | Admissions, students, guardians, classes, subjects, teachers, timetable, attendance, assessments/results, fees, payments, reports and settings | Code/preview passed; live academic/fee workflow tests required |
| Clinic | `frontend-clinic` | Patients, practitioners, appointments, calendar, queue, check-in, encounters, notes, services, medications, consents, billing, follow-ups and reports | Code/preview passed; sensitive-data and role tests required |
| Restaurant | `frontend-restaurant` | Floor/tables, reservations, POS/orders, kitchen display, menu, modifiers, recipes, ingredients, wastage and settlements | Code/preview passed; live order/kitchen/inventory tests required |
| Hardware | `frontend-hardware` | Trade terminal, products/units, trade pricing, customers/projects, quotations, deliveries, backorders, rentals and warranties | Code/preview passed; live unit/pricing/delivery tests required |
| Paint | `frontend-paint` | Brands/lines, colours, formulas/revisions, mix jobs, component stock, consumption, QC, labels, delivery/reversal and reports | Code/preview passed; live stock/QC/reversal tests required |
| Furniture | `frontend-furniture` | Catalogue/custom orders, measurements, approvals, production, procurement, payments, deliveries, installations, returns and warranty | Code/preview passed; live staged-order tests required |
| Workshop | `frontend-workshop` | Vehicles, inspections, estimates, job cards, parts, technicians/bays, quality, invoicing, payments, delivery and reminders | Code/preview passed; live parts/job/billing tests required |
| Wholesale | `frontend-wholesale` | Price lists, customer pricing, sales orders, allocation, picking, packing, routes, dispatch, POD, collections, credit and ageing | Code/preview passed; live credit/dispatch/collection tests required |
| Manufacturing | `frontend-manufacturing` via PR #44 | Materials, BOMs, work orders, issues/returns, WIP, stages, QC, finished goods, scrap/yield, costing, capacity, reports and settings | Code/preview/CI passed; PRs #43–45 still unmerged and live E2E required |

---

## 4. What “finished” must mean

A feature is finished only when all applicable layers pass:

1. page exists and follows the approved visual system;
2. navigation opens the correct dedicated page;
3. frontend runtime has valid syntax;
4. frontend calls the correct authenticated backend API;
5. backend route exists and validates input;
6. backend enforces tenant scope and permission;
7. data writes to PostgreSQL and reloads correctly;
8. duplicate submission is safely handled with idempotency where required;
9. update conflicts are handled without silent overwrite;
10. inventory/accounting side effects are correct;
11. errors, empty states and loading states are visible and understandable;
12. role-restricted users cannot bypass the UI through direct API calls;
13. print/report output is correct;
14. automated tests pass;
15. authenticated browser E2E passes;
16. preview is approved;
17. deployment smoke tests pass;
18. rollback is documented.

A screenshot alone is not completion.

---

## 5. Immediate audit now required

Run the deployment-free audit workflow on all branches. It must check:

- required dashboard/runtime/page counts;
- missing local assets;
- JavaScript syntax;
- duplicate HTML IDs;
- placeholder navigation links;
- generic industry-workspace regressions;
- tenant/industry guards;
- authenticated `/api/v1/` integration;
- permanent token leakage in URLs;
- public credential leakage;
- production-record persistence in localStorage;
- branch-local Vercel routing configuration;
- one-time session receiver;
- unique dashboard and navigation signatures;
- industry-specific test presence;
- final backend clean installation;
- Prisma validation and generation;
- TypeScript production build;
- backend tests;
- compiled `dist/server.js` verification.

For every audit result:

- fix `FAIL` immediately;
- investigate every `WARN` and either fix it or document why it is safe;
- do not suppress a real error simply to make CI green;
- keep each industry fix on its own branch.

---

## 6. Shared platform work still required

### Authentication and tenant routing

Verify with real sessions:

- login and logout;
- forced password change;
- session expiry;
- stale token cleanup;
- onboarding completion;
- canonical industry selection;
- correct `/apps/<industry>/...` landing;
- wrong-industry access rejection;
- one-time handoff replay rejection;
- no permanent JWT in URL/history/logs;
- owner, admin, manager, operator and read-only sessions.

### Roles and permissions

Create a test-account matrix for every industry. Verify:

- owner/admin full permitted access;
- operational roles see only their modules;
- read-only roles cannot write;
- hidden buttons are also blocked by the backend;
- cross-industry API calls return 403/404 as appropriate;
- cross-tenant record access is impossible;
- role settings show all saved roles, not only Owner.

### Core Retail/POS regressions

Retest and repair:

- customers list and Walk-in Customer behavior;
- products page and product search;
- salesman saving, listing and terminal selection;
- unique document-number generation under concurrency;
- credit-invoice due-date enforcement;
- cash, credit, partial and full payments;
- returns, refunds, advances and exchanges;
- customer balances and statements;
- inventory movements;
- branch, counter and terminal details;
- shifts and shift closing;
- promotions and loyalty;
- role-based sales restrictions;
- trial/subscription banner behavior;
- A4, 80 mm and 58 mm invoice/receipt printing;
- Ctrl+P print profile selection.

### Data integrity

Test:

- idempotency on every financial, inventory and operational posting;
- optimistic concurrency/revision conflicts;
- transaction rollback on partial failure;
- no negative stock unless explicitly permitted;
- stock movement traceability;
- payment/refund reconciliation;
- document numbering per business;
- timezone/date/currency correctness;
- decimal rounding;
- audit logs for sensitive changes.

### Reports

Verify figures against database source records for:

- sales by item/category/customer/salesman;
- gross profit and margin;
- payments and receivables;
- purchases and payables;
- inventory valuation and movement;
- expenses and account transactions;
- each industry’s operational KPIs.

Reports must not display sample or hard-coded values in authenticated production mode.

### International readiness

Verify:

- QAR and additional configured currencies;
- exchange-rate storage and document-rate locking;
- English and Arabic;
- RTL layout;
- configured additional languages;
- locale-aware dates, numbers and taxes;
- translated validation/error messages;
- no layout breakage from long translated labels.

### Security and operational readiness

Complete:

- dependency and secret scanning;
- CORS allowlist review;
- CSP and security headers;
- rate limiting and brute-force protection;
- sensitive-log redaction;
- backup and restore procedure;
- migration rollback plan;
- error monitoring and alerting;
- health/readiness probes;
- database connection-pool review;
- pagination and query limits;
- performance budgets;
- service-worker cache/version safety;
- accessibility keyboard/focus/contrast checks.

---

## 7. Industry-specific completion gates

### Retail

Run an end-to-end sale from shift opening to invoice printing and shift closing. Include customer/product/salesman selection, discounts, tax, cash/credit/partial payment, returns/refunds, inventory deduction, customer statement, commission and reports.

### Grocery

Test barcode and weighted items, FEFO lot selection, batch receiving, near-expiry alerts, expired-stock blocking, markdowns, waste/spoilage, recalls, reorder and cashier speed. Confirm exact batch inventory movement.

### Pharmacy

Test medicine catalogue, generic/brand/strength/pack fields, prescription-required controls, prescription approval, pharmacist permissions, FEFO batch traceability, near-expiry, quarantine, recalled stock, expired-stock blocking, sale receipt and audit history. Do not claim medical diagnosis features.

### Gym

Test new admission, plan assignment, membership activation, renewal, freeze, expiry, payment, trainer assignment, class booking, facility booking, locker assignment, measurement history and QR/member check-in. Verify denied check-in for invalid/expired membership.

### School

Test admission, student/guardian relationship, academic year, class/section assignment, timetable conflict handling, attendance, assessment/results, fee generation, partial/full fee payment, overdue fee reporting and role restrictions for administration, teachers and finance.

### Clinic

Test patient registration, practitioner setup, appointment/calendar conflict, check-in, queue, encounter, restricted clinical notes, service request, medication request, consent, service invoice, payment and follow-up. Verify receptionist cannot read restricted clinical data and billing users cannot edit clinical notes.

### Restaurant

Test reservation, table opening, dine-in/takeaway/delivery, menu modifiers, kitchen ticket, kitchen status, split/merge bill, move table, settlement, recipe/ingredient consumption, wastage and shift close.

### Hardware

Test unit conversion, trade price levels, project quotation, LPO/reference, backorder, staged delivery, rental issue/return, deposit, warranty and trade-customer credit.

### Paint

Test colour lookup, formula and revision, mix quantity scaling, component availability, material consumption, quality approval/rejection, label printing, delivery and reversal restoring component stock.

### Furniture

Test custom order, measurements, design approval, deposit/payment schedule, procurement, production stages, delivery, installation, customer sign-off, return and warranty claim.

### Workshop

Test vehicle registration, inspection, estimate approval, job card, task/technician/bay assignment, parts reservation/consumption, quality check, invoice/payment, delivery and service reminder.

### Wholesale

Test customer-specific pricing, credit limit, sales order, allocation, pick list, packing, route/dispatch, proof of delivery, backorder, collection, balance update and receivables ageing.

### Manufacturing

Test raw materials, BOM revision, work order, material issue/return, WIP, stage completion, quality checkpoint, finished-goods receipt, scrap/yield, production cost and variance, capacity and reports. Confirm stock and cost postings are transactional and tenant-scoped.

---

## 8. Required automated test layers

Maintain these test groups:

```text
tests/shared/
tests/retail/
tests/grocery/
tests/pharmacy/
tests/gym/
tests/school/
tests/clinic/
tests/restaurant/
tests/hardware/
tests/paint/
tests/furniture/
tests/workshop/
tests/wholesale/
tests/manufacturing/
```

Required suites:

- syntax and missing-asset checks;
- API contract tests;
- validation tests;
- permission tests;
- tenant isolation tests;
- idempotency tests;
- inventory/accounting side-effect tests;
- report calculation tests;
- print tests;
- responsive UI tests;
- authenticated browser E2E;
- cross-industry routing tests;
- backup/migration smoke tests.

Use fixtures and disposable test tenants. Do not run destructive tests against production data.

---

## 9. Execution order

Execute without stopping at planning:

### Phase A — Audit and repair without deployment

1. Run the all-industry audit workflow.
2. Download and review JSON/Markdown evidence.
3. Create a defect matrix by industry and severity.
4. Fix every static/code `FAIL`.
5. Review and resolve every `WARN`.
6. Rerun until all branches pass code/static readiness.
7. Rerun local Chromium preview for all 13 dashboards.
8. Return screenshots and an updated preview report.

### Phase B — Functional test preparation

1. Create disposable test tenants for all industries.
2. Create role-specific users.
3. Seed minimal safe test data.
4. Complete API and browser E2E scripts.
5. Add financial/inventory reconciliation assertions.
6. Add print and report validation.

### Phase C — Merge-ready release candidate

Prepare, but do not deploy:

1. merge `PR #44` into `frontend-manufacturing` only after its CI is green;
2. update final router/certification references from the temporary Manufacturing feature branch to `frontend-manufacturing`;
3. rerun all 13 branch certifications;
4. prepare backend `PR #43` for controlled Railway deployment;
5. prepare main `PR #45` for controlled Vercel deployment;
6. record rollback SHAs and deployment checklist.

Do not merge backend/main until deployment is explicitly authorized if those merges trigger production hosting.

### Phase D — Controlled preview deployment

Only after explicit owner approval:

1. deploy backend candidate;
2. verify Railway health and database health;
3. deploy Vercel preview, not production;
4. run unauthenticated route/asset/header smoke tests;
5. run authenticated tenant and role E2E;
6. present preview URLs and evidence to the owner;
7. wait for explicit production approval.

### Phase E — Production release

Only after explicit approval:

1. promote the exact approved preview commit;
2. verify all industry routes;
3. verify login/onboarding/router;
4. verify Railway APIs;
5. run critical transaction smoke tests using a dedicated production test tenant;
6. monitor logs and errors;
7. roll back immediately on a critical failure.

---

## 10. Required progress report

After each work cycle, return:

```text
Industry:
Source branch:
Feature branch:
Target branch:
Commit SHA:
Pull request:
Files changed:
Backend changes:
Database migration:
Tests run:
PASS:
FAIL:
NOT VERIFIED:
BLOCKED:
Preview evidence:
Deployment attempted: NO/YES
Remaining defects:
Rollback point:
Next action:
```

Also maintain one combined matrix containing all 13 industries and shared platform work.

---

## 11. Definition of done

Axtor POS Cloud is client-ready only when:

1. all 13 frontend branches are purpose-built and independently releasable;
2. the shared backend supports every required workflow;
3. no activated industry uses the generic workspace for primary operations;
4. all critical buttons, pages, forms and reports work with PostgreSQL data;
5. tenant isolation passes;
6. role permissions pass in both UI and direct API tests;
7. sales, payments, returns, refunds, purchases, inventory and accounting reconcile;
8. all industry operational workflows pass authenticated E2E;
9. A4/80 mm/58 mm printing passes;
10. language, RTL, currency, tax and timezone behavior passes;
11. performance, service-worker and security gates pass;
12. backup, migration and rollback procedures are tested;
13. deployment preview is approved;
14. production smoke tests pass;
15. no critical or high-severity defect remains open.

Until every gate is met, report the system as **release candidate**, not fully production-ready.

---

## 12. Start now

Begin immediately with Phase A. Run the deployment-free all-industry readiness audit, repair its failures branch by branch, rerun the 13-dashboard local Chromium preview, and provide the combined audit report before requesting any deployment permission.
