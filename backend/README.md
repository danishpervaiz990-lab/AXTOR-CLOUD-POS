# Axtor POS Cloud Backend — Phase 2 Foundation

This folder is the Phase 2 production backend/database foundation for Axtor POS Cloud.

The approved static frontend remains in `demo-static/` and is intentionally not connected to this backend yet.

Live Phase 1 frontend reference:

```txt
https://axtorpos.vercel.app/
```

## Scope of this phase

Phase 2 is database/backend foundation only:

- Express.js + TypeScript API skeleton
- PostgreSQL via Prisma ORM
- Multi-tenant shared database/shared schema model
- `business_id` on every business table
- Health endpoints
- Env validation
- Prisma client setup
- Tenant middleware placeholder
- Railway deployment notes

Frontend integration is a later phase.

## Folder structure

```txt
backend/
  package.json
  tsconfig.json
  .env.example
  README.md
  prisma/
    schema.prisma
  src/
    server.ts
    app.ts
    config/
      env.ts
    db/
      prisma.ts
    middleware/
      error.middleware.ts
      tenant.middleware.ts
    routes/
      health.routes.ts
    controllers/
      health.controller.ts
    types/
      express.d.ts
```

## Local setup

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Open:

```txt
http://localhost:4000/health
http://localhost:4000/api/v1/health
```

## Required environment variables

```txt
DATABASE_URL
PORT
NODE_ENV
APP_NAME
API_PREFIX
CORS_ORIGIN
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
```

## Railway deployment notes

1. Create a Railway project.
2. Add a PostgreSQL database.
3. Copy the Railway PostgreSQL `DATABASE_URL`.
4. Create a backend service from this GitHub repo/branch.
5. Set Railway service root directory to:

```txt
backend
```

6. Add environment variables from `.env.example`.
7. Set build command:

```bash
npm install && npm run prisma:generate && npm run build
```

8. Set start command:

```bash
npm run start
```

9. First migration command after DB is ready:

```bash
npm run prisma:deploy
```

10. Test:

```txt
https://your-railway-backend-url/health
https://your-railway-backend-url/api/v1/health
```

## Multi-tenant strategy

Axtor POS Cloud uses a shared database/shared schema approach.

Every business-owned table includes:

```txt
business_id
```

Early API modules must always filter queries by the current tenant/business context.

Current placeholder:

```txt
x-business-id
```

Future production tenant resolution:

```txt
JWT/session -> user -> business_id -> tenant context
```

## PostgreSQL Row Level Security plan

Initial migrations keep the schema simple. After auth and tenant middleware are stable, add defense-in-depth with PostgreSQL Row Level Security.

Future pattern:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_products
ON products
USING (business_id = current_setting('app.current_business_id')::text);
```

Then the API will set the current business per request/transaction before querying.

## Current health endpoints

- `GET /health` — basic API process health
- `GET /api/v1/health` — API health plus database status check

## Important rule

Do not modify `demo-static/` in Phase 2. It remains the approved UI/UX reference until frontend integration begins.
