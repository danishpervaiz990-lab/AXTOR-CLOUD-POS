# Axtor Cloud POS - QA Report

Status date: 12 July 2026

## Executed in the delivery environment

| Test | Result | Evidence / scope |
| --- | --- | --- |
| PDF master prompt extraction | PASS | All 38 pages extracted; all pages rendered to images and visually inspected as a contact sheet. |
| Prisma schema validation | PASS | Real Prisma 6.19 `prisma validate`. |
| Prisma client generation | PASS | Real Prisma 6.19 client generated from the final schema. |
| TypeScript no-emit compile | PASS | `tsc --noEmit -p tsconfig.json`. |
| Backend production build | PASS | `npm run build`. |
| Backend `/health` | PASS | Compiled server started locally and returned `ok: true`. |
| Backend `/` route map | PASS | Compiled server returned legacy and new route families. |
| Production CORS allowlist | PASS | Configured Vercel origin received CORS header; an unlisted origin did not. |
| Login attempt throttling | PASS | Eleventh repeated login attempt returned HTTP 429 with safe retry message. |
| Frontend JavaScript syntax | PASS | Every `demo-static/js/*.js` file passed `node --check`. |
| Translation/manifest/Vercel JSON | PASS | All JSON parsed successfully. |
| HTML local script/style references | PASS | All local references resolved. |
| Duplicate HTML IDs | PASS | Static duplicate-ID scan passed all pages. |
| Service-worker asset list | PASS | Every cached local path exists. |
| Sales freeze-fix preservation | PASS (static) | Existing Sales files were retained; no observer loop or mass-render rewrite was introduced. |
| ZIP integrity | PASS | All four deliverables passed `unzip -t`; forbidden `node_modules`, build output, `.env` and secret paths were absent. |

## Requires deployed infrastructure

| Test | Result | Reason / required action |
| --- | --- | --- |
| Fresh PostgreSQL migration | BLOCKED | No PostgreSQL server is available in the delivery container. Run on staging before production. |
| Upgrade existing production copy | BLOCKED | Requires a sanitized production clone and Railway snapshot. |
| Live tenant isolation attack tests | NOT TESTED | Requires two deployed tenants and authenticated API requests. |
| Live plan/feature enforcement | NOT TESTED | Requires deployed catalog seed and multiple plan tenants. |
| Live first-login password change | NOT TESTED | Requires deployed database and browser. |
| Currency document/payment/refund posting | NOT TESTED | Requires deployed database and controlled financial fixtures. |
| Mobile 360/390 px browser QA | NOT TESTED | Requires deployed browser session and device emulation. |
| Tablet 768/1024 px browser QA | NOT TESTED | Requires deployed browser session and device emulation. |
| Railway/Vercel CORS and CSP | NOT TESTED | Requires final production domains. |
| 10k products / 10k customers / 50k sales load test | NOT TESTED | Requires staging database and load-test approval. |
| Backup restore drill | NOT TESTED | Requires Railway backup/PITR configuration. |

## Mandatory live acceptance sequence

1. Snapshot the database and deploy backend only.
2. Confirm migrations, catalog seed, `/health`, and `/api/v1/health/db`.
3. Verify an old tenant can log in and its historical invoices retain totals.
4. Create two test tenants. Attempt cross-tenant IDs against products, customers, invoices, payments, returns, settings, and commercial endpoints. Every attempt must return no foreign data.
5. Create Basic, Standard, Professional and Enterprise subscriptions and test blocked API requests directly, not only hidden buttons.
6. Run invoice, partial payment, partial return, refund, over-return, over-refund and double-click idempotency cases from the existing Production QA plan.
7. Test USD sale with QAR base rate, then change the current rate. The old document base total must not change.
8. Test Arabic and Urdu RTL at mobile and desktop widths; verify print output separately.
9. Test first-login temporary password enforcement and session revocation.
10. Deploy frontend, clear caches, and repeat Sales-page freeze/performance regression tests.

Do not mark the release customer-live until every BLOCKED/NOT TESTED item that applies to the purchased tier is executed in staging and recorded.
