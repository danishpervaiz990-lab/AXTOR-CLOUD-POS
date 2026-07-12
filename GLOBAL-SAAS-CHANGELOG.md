# Global SaaS Changelog - 2026.07

## Commercial core

- Added centralized Basic, Standard, Professional/Best Value and Custom/Enterprise plan catalog.
- Added plan features, tenant subscriptions, overrides, usage records, subscription invoices and manual-provider payment records.
- Added backend feature enforcement, read-only subscription handling, user/branch/warehouse/currency/language limits, trial/grace/active/suspended/cancelled/expired states, and idempotent catalog seed.
- Added a separate server-allowlisted platform administration API and UI for tenant creation, suspension, plan changes, onboarding reset and session revocation.

## Customer onboarding

- Replaced the localStorage demo setup with a database-backed, resumable onboarding wizard.
- Added empty-business default, explicit sample-data choice, default branch, warehouse, counter, cash account, document counters and 14 role templates.
- Added forced strong-password change for platform-created tenant owners.

## Internationalisation

- Added centralized JSON translation runtime for English, Arabic, Simplified Chinese, Hindi, Urdu, Hinglish, Swahili, French, Spanish and Portuguese.
- Added per-user language preference, tenant default language, RTL direction/layout handling, and `Intl` currency formatting.

## Currency and localization

- Added ISO-compatible currency catalog, tenant base/enabled currencies, manual historical exchange rates and provider interfaces.
- Added immutable document currency-rate records and transaction/base amounts for sales, payments, refunds, purchases, supplier payments and expenses.
- Added country/time zone/number/date configuration and flexible tax settings/rates.

## Industry profiles

- Added shared configurable Retail, Pharmacy, Restaurant & Café, Factory & Light Manufacturing, Wholesale & Distribution and Service Business profiles.
- Added industry feature and terminology configuration without cloning the application.

## Security and reliability

- Replaced permissive production CORS with configured origin allowlisting.
- Added request IDs, login attempt throttling, active sessions, token-session revocation, strong temporary-password enforcement and safe platform-admin separation.
- Added frontend security headers, explicit offline status, safe no-posting offline page and service-worker cache versioning.
- Preserved idempotency, advisory locks, stock/payment transactions, over-return/over-refund protection, permission-safe invoice editing and the verified Sales performance fix.

## Deployment

- Added additive Prisma migration with backfill, recovery note, catalog seed, Railway start workflow, Vercel headers, deployment guide, QA report and rollback procedure.
