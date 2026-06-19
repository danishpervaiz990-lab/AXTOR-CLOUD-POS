# Backend Conversion Plan

The goal is to convert the approved static Axtor POS Cloud demo into a real SaaS POS/ERP system without breaking the current UI/UX.

## Rule for this phase

Do not start backend coding until the database blueprint, API blueprint, and business rules are reviewed.

## Step 1 — Freeze the static demo as UI reference

Actions:

- Keep `demo-static/` as the approved prototype.
- Do not redesign the green-glass theme.
- Do not rename pages unless there is a strong technical reason.
- Document every current localStorage key and flow.

Deliverable:

- Static demo remains live on GitHub Pages.

## Step 2 — Map static flows to backend modules

| Static flow | Current demo storage | Future backend module |
|---|---|---|
| Login | demo/session logic | Auth + User sessions |
| Products | localStorage | Product API + stock tables |
| New sale | localStorage/cart | Sales Invoice API |
| Terminal sale | localStorage/sessionStorage | POS Terminal API |
| Draft invoice | localStorage | Draft Invoice API |
| Saved invoices | localStorage | Invoice API + invoice_items |
| Customer payment | localStorage | Payment API + customer_ledger |
| Supplier payment | localStorage | Payment API + supplier_ledger |
| Stock deduction | localStorage | Stock Ledger service |
| Salesman commission | localStorage | Commission service |
| Reports | demo arrays/localStorage | Report API queries |
| Settings | localStorage | Tenant settings API |
| Invoice templates | localStorage | Invoice template API |

## Step 3 — Choose backend stack

Recommended shortlist:

1. Node.js + NestJS + PostgreSQL
2. Laravel + PostgreSQL
3. Django + PostgreSQL

Selection criteria:

- developer skill availability
- speed of implementation
- long-term maintainability
- permissions system needs
- reporting requirements
- deployment cost

## Step 4 — Create backend foundation

Initial backend foundation should include:

- health check endpoint
- environment configuration
- PostgreSQL connection
- migrations
- seed system admin user
- logging
- error handler
- validation layer
- authentication skeleton
- tenant middleware skeleton

## Step 5 — Build core SaaS foundation first

Do not start invoices before tenant/auth foundations are ready.

Order:

1. Tenants/companies
2. Users
3. Roles/permissions
4. Branches
5. Settings
6. Counters/invoice numbering

## Step 6 — Build master data

Master data APIs:

- customers
- suppliers
- products
- product batches if needed
- opening stock
- price levels later

## Step 7 — Build invoice and POS services

Required backend transaction flow for completed sale:

1. Validate tenant, branch, user, customer, products, prices, stock rules.
2. Generate invoice number server-side.
3. Insert invoice.
4. Insert invoice items.
5. Post payment record if paid/partial.
6. Post customer ledger entry if credit/partial.
7. Post stock ledger entries.
8. Update stock summary if using summary table.
9. Post salesman commission if applicable.
10. Add audit log.
11. Return printable invoice payload.

## Step 8 — Build ledgers

Customer ledger:

- opening balance
- credit invoices
- customer payments
- returns
- adjustments

Supplier ledger:

- purchase invoices
- supplier payments
- purchase returns
- adjustments

## Step 9 — Build reports

Start with essential reports:

- daily sales
- cashier closing
- customer aging
- supplier aging
- stock movement
- low stock
- product sales
- salesman commission

## Step 10 — Production integrations

Add only after core data is reliable:

- PDF invoice generation
- WhatsApp invoice message integration
- SMS provider
- email provider
- barcode/label printing improvements
- payment gateway if needed

## Step 11 — SaaS billing

Add subscription/billing after the product core is stable:

- plans
- limits
- subscription status
- payment provider
- trial period
- tenant suspension and reactivation

## Step 12 — Migration from demo to production frontend

Migration options:

- Keep HTML pages initially and connect them to APIs.
- Later migrate page-by-page to Next.js/React.
- Keep visual design unchanged during migration.

Recommended migration order:

1. Login/auth
2. Products
3. Customers/suppliers
4. Sales and terminal
5. Payments
6. Stock
7. Reports
8. Settings/templates

## Step 13 — Staging and production rollout

Before production:

- staging environment live
- database backup tested
- critical flows QA passed
- invoice numbering concurrency tested
- stock ledger tested
- role permissions tested
- branch/tenant isolation tested
- audit logs tested

## Do not do yet

- Do not add React/Vue/Angular/Vite in the GitHub setup phase.
- Do not rewrite the UI randomly.
- Do not replace static demo files before the production plan is approved.
- Do not use localStorage for production data.
- Do not deploy backend to GitHub Pages.

---

## Sales Document Conversion Note

When Phase 5 reaches Sales & Invoicing, build one backend sales document service that supports:

- Sales Invoice
- Quotation
- Delivery Note / DN

The existing static `demo-static/sales.html` selector is the UI reference. Do not redesign it. Replace only the data layer.

Implementation order for backend phase:

1. Create `sales_documents`, `sales_document_items`, and per tenant/branch counters.
2. Implement `POST /sales-documents` for draft/issued documents.
3. Add server-side Zod validation.
4. Add invoice issue transaction: document number, document rows, stock movement, ledger posting, commission/report eligibility.
5. Add quotation save/print without stock or ledger posting.
6. Add DN save/print without sales revenue posting. DN stock posting must depend on a future business setting.
7. Add `convert-to-invoice` so quotation/DN conversion creates a new invoice number and preserves source links.

