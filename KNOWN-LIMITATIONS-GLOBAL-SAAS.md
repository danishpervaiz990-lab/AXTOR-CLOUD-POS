# Known Limitations - Global SaaS Release Candidate

This delivery is a commercially structured release candidate. The shared SaaS, subscription, onboarding, localization, security and currency foundations are implemented. The following items are intentionally disclosed and must not be sold as completed functionality yet.

1. The industry catalog and feature gates are complete, but advanced operational screens/APIs for pharmacy FEFO/batch recall, restaurant floor/KDS/recipes, manufacturing BOM/work orders/MRP, wholesale route dispatch and service job cards are not implemented in this iteration. They remain absent from menus; no fake buttons were added.
2. Stripe, PayPal and local gateways are not connected. A provider interface and manual activation workflow exist. Credentials and commercial configuration are required before adding a live provider.
3. Exchange rates are manual. The provider interface exists, but no paid or external exchange-rate API is required or enabled.
4. The application configuration export is not a full transactional backup. PostgreSQL/Railway backups remain mandatory.
5. Bulk CSV import, validation preview and row-level error UI for all requested entities is not completed in this iteration.
6. Email delivery, password-reset email, email verification, webhooks and external accounting/e-commerce/hardware integrations are architectural extension points, not live integrations.
7. Country tax settings are configurable but are not certified for any tax authority. No legal or fiscal-device compliance claim is made.
8. A live PostgreSQL fresh/upgrade migration, live Railway/Vercel deployment, mobile browser matrix, large-data load test and backup restore drill could not be executed in the delivery environment. They are explicitly marked BLOCKED or NOT TESTED in the QA report.
9. Existing historical records are backfilled at rate `1` because their original exchange-rate source was not previously stored. This preserves their recorded totals but cannot reconstruct a historical rate that never existed in the database.
10. True offline financial posting is intentionally disabled. Cached pages are for reference; sales, payments, returns, refunds and stock mutations require confirmed server connectivity to prevent duplicate or conflicting financial writes.
11. The centralized translation engine, ten reviewed core dictionaries and RTL shell are implemented. Navigation, common actions and new commercial/onboarding surfaces are localized; some legacy page-specific paragraphs, uncommon fields and report labels still require conversion to translation keys before those pages can be described as fully translated.
