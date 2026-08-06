# AXTOR Grocery POS Cloud

AXTOR Grocery POS Cloud is the grocery-only frontend application inside the AXTOR POS Cloud repository.

## Architecture contract

- Application root: `apps/grocery-pos`
- Package: `@axtor/grocery-pos`
- Grocery compatibility API namespace: `/api/grocery`
- Shared backend proxy namespace: `/api/shared/[...path]`
- Backend: the existing AXTOR Node.js/Express/TypeScript service
- Backend environment variable: `AXTOR_SHARED_BACKEND_URL`
- Browser authentication: existing AXTOR JWT contract
- Tenant isolation: verified JWT plus `businessId` context forwarded to the shared backend
- Frontend deployment: an isolated Vercel project rooted at this directory
- Additional Railway service: prohibited
- Additional Grocery PostgreSQL database: prohibited for the target production architecture

Retail and every other industry remain unchanged. Grocery UI and workflows remain independent, but all production data is owned by the existing shared backend and PostgreSQL infrastructure.

## Migration compatibility

The application is being migrated from an earlier standalone Next.js/Prisma implementation. During migration, legacy `/api/grocery/*` URLs remain as compatibility bridges, but each bridge must delegate to the existing `/api/v1/*` backend. New code must not add direct Prisma writes, local tenant authority, local financial records or a second source of truth.

## Local setup

```bash
cd apps/grocery-pos
npm install
cp .env.example .env.local
npm run dev
```

Set `AXTOR_SHARED_BACKEND_URL` to the existing backend origin. Do not configure `GROCERY_DATABASE_URL` for the target shared-backend deployment.

## Quality commands

```bash
npm run typecheck
npm run test
npm run build
```

The migration is production-ready only when:

1. All Grocery routes delegate to the shared backend.
2. No production runtime requires `GROCERY_DATABASE_URL`.
3. Authentication and tenant isolation tests pass.
4. Products, customers, suppliers, inventory, purchases, sales, payments, returns, reports and cheques pass browser tests.
5. Owner, manager, cashier, salesman, accountant, inventory and viewer roles are certified live.
6. The isolated Grocery Vercel deployment passes frontend-to-backend testing.

## Deployment

Deploy only the Grocery frontend as a separate Vercel project with root directory `apps/grocery-pos`. Configure it to use the existing AXTOR backend. Do not create a dedicated Railway project or service for Grocery.

Repository-wide Grocery audit and cutover records are stored in `/docs/grocery`.
