# Axtor Cloud POS - Backend Release Repository

This repository contains the Railway/PostgreSQL backend under `backend/` and the synchronized approved `demo-static/` reference used during integration.

Release `2026.07-global-saas` adds the central commercial SaaS foundation while preserving the verified Products, Customers, Sales, Payments, Returns, Refunds, permission-safe editing and Sales performance fixes.

Start here:

1. `GLOBAL-SAAS-DEPLOYMENT-GUIDE.md`
2. `AXTOR-GLOBAL-SAAS-RELEASE-REPORT.md`
3. `GLOBAL-SAAS-QA-REPORT.md`
4. `KNOWN-LIMITATIONS-GLOBAL-SAAS.md`
5. `GLOBAL-SAAS-CHANGELOG.md`

Railway must use `backend` as the service root. Do not upload `node_modules`, `.env`, secret values or production data to GitHub.

The global release includes:

- Four centralized plans and backend entitlements
- Industry profiles
- Tenant onboarding
- Protected platform administration
- Multi-currency rate snapshots and base amounts
- Localization, tax and country settings
- Session revocation and forced first-login password change
- Additive Prisma migration and idempotent catalog seed

Treat this package as a release candidate until the live staging checks marked BLOCKED/NOT TESTED in the QA report are completed.
