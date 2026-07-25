# Axtor POS Cloud — Stability Release (25 July 2026)

## Corrected defects

- Sales document numbering is now locked and allocated once per business and document type. Existing saved document numbers are reconciled before allocation, preventing the `(business_id, document_no)` unique-constraint failure after branch use, restores, or stale counters.
- Number previews use the same business-wide sequence logic as posting. The displayed value remains a preview; the backend remains the source of the official number.
- Terminal credit is now an unpaid balance, never money received. It shows the real balance, validates a supplied credit amount, requires a named customer, and sends a due date calculated from the customer's credit days (30 days when no credit terms are configured).
- Sales validation and backend enforcement require a due date only when an invoice actually has an outstanding balance.
- Custom / Enterprise onboarding creates an active manual subscription. The included migration promotes existing current Enterprise subscriptions that were incorrectly marked as trials; normal self-service trial plans are unaffected.
- The trial banner is suppressed for Custom / Enterprise while the migration is being applied.
- The accidentally corrupted backend `package.json`, `package-lock.json`, and frontend `sw.js` were restored. The service worker cache identifier is advanced to force current assets after deployment.
- Morgan was updated to 1.11.0 to resolve the production dependency audit findings.

## Validation completed

- All frontend JavaScript files: syntax checks passed.
- Service worker and JSON manifests: syntax/JSON checks passed.
- Backend: Prisma client generation, schema validation, TypeScript typecheck, and production build passed.
- Production dependency audit: zero vulnerabilities.

## Safe deployment order

1. Back up the production PostgreSQL database.
2. Deploy the backend package and run `npm run prisma:deploy` exactly once. This applies only the scoped Enterprise subscription correction; it does not delete or reset data.
3. Deploy the frontend package. The updated service worker refreshes the browser cache automatically.
4. Verify one cash invoice, one fully paid terminal sale, one credit terminal sale, and a concurrent/new sales invoice on staging before production traffic is resumed.

## Scope note

This is a source-level stability release. It does not claim that optional industry workflows such as pharmacy FEFO, restaurant kitchen display, manufacturing MRP, wholesale route dispatch, or service job cards are complete unless their dedicated backend workflows are separately implemented and acceptance-tested.
