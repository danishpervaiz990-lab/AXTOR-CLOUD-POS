# Dedicated Railway deployment

This Grocery application must be deployed as its own Railway service. It must not replace or share the start command of the existing AXTOR multi-industry backend service.

## Service settings

- Repository: `danishpervaiz990-lab/AXTOR-CLOUD-POS`
- Branch: `cutover/grocery-new-railway-20260806`
- Root directory: `apps/grocery-pos`
- Config file: `railway.toml`
- Health check: `/api/health`
- Database health check: `/api/health/database`

## Required variables

- `GROCERY_DATABASE_URL` — dedicated PostgreSQL URL for Grocery only
- `GROCERY_SESSION_SECRET` — at least 32 random characters
- `GROCERY_APP_URL` — final Railway public origin
- `GROCERY_ENVIRONMENT=production`
- `GROCERY_LOG_LEVEL=info`
- `GROCERY_CRON_SECRET` — separate secret, at least 24 characters
- `GROCERY_FILE_STORAGE_PROVIDER=s3-compatible` or `vercel-blob` when configured
- `GROCERY_EMAIL_FROM_NAME=AXTOR Grocery POS Cloud`
- `GROCERY_EMAIL_FROM_ADDRESS` — valid sender email
- `GROCERY_DEMO_PASSWORD` — at least 12 characters; used to seed the protected Green Basket demo tenant

Railway supplies `PORT` automatically. The release command applies the versioned Prisma migration, upserts the demo dataset, and starts Next.js on Railway's assigned port.

## Isolation rule

Do not point `GROCERY_DATABASE_URL` at the shared multi-industry database. Retail and every other industry remain on their current frontend branches and existing shared backend.
