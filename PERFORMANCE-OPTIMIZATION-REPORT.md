# Axtor POS Cloud — Performance Optimization Pass

## Confirmed observations
- Sales page loaded approximately 101 requests in the supplied browser capture.
- `/api/v1/sales-documents` was requested by Sales, Receive Payment, and Returns modules during the same startup window.
- `/api/v1/sales-documents/context` returned 404 on the deployed backend, although the supplied backend source contains this route.
- Sales loaded several large local/demo scripts that are not required for backend Sales operation.
- The service worker precached nearly every page and many large scripts during installation.

## Changes
1. Added in-flight GET request coalescing to `js/axtor-api.js`.
2. Added short TTL caching for products, customers, sales documents, context, and `/auth/me`.
3. All mutation requests clear the frontend response cache automatically.
4. Sales page now declares backend-only mode.
5. In backend Sales mode, `app-data.js` initializes only scanner, keyboard shortcuts, and PWA registration; local demo rendering is skipped.
6. Removed Chart.js, charts.js, retail-advanced.js, invoice-templates.js, and axtor-fixes.js from Sales page startup.
7. Replaced the service worker with a minimal app-shell strategy and explicit API bypass.
8. Updated asset versions to force Vercel/browser refresh.

## Expected effect
- Three simultaneous Sales document list requests collapse into one network request.
- Hundreds of kilobytes of unused JavaScript are no longer parsed/executed on Sales startup.
- Large localStorage demo rendering no longer competes with backend Sales rendering.
- Service-worker installation no longer downloads the full application.

## Backend note
The supplied backend already includes:
`GET /api/v1/sales-documents/context`

A 404 in production means Railway is running an older backend revision or the wrong branch/root directory. Deploy the supplied backend package before final Sales QA.
