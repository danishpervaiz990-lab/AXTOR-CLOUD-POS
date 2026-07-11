# Production Architecture Plan

This document explains the future production architecture for Axtor POS Cloud. The current repository only makes the approved static demo live and prepares the roadmap. It does not add backend code yet.

## Architecture principle

The static demo is the approved UI/UX prototype. The production system should migrate carefully from the demo logic into real backend services without redesigning the product randomly.

## Current layer

```txt
Browser
├── HTML pages
├── CSS green-glass theme
├── JavaScript demo logic
├── localStorage/sessionStorage demo data
├── manifest.webmanifest
└── service worker
```

This layer is useful for demo, UX approval, investor/client preview, and feature planning.

It is not enough for production because business-critical data cannot remain only in the browser.

## Future recommended architecture

```txt
Client Apps
├── Web frontend
├── PWA
└── Mobile apps later

Backend API
├── Auth and sessions
├── Tenant/company isolation
├── Role permissions
├── Business services
├── Invoice engine
├── Stock ledger engine
├── Payment and ledger engine
├── Reports engine
└── Audit logging

Data Layer
├── PostgreSQL
├── Redis later
├── S3-compatible object storage
└── Automated backups

Cloud / DevOps
├── GitHub repository
├── GitHub Actions CI/CD
├── Staging environment
├── Production environment
├── Error logging
├── Uptime monitoring
└── Backup monitoring
```

## Frontend

Recommended path:

1. Keep current HTML/CSS/JS demo as the approved UI reference.
2. Stabilize page behavior and document modules.
3. Later migrate carefully to Next.js/React or another selected frontend stack.
4. Do not redesign the theme during migration.
5. Preserve the green-glass branding, sidebar/topbar layout, and user flows.

Possible production frontend choices:

- Next.js / React for SaaS web app
- Plain server-rendered templates if using Laravel or Django
- PWA support for cashier terminals
- Mobile app later after API stability

## Backend

Possible backend stacks:

### Option A — Node.js / NestJS

Good for structured enterprise APIs, TypeScript, modular services, queues, and scalable SaaS architecture.

### Option B — Laravel

Good for fast business app development, authentication, queues, jobs, database migrations, and admin-style ERP systems.

### Option C — Django

Good for rapid secure backend development, admin tooling, PostgreSQL, and business rules.

Recommended final choice should depend on developer/team skill, long-term support, and available hosting.

## Database

Recommended database: **PostgreSQL**.

Reasons:

- Strong relational integrity
- Reliable transactions
- Good support for reporting queries
- Suitable for invoices, ledgers, stock movements, branches, users, and tenants
- Mature backup and restore ecosystem

## Cache and queue

Redis can be added later for:

- background jobs
- report caching
- rate limiting
- session storage
- queued invoice PDF/email/WhatsApp tasks

Do not add Redis in the first static GitHub setup phase.

## File storage

Use S3-compatible storage later for:

- invoice PDFs
- product images
- company logos
- import/export files
- backup exports

Possible providers:

- AWS S3
- Cloudflare R2
- DigitalOcean Spaces
- Backblaze B2

## Authentication and authorization

Future auth should support:

- secure login
- password hashing
- password reset
- session/JWT strategy
- tenant isolation
- branch access
- role permissions
- audit logging

Auth must be enforced server-side, not only in frontend JavaScript.

## Tenant/company isolation

Every business table should include `tenant_id` or be tenant-scoped through a parent relationship.

Important rules:

- User from Company A must never access Company B data.
- All invoices, products, payments, customers, suppliers, stock, reports, settings, and templates must be tenant-scoped.
- Branch filtering must be enforced server-side.

## Invoice engine

Server-side invoice engine should handle:

- invoice number generation
- draft invoices
- completed invoices
- credit/cash/partial payment
- returns
- tax/discount rules
- customer balance posting
- stock ledger posting
- salesman commission posting
- audit logs

## Stock engine

Stock must be ledger-based, not just a number update.

Every stock change should create a stock ledger entry:

- source type
- source document
- product
- branch
- quantity in/out
- unit cost
- running quantity if needed
- created by
- timestamp

## CI/CD

Use GitHub Actions later for:

- linting
- tests
- build checks
- backend migrations in deployment pipeline
- staging deployment
- production deployment

For this static phase, GitHub Pages branch deployment is enough.

## Backups

Production backup requirements:

- automated PostgreSQL daily backups
- point-in-time recovery if host supports it
- backup restore test schedule
- separate storage from main database server
- retention policy

## Monitoring

Minimum monitoring:

- API error logs
- database errors
- uptime checks
- failed job alerts
- backup success/failure alerts
- slow report query tracking

## Environments

Recommended environments:

```txt
local      developer machine
staging    client/demo testing with real backend but test data
production live customers and real business data
```

Never test destructive backend changes directly on production.
