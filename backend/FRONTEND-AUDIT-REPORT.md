# Rollback Guide

## Application rollback

1. Do not delete the last successful Railway deployment.
2. If health or smoke tests fail, redeploy the last successful Railway deployment or revert the backend Git commit.
3. Revert the frontend to its previous Vercel deployment if browser regressions appear.
4. Clear the frontend service worker after a frontend rollback.

## Database rollback

Prisma production migrations are forward-only. Do not run `migrate reset`, `db push --accept-data-loss`, or manually delete `_prisma_migrations`.

Before deployment, create a Railway PostgreSQL backup. If a migration causes data corruption, stop writes, restore the database backup to a new database/service, point a rolled-back backend at that restored database, and validate health before reopening traffic.

Application rollback does not automatically undo database migrations.
