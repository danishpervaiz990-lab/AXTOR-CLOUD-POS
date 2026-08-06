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
- Deployment target: a dedicated Railway service rooted at this directory
- Shared AXTOR backend dependency: none

The application must not import the legacy `frontend-grocery` branch, legacy Grocery HTML files, Retail UI, or the shared multi-industry backend.

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

## Railway release

Create a separate Railway service with root directory `apps/grocery-pos`. The included `railway.toml` builds the Next.js application, applies the versioned Prisma migration, upserts the protected demo tenant and starts the service on Railway's assigned `PORT`.

Required deployment variables and isolation rules are documented in `RAILWAY.md`.

## Cutover

The active AXTOR Grocery route no longer fetches the historical `frontend-grocery` branch. The central Vercel Grocery gateway redirects only Grocery traffic to the dedicated Railway service. Retail and all other industry routes remain unchanged.

## Documentation

Repository-wide Grocery audit and cutover records are stored in `/docs/grocery`.
