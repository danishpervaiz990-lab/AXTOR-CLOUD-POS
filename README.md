# Axtor Cloud POS Frontend

Static production frontend for Axtor Cloud POS.

## Stack

- HTML, Bootstrap 5.3.3 and vanilla JavaScript
- Vercel static deployment
- PostgreSQL-backed Railway API through `demo-static/js/axtor-api.js`
- PWA/service worker with network-first application code and safe offline fallback
- English, Arabic, Simplified Chinese, Hindi, Urdu, Hinglish, Swahili, French, Spanish and Portuguese

## Important paths

- `demo-static/login.html` - tenant login
- `demo-static/index.html` - dashboard
- `demo-static/setup.html` - database-backed onboarding
- `demo-static/plans.html` - subscription matrix/current plan
- `demo-static/platform-admin.html` - hidden, server-authorized platform-owner area
- `demo-static/js/platform-runtime.js` - shared localization, RTL, entitlement and subscription runtime
- `demo-static/i18n/` - translation dictionaries
- `vercel.json` - production security/cache headers

The approved green-glass theme, optional Retro POS theme, existing Sales performance fix, Products, Customers, Sales, Payments, Returns, Refunds and existing page URLs are preserved.

## Deployment

Deploy this repository only after the matching backend and database migration are healthy. Use `GLOBAL-SAAS-DEPLOYMENT-GUIDE.md` from the backend release package.

Do not commit API secrets or production records. The authentication token continues using the existing `localStorage.axtorAuthToken` compatibility key. Production transaction data remains on the backend; the shared runtime does not store it in localStorage.
