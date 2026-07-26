# Migration recovery

This migration is additive and preserves existing rows. The safest rollback is an application rollback: redeploy the previous backend and leave the new nullable/defaulted tables and columns in place.

Do not drop the new columns after production transactions have started using multi-currency fields. If deployment fails before the application starts, fix the reported DDL conflict and re-run `npm run prisma:deploy`; every table/column creation is guarded with `IF NOT EXISTS` where PostgreSQL supports it.

Before production deployment, take a Railway/PostgreSQL snapshot. After deployment verify `prisma migrate status`, `/health`, `/api/v1/health/db`, the catalog seed, and one existing invoice before accepting new transactions.
