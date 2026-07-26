# Changed Files Manifest

## Railway P1012 follow-up

- `DEPLOYMENT-BUILD-ID.txt`
- `docs/RAILWAY-P1012-RESOLUTION-2026-07-26.md`
- `prisma/schema.prisma` — verified corrected model closures

## Backend

- `railway.toml`: removed duplicate `npm ci`.
- `package.json` and `package-lock.json`: added Node 22/npm 10 engines.
- `prisma/schema.prisma`: repaired three malformed model closures and thirteen missing Business relation arrays.
- `src/app.ts`: mounted Releases A–D.
- `src/server.ts`: explicit `0.0.0.0` binding.
- `src/config/env.ts`: aligned default port to 3000.
- Added compiled Release A–D controllers, services, routers and industry guard under `src/`.
- Removed nested backend copy and root-level obsolete TypeScript duplicates from the deployment package.

## Frontend

- Replaced broken `retail.html`.
- Added `grocery.html` and `pharmacy.html`.
- Centralized API-base resolution for Sales, Receive Payment, Returns and Release C/D pages.
- Repaired three Bootstrap asset references.
- Incremented `sw.js` and the service-worker registration version.
- Excluded invalid `terminal-backend.js`, obsolete root JavaScript copies and nested `demo-static/`.
- Added clean deployment README files and audit documentation.
