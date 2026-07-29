# Axtor POS — All-Industries Platform Features Implementation

## Objective
Add the following shared SaaS capabilities to all 13 industry applications without replacing their dedicated workflows, navigation, or shared PostgreSQL backend:

1. AI-powered business insights
2. Mobile barcode and QR scanning
3. WhatsApp invoice sharing
4. Email invoice automation
5. SMS notifications
6. Customer loyalty
7. Gift cards
8. Multi-warehouse management
9. Offline synchronization
10. Immutable audit logs
11. Advanced approval workflows
12. Multi-company support
13. Multi-country tax engine
14. Currency exchange-rate locking
15. Scheduled backups
16. Advanced analytics
17. Custom dashboard builder
18. API documentation and developer portal
19. Dedicated industry visual themes

## Safety Rules
- Work only through isolated enhancement branches and draft PRs.
- Do not merge to `main`, `backend`, or permanent `frontend-*` branches until the current release candidate is production-certified.
- Do not trigger Railway or Vercel deployments.
- Do not store authoritative business records in localStorage.
- Preserve `business_id`, company, branch, warehouse, and industry tenant scoping on every database record and API query.
- Every mutation must be permission checked, auditable, idempotent where required, and covered by tests.

## Architecture

### Shared backend domains
Implement reusable backend modules once, enabled through entitlements and industry capability configuration:

- `insights`: metric snapshots, recommendations, anomaly flags, forecast jobs
- `communications`: WhatsApp, email and SMS providers, templates, consent and delivery logs
- `loyalty`: points ledger, tiers, rewards, expiry and redemption
- `gift-cards`: issuance, activation, balance ledger, redemption and voiding
- `warehouses`: warehouses, bins, transfers, counts and availability
- `offline-sync`: device registration, sync cursors, outbox, conflict resolution and replay protection
- `audit`: append-only actor/action/resource/change log
- `approvals`: policies, requests, steps, delegation and decisions
- `companies`: tenant company groups, legal entities and inter-company access
- `tax`: country packs, registrations, tax codes, inclusive/exclusive calculations and document snapshots
- `currency`: exchange-rate sources, manual rates and immutable document-rate snapshots
- `backups`: backup policies, run history, retention metadata and restore drills
- `analytics`: dimensions, metrics, saved reports, exports and scheduled reports
- `dashboards`: user/role dashboard layouts and widget permissions
- `developer`: API keys, scopes, webhook subscriptions, request logs and OpenAPI publication

### Shared frontend runtime
Create shared adapters used by every industry branch:

- feature entitlement loader
- industry theme loader
- camera scanner component
- share/send dialog
- offline status and sync queue
- approval inbox and action dialog
- audit timeline
- warehouse selector
- company selector
- tax/currency document snapshot viewer
- analytics and dashboard widget registry

Dedicated industry pages must remain industry-specific; shared components may not restore a generic workspace.

## Delivery Sequence

### Phase 0 — Contracts and test gates
- Add capability registry for all industries.
- Add theme-token registry for all industries.
- Define Prisma models, API contracts, permissions and event names.
- Add CI checks for tenant scoping, industry entitlement, accessibility, theme contrast and service-worker safety.

### Phase 1 — Governance foundation
Implement first because every later feature depends on it:
- immutable audit logs
- advanced approval workflows
- multi-company context
- permissions and entitlement registry
- API request correlation IDs

### Phase 2 — Commercial and inventory foundation
- multi-warehouse management
- loyalty
- gift cards
- multi-country tax engine
- currency exchange locking

### Phase 3 — Communications and scanning
- mobile barcode/QR scanning
- WhatsApp sharing
- email automation
- SMS notifications
- delivery status and retry handling

### Phase 4 — Offline and operations
- offline read cache
- encrypted device outbox
- deterministic conflict handling
- idempotent replay
- scheduled backups and restore evidence

### Phase 5 — Intelligence
- advanced analytics
- AI insights with explainable source metrics
- custom dashboard builder
- scheduled reports

### Phase 6 — Developer platform
- OpenAPI 3.1 specification
- API-key scopes
- webhook signing and retries
- developer portal
- sandbox tenant documentation

## Industry Theme System
Themes must use CSS custom properties and accessible contrast. Business data and navigation behavior must never be encoded in the theme.

| Industry | Theme direction | Primary | Secondary | Accent | Visual character |
|---|---|---:|---:|---:|---|
| Retail | modern commerce | #0F766E | #134E4A | #F59E0B | clean product-led cards |
| Grocery | fresh market | #15803D | #166534 | #FACC15 | fresh, energetic, high readability |
| Pharmacy | clinical trust | #0E7490 | #155E75 | #22C55E | clean white surfaces and safety cues |
| Gym | performance | #DC2626 | #111827 | #F97316 | dark athletic surfaces and bold metrics |
| School | bright learning | #2563EB | #7C3AED | #FBBF24 | colorful, welcoming and easy to scan |
| Clinic | calm healthcare | #0284C7 | #0F766E | #38BDF8 | calm, spacious and reassuring |
| Restaurant | black and yellow | #111111 | #27272A | #FACC15 | bold menu and kitchen visibility |
| Hardware | industrial utility | #334155 | #1E293B | #F97316 | rugged, practical and dense |
| Paint | color studio | #7C3AED | #DB2777 | #22D3EE | controlled color accents and swatches |
| Furniture | warm premium | #78350F | #44403C | #D6A756 | warm neutral surfaces and premium feel |
| Workshop | automotive service | #1F2937 | #0F172A | #EF4444 | technical, high-contrast status views |
| Wholesale | logistics | #1D4ED8 | #334155 | #10B981 | efficient tables and bulk-operation cues |
| Manufacturing | production control | #374151 | #111827 | #F59E0B | machine-floor clarity and status emphasis |

## Industry Capability Mapping
All industries receive the shared foundation, while defaults and widgets vary:

- Retail: loyalty, gift cards, scanner, multi-warehouse, customer analytics
- Grocery: expiry/batch scanning, loyalty, promotions, replenishment analytics
- Pharmacy: batch/expiry, restricted approvals, patient communication, audit emphasis
- Gym: membership loyalty, attendance QR, renewal messaging, trainer analytics
- School: student QR, fee messaging, approval workflows, colorful academic dashboard
- Clinic: appointment messaging, patient QR, practitioner approvals, compliance audit
- Restaurant: table/order QR, kitchen alerts, loyalty, gift cards, black/yellow operations UI
- Hardware: warehouse/bin control, bulk scanning, quotation approvals
- Paint: formula/color references, batch stock, customer loyalty, visual swatch widgets
- Furniture: quotation approvals, delivery communication, warehouse and order analytics
- Workshop: vehicle/job QR, parts warehouses, approval and customer status messaging
- Wholesale: bulk pricing approvals, multi-warehouse, credit controls, advanced analytics
- Manufacturing: work-order scanning, material warehouses, approvals, audit, cost insights

## Required Verification Per Feature
Every feature is incomplete until it passes:
- Prisma validation and migration review
- TypeScript production build
- unit and integration tests
- tenant-isolation tests
- role-denial tests
- cross-industry denial tests
- browser E2E on representative industry branches
- accessibility and responsive checks
- audit-event verification
- PostgreSQL reconciliation
- deployment-free CI

## First Implementation Sprint
1. Add the capability and theme registries.
2. Add audit-log and approval-domain schemas/contracts.
3. Add shared frontend theme loader using CSS variables.
4. Apply themes to one pilot branch each for bright, dark and clinical families: School, Restaurant and Pharmacy.
5. Run visual and accessibility checks.
6. Generalize to the remaining ten branches.
7. Open draft PRs only; do not merge or deploy.
