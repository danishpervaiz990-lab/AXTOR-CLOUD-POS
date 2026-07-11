# Prisma Migration Plan

Phase 2 uses Prisma migrations against PostgreSQL.

## Local development

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
```

Suggested first migration name:

```bash
npx prisma migrate dev --name init_phase_2_backend_schema
```

## Railway production

After the Railway PostgreSQL `DATABASE_URL` is configured:

```bash
cd backend
npm run prisma:generate
npm run prisma:deploy
```

## Tenant isolation notes

All business-owned tables include `business_id`.

Application layer rule:

```txt
Every query must include business_id from tenant middleware/JWT context.
```

Future PostgreSQL RLS hardening:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_products
ON products
USING (business_id = current_setting('app.current_business_id')::text);
```
