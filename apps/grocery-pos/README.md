# AXTOR Grocery POS Cloud

AXTOR Grocery POS Cloud is the isolated grocery and supermarket application inside the AXTOR POS Cloud repository.

## Isolation contract

- Application root: `apps/grocery-pos`
- Package: `@axtor/grocery-pos`
- API namespace for business modules: `/api/grocery`
- Health endpoints: `/api/health` and `/api/health/database`
- Database environment variable: `GROCERY_DATABASE_URL`
- Primary authentication: signed, secure, HTTP-only session cookie
- Tenant identity: derived only from the verified server session
- Money: PostgreSQL `Decimal` fields and `decimal.js`; never JavaScript binary floating point for persisted financial values
- Deployment target: a dedicated Vercel project rooted at this directory
- Railway dependency: none

The application must not import the legacy `frontend-grocery` branch, legacy Grocery HTML files, Retail UI, or the shared Railway backend.

## Local setup

```bash
cd apps/grocery-pos
npm install
cp .env.example .env.local
npm run prisma:generate
npm run prisma:validate
npm run dev
```

A PostgreSQL database is required for migrations and database-backed tests. Do not use a production database for local development.

## Quality commands

```bash
npm run prisma:validate
npm run typecheck
npm run test
npm run build
```

## Current implementation gate

This directory begins the clean backend-first replacement. It is not production-certified until migrations, authentication, tenant isolation, operational APIs, finance and cheque reconciliation, complete frontend workflows, Playwright coverage, realistic grocery simulation and production smoke tests have all produced recorded evidence.

## Documentation

Repository-wide Grocery audit and cutover records are stored in `/docs/grocery`.
