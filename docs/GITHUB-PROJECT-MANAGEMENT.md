# GitHub Project Management Plan

Use GitHub issues and milestones to manage the conversion from static demo to production SaaS POS/ERP.

## Branch strategy

Recommended branches:

- `main` — stable static demo and approved documentation
- `develop` — integration branch for planned changes
- `feature/*` — feature branches
- `fix/*` — bug fix branches
- `docs/*` — documentation updates
- `release/*` — release preparation later

Rules:

- Protect `main` after first live deployment.
- Use pull requests for changes after the initial commit.
- Keep GitHub Pages deploying only stable demo changes.
- Do not mix backend experiments directly into the stable static demo.

## Milestones

1. `M1 — Static GitHub Demo Live`
2. `M2 — Production Architecture Finalized`
3. `M3 — Database + API Blueprint`
4. `M4 — Backend Foundation`
5. `M5 — Auth + Tenants + Roles`
6. `M6 — Products + Customers + Suppliers`
7. `M7 — Sales + POS Terminal`
8. `M8 — Stock Ledger + Reports`
9. `M9 — Payments + Ledgers`
10. `M10 — SaaS Deployment`

## Issue examples

### M1 — Static GitHub Demo Live

- Setup GitHub Pages static demo
- Verify root redirect to `demo-static/index.html`
- Verify all static routes and links
- Verify CSS/JS/assets loading on GitHub Pages
- Verify service worker and manifest behavior
- Complete manual static QA checklist

### M2 — Production Architecture Finalized

- Review production architecture document
- Select backend stack
- Select hosting provider for staging
- Select PostgreSQL hosting option
- Plan backup and monitoring strategy

### M3 — Database + API Blueprint

- Design PostgreSQL schema
- Review database indexes and constraints
- Design REST API contract
- Define API error response format
- Define document numbering rules

### M4 — Backend Foundation

- Create backend project skeleton
- Add environment config
- Add PostgreSQL connection
- Add migrations setup
- Add health check endpoint
- Add logging and error handler

### M5 — Auth + Tenants + Roles

- Plan authentication and roles
- Implement login/logout
- Implement tenant/company isolation
- Implement role permission middleware
- Add branch access rules
- Add audit log foundation

### M6 — Products + Customers + Suppliers

- Build Customer API
- Build Supplier API
- Build Product API
- Add product barcode/SKU search
- Add opening balances
- Add opening stock

### M7 — Sales + POS Terminal

- Build Sales Invoice API
- Build draft invoice flow
- Build POS Terminal checkout API
- Build hold/recall sale backend flow
- Plan invoice numbering
- Plan PDF invoice generation

### M8 — Stock Ledger + Reports

- Plan stock ledger
- Implement sale stock deduction transaction
- Implement return stock posting
- Implement stock adjustment
- Build stock movement report
- Build low-stock report

### M9 — Payments + Ledgers

- Plan customer receivables
- Plan supplier payables
- Build customer receive payment API
- Build supplier payment API
- Build customer ledger report
- Build supplier ledger report

### M10 — SaaS Deployment

- Plan cloud deployment
- Create staging environment
- Create production environment
- Add automated backups
- Add monitoring
- Add subscription/SaaS billing plan
- Plan WhatsApp/SMS/email integration

## Recommended labels

- `type:bug`
- `type:feature`
- `type:docs`
- `type:qa`
- `type:architecture`
- `type:backend`
- `type:frontend`
- `type:devops`
- `priority:high`
- `priority:medium`
- `priority:low`
- `status:blocked`
- `status:ready`

## First commit message

```txt
chore: initialize Axtor POS Cloud static demo repo
```
