# Axtor POS Cloud Roadmap

This roadmap keeps the approved static UI/UX demo stable first, then converts the product into a real production SaaS POS/ERP system in controlled phases.

## Phase 1 — Static demo live on GitHub Pages

Goal: make the approved demo available online without redesigning or rebuilding it.

Deliverables:

- GitHub repository `axtor-pos-cloud`
- Static demo placed inside `demo-static/`
- GitHub Pages live URL
- Root redirect to `demo-static/index.html`
- Documentation for deployment and QA
- First manual QA pass after live deployment

Success criteria:

- Dashboard opens from GitHub Pages.
- Sidebar/topbar links work.
- CSS, JS, images, manifest, and service worker load correctly.
- Existing demo flows remain unchanged.

## Phase 2 — Code cleanup and module separation

Goal: prepare static JavaScript for future migration without changing the UI.

Tasks:

- Document current localStorage keys.
- Separate demo data, UI rendering, invoice logic, stock logic, and payment logic conceptually.
- Identify duplicate helper functions.
- Create a mapping from each static page to future API modules.
- Keep all existing HTML page names stable during cleanup.

## Phase 3 — Database design

Goal: design the real PostgreSQL data model before coding backend services.

Tasks:

- Finalize tenants, users, roles, branches, counters, customers, suppliers, products, invoices, payments, ledgers, stock, returns, purchases, commissions, audit logs, settings, and invoice templates.
- Decide required indexes and unique constraints.
- Define invoice numbering rules.
- Define stock ledger transaction rules.
- Define customer and supplier ledger posting rules.

## Phase 4 — Backend API

Goal: design and build REST APIs that replace localStorage demo logic.

Tasks:

- Auth API
- User/Role API
- Customer API
- Supplier API
- Product API
- Sales Invoice API
- POS Terminal API
- Payment API
- Stock API
- Purchase API
- Reports API
- Salesman Commission API
- Settings API
- Audit Log API

## Phase 5 — Authentication and roles

Goal: protect the system with real login and permissions.

Core roles:

- Owner / Super Admin
- Branch Admin
- Manager
- Cashier
- Salesman
- Accountant
- Inventory Controller
- Auditor / Read-only

Required security rules:

- Server-side role checks
- Branch-level access
- Tenant/company isolation
- Audit logs for sensitive actions
- Password reset and session management

## Phase 6 — Tenant/company system

Goal: convert the system into SaaS-ready multi-company architecture.

Tasks:

- Add tenant/company table.
- Add tenant_id to all business tables.
- Enforce tenant isolation in every query.
- Add branch and user assignment rules.
- Add company settings and invoice branding per tenant.

## Phase 7 — Invoice numbering server-side

Goal: move invoice number generation away from browser localStorage.

Rules:

- Invoice numbers must be generated inside backend transaction boundaries.
- Numbers must not duplicate under concurrent usage.
- Branch/company prefixes should be supported.
- Voids, drafts, and completed invoices need clear numbering policy.

## Phase 8 — Stock ledger

Goal: replace demo stock deduction with real stock ledger posting.

Stock events:

- Purchase received
- Sale completed
- Sale return
- Purchase return
- Stock adjustment
- Branch transfer
- Damage/expiry/write-off
- Opening stock

## Phase 9 — Customer/supplier ledgers

Goal: create real receivable and payable tracking.

Customer ledger postings:

- Credit sale debit
- Customer payment credit
- Sales return credit
- Opening balance
- Adjustment

Supplier ledger postings:

- Purchase invoice credit
- Supplier payment debit
- Purchase return debit
- Opening balance
- Adjustment

## Phase 10 — Reports

Goal: move reports from demo tables/charts into real backend queries.

Reports:

- Daily sales
- Cashier closing
- Payment method summary
- Customer aging
- Supplier aging
- Stock valuation
- Low stock
- Product movement
- Salesman performance
- Commission payable
- Profit estimate

## Phase 11 — PDF/WhatsApp/SMS/email integrations

Goal: support real document output and customer communication.

Tasks:

- Server-side PDF invoice generation
- Print-friendly receipt view
- WhatsApp message templates
- SMS provider integration
- Email provider integration
- Communication history table

## Phase 12 — Cloud deployment

Goal: deploy production app, API, database, storage, backups, and monitoring.

Starting options:

- Render
- Railway
- Fly.io
- DigitalOcean App Platform
- AWS Lightsail / ECS later

## Phase 13 — Subscription/SaaS billing

Goal: monetize the system as SaaS.

Tasks:

- Plans and limits
- Trial period
- Subscription status
- Payment provider integration
- Tenant suspension rules
- Billing invoices

## Phase 14 — Android/iOS app later

Goal: add mobile apps after backend APIs are stable.

Options:

- PWA first
- React Native later
- Flutter later

Mobile should not be started until the backend API and tenant model are stable.

---

## Roadmap Addition — Sales Documents

The Sales phase must include document type support from the approved static demo:

- Sales Invoice: `INV` counter, stock/ledger/reports apply.
- Quotation: `QTN` counter, printable, no stock deduction, no ledger posting, no sales revenue.
- Delivery Note / DN: `DN` counter, printable, separate from sales totals, future invoice linking/conversion.

Do not skip the original roadmap phases. This belongs in Phase 5 after the tenant/auth and master-data foundations are working.

