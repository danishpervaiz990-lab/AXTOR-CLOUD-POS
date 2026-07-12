# Axtor Cloud POS - Global SaaS Deployment Guide

Release: `2026.07-global-saas`  
Target: GitHub + Railway PostgreSQL backend + Vercel static frontend

## 1. Before you start

Keep the current verified production ZIPs unchanged as rollback copies. Take a Railway PostgreSQL snapshot before uploading the new backend. Do not delete the current database, Railway service, Vercel project, or environment variables.

You will deploy the backend first. The new frontend calls APIs that only exist in the new backend.

## 2. Backend GitHub upload

1. Open the backend GitHub repository.
2. Open branch `phase-2-production-backend` (or the branch connected to Railway).
3. Upload the contents of the delivered complete backend repository ZIP. Keep the folder structure exactly as supplied.
4. Confirm that GitHub contains `backend/package.json`, `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260712123000_global_saas_foundation/migration.sql`, and `backend/src/app.ts`.
5. Commit with a message such as `Release global SaaS foundation 2026.07`.

Do not upload `node_modules`, `.env`, a production database dump, or real secret values.

## 3. Railway variables

Set these under Railway service **Variables**:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Railway PostgreSQL connection string. |
| `AUTH_TOKEN_SECRET` | Yes | Long random secret for HMAC authentication tokens. Never commit it. |
| `AUTH_TOKEN_EXPIRES_SECONDS` | No | Token lifetime; default `86400`. |
| `NODE_ENV` | Yes | Use `production`. |
| `PORT` | Railway | Railway normally supplies this automatically. |
| `APP_NAME` | No | API service name. |
| `CORS_ORIGIN` | Yes | Comma-separated allowed frontend origins, for example the production Vercel URL and preview URL. Do not use `*` with production credentials. |
| `PLATFORM_ADMIN_EMAILS` | Yes for platform administration | Comma-separated, exact email allowlist for platform owners. Tenant roles cannot grant this access. |
| `APP_VERSION` | No | Release label, for example `2026.07-global-saas`. |
| `SUPPORT_EMAIL` | No | Platform-configured customer support address. |
| `SUPPORT_URL` | No | Platform-configured help portal. |

Generate secrets outside the repository. Do not copy example values into production.

## 4. Railway build and migration

Set the Railway service root directory to `backend`.

The supplied `backend/railway.toml` runs:

```text
Build: npm ci --include=dev && npm run prisma:generate && npm run build
Start: npm run prisma:deploy && npm run seed:catalog && npm run start
```

The catalog seed is idempotent. It creates or updates four plans, six industry profiles, the currency list, and safe default subscription/base-currency records for existing tenants. It does not create a demo business or production password.

After Railway reports **Deployed**, open:

```text
https://YOUR-BACKEND.up.railway.app/health
https://YOUR-BACKEND.up.railway.app/api/v1/health/db
```

Both must return `ok: true`. If migration fails, stop before uploading the frontend and use the rollback section below.

## 5. First platform administrator

1. Add the exact email of an existing trusted Axtor owner account to `PLATFORM_ADMIN_EMAILS`.
2. Log in normally to that tenant.
3. Open `https://YOUR-FRONTEND/demo-static/platform-admin.html`.
4. A normal tenant administrator must receive `403 Platform administrator access required`.
5. Create new customers with an empty tenant and a strong temporary password.
6. Send a temporary password only through a secure channel. On first login the owner is forced to set a new password.

## 6. Frontend GitHub and Vercel

1. Open the frontend GitHub repository and branch connected to Vercel, normally `main`.
2. Upload the complete frontend repository ZIP contents.
3. Confirm `demo-static/js/platform-runtime.js`, `demo-static/i18n/`, `demo-static/setup.html`, `demo-static/plans.html`, `demo-static/change-password.html`, `demo-static/sw.js`, and `vercel.json` are present.
4. Commit with `Release global SaaS frontend 2026.07`.
5. Let Vercel deploy the commit.
6. In Vercel, confirm the production domain is included in backend `CORS_ORIGIN`.

If the Railway hostname differs from the current value in `demo-static/js/axtor-api.js`, update only `DEFAULT_API_BASE_URL`, then redeploy Vercel. Also add that Railway origin to `connect-src` in `vercel.json` if it is outside `*.up.railway.app`.

## 7. Cache refresh

The service worker cache version is `axtor-pos-cloud-global-saas-v23-20260712` and removes old caches during activation.

After Vercel deploys:

1. Open the app once and wait ten seconds.
2. Hard refresh with `Ctrl+Shift+R`.
3. If an old build remains, open browser DevTools > Application > Service Workers > **Unregister**, then Application > Storage > **Clear site data**, close the tab, and open the site again.

## 8. First customer onboarding

1. The new owner logs in with business slug, email, and temporary password.
2. The app requires a strong password change.
3. Open **Setup Wizard**.
4. Complete business, industry, country, time zone, currency, language, tax, branch, warehouse, numbering, template, data-mode, and plan sections.
5. Keep **Start with an empty business** for a real customer. Sample data is only created when explicitly selected.
6. Complete setup and confirm redirect to the dashboard.

## 9. Subscription activation

The first release uses the manual billing provider abstraction. No card gateway is faked or enabled.

1. Open the protected platform administration page.
2. Select the tenant.
3. Choose plan and tenant status.
4. Save. For a paid manual activation use `ACTIVE`; for evaluation use `TRIAL`.
5. Confirm the tenant sees the new plan on `plans.html`.

## 10. Backup and business continuity

- Enable Railway/PostgreSQL scheduled backups suitable for the paid plan.
- Keep at least daily backups and a separate pre-release snapshot.
- Confirm whether point-in-time recovery is included in the chosen Railway/PostgreSQL plan; do not assume it.
- Restore a backup into a non-production database at least quarterly and run health, login, invoice, payment, return, and tenant-isolation tests.
- Back up Railway variable names and values in an approved secret manager, not GitHub.
- `GET /api/v1/commercial/export/config` exports supported tenant configuration and explicitly excludes passwords, tokens, credentials, and transaction records. It is not a replacement for a PostgreSQL backup.

## 11. Rollback

1. Stop customer posting if financial verification fails.
2. Redeploy the previous verified backend commit/ZIP.
3. Leave the additive SaaS tables/columns in PostgreSQL. The previous backend ignores them and existing records remain safe.
4. Redeploy the previous verified frontend commit/ZIP.
5. Clear the service worker cache as described above.
6. Restore the database snapshot only if the migration itself corrupted data. Do not restore merely to remove unused additive tables.

Never run a destructive down migration after new multi-currency documents or subscriptions have been created.
