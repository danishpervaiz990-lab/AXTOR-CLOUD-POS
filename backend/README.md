# Axtor Cloud POS Backend

Production API for Axtor Cloud POS.

## Stack

- Node.js 20+
- Express and TypeScript
- Prisma 6.19
- PostgreSQL
- Railway

## Local validation

```text
npm ci
npm run prisma:generate
npm run typecheck
npm run build
```

Required variables are documented in `.env.example`. Never commit `.env` or secret values.

## Railway

Use repository root directory `backend`. The supplied `railway.toml` generates Prisma, compiles TypeScript, deploys committed migrations, seeds the idempotent commercial catalog, and starts the API.

Health routes:

```text
GET /health
GET /api/v1/health/db
```

The main API families include authentication, access control, products, customers, sales documents, payments, returns, refunds, purchases, inventory, accounts, expenses, reports, settings, commercial SaaS context and protected platform administration.

Tenant identity always comes from the authenticated token. Frontend tenant IDs and `x-business-id` headers are not trusted.

See the repository-level `GLOBAL-SAAS-DEPLOYMENT-GUIDE.md`, `GLOBAL-SAAS-QA-REPORT.md`, `AXTOR-GLOBAL-SAAS-RELEASE-REPORT.md` and `KNOWN-LIMITATIONS-GLOBAL-SAAS.md` before deployment.
