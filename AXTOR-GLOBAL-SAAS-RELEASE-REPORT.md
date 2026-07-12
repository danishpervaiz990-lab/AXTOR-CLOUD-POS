# Axtor Cloud POS - Global SaaS Release Report

## Completed features

- Central subscription plans, features, limits, overrides, lifecycle states and manual billing abstraction.
- Backend enforcement for subscription read-only mode and gated Standard/Professional modules.
- Protected platform-owner tenant management separated from tenant roles.
- Database-backed resumable customer onboarding and empty-tenant default.
- Strong first-login password change and session revocation.
- Shared six-industry profile architecture and seed catalog.
- ISO currency catalog, business currencies, manual rates and historical document-rate snapshots.
- Base/transaction amounts for sales, payments, refunds, purchases, supplier payments and expenses.
- Ten-language translation files, per-user preference, RTL and `Intl` formatting.
- Country/time-zone/date/number/tax configuration and tenant tax rates.
- Request IDs, login throttling, CORS allowlist, security headers, offline status and safe PWA update.
- Additive migration, backfill, recovery note, seeds, deployment guide, QA report and rollback plan.

## Subscription matrix

| Capability | Basic | Standard | Professional - Best Value | Custom / Enterprise |
| --- | --- | --- | --- | --- |
| Users | 2 | 10 | 50 | Custom |
| Branches | 1 | 3 | 10 | Custom |
| Warehouses | 1 | 5 | 25 | Custom |
| Currencies | 1 | 5 | 20 | Custom |
| Languages | 2 | 10 | 10 | Custom |
| Core products/customers/sales | Yes | Yes | Yes | Yes |
| Purchases/suppliers/expenses/accounts | No | Yes | Yes | Configurable |
| Promotions/loyalty/approvals | No | Basic | Advanced | Configurable |
| Advanced inventory/batch/serial | No | Partial | Entitled | Configurable |
| Industry modules | Core retail use | Shared standard modules | Industry entitlements | Custom workflows |
| API access | No | No | Yes | Yes |
| White label | No | No | No | Yes |
| Support | Email | Standard | Priority | SLA |

Prices remain platform configuration and are not invented in source code.

## Industry matrix

| Profile | Central configuration | Relevant feature gates | Advanced operational workflow status |
| --- | --- | --- | --- |
| Retail | Complete | Complete | Existing retail POS retained |
| Pharmacy | Complete | Complete | Batch/FEFO operational UI pending |
| Restaurant & Café | Complete | Complete | Tables/KDS/recipe UI pending |
| Factory & Light Manufacturing | Complete | Complete | BOM/work-order/MRP UI pending |
| Wholesale & Distribution | Complete | Complete | Route/dispatch/price-list workflow pending |
| Service Business | Complete | Complete | Job-card/appointment workflow pending |

## Database changes

New commercial models include subscription plans/features, tenant subscriptions/overrides/usage/invoices/payments, industry profiles/features/settings, currencies/business currencies/rates/document rates, locale/tax configuration, onboarding, sessions and import-job tracking.

Existing business, user, customer, supplier, sales, payment, refund, purchase, supplier-payment and expense models received additive localization, security or currency fields. Compound tenant indexes and foreign keys are included. Existing financial rows are preserved and backfilled without changing recorded transaction totals.

Migration: `backend/prisma/migrations/20260712123000_global_saas_foundation/`.

## Release decision

Code-level validation is green. This package should be treated as a **release candidate** until the blocked PostgreSQL, live deployment, tenant-isolation, mobile and financial regression tests in `GLOBAL-SAAS-QA-REPORT.md` are completed on staging.
