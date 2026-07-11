# Git and Deployment Guide — Axtor POS Cloud

## Package layout

The complete ZIP contains two separate repositories/folders:

- `frontend-main/` → Git branch `main`
- `backend-phase-2-production-backend/` → Git branch `phase-2-production-backend`

Do not paste the backend folder into the frontend branch, and do not merge both folders into one branch.

## Recommended safe deployment order

1. Back up the Railway PostgreSQL database.
2. Update and deploy the backend branch first.
3. Confirm backend health and migration success.
4. Update and deploy the frontend `main` branch.
5. Hard-refresh the browser and run the QA plan.

The backend changes are additive and remain compatible with the previous frontend, so backend-first deployment is safest.

## Method A — GitHub Desktop (recommended for a beginner)

### Backend branch

1. Open the Axtor POS repository in GitHub Desktop.
2. Select branch `phase-2-production-backend`.
3. Create a backup branch named `backup-before-sales-production-20260710` and publish it.
4. Return to `phase-2-production-backend`.
5. Extract the supplied complete ZIP.
6. Open `backend-phase-2-production-backend/`.
7. Copy everything inside that folder into the local repository root. Allow Windows to replace matching files.
8. In GitHub Desktop, review the changed-file list. It should match `CHANGED-FILES-MANIFEST.md`.
9. Commit with:

   `Production sales returns permissions audit editing upgrade`

10. Push origin.
11. Railway should deploy from this branch automatically.

### Frontend branch

1. Switch GitHub Desktop to branch `main`.
2. Create/publish backup branch `backup-before-sales-ui-20260710`.
3. Return to `main`.
4. Open `frontend-main/` from the supplied ZIP.
5. Copy everything inside that folder into the local repository root and replace matching files.
6. Review the seven expected frontend changes in the manifest.
7. Commit with:

   `Upgrade sales returns and backend access control UI`

8. Push origin.
9. Vercel should redeploy `main` automatically.

## Method B — Git command line

Use this only if Git is already installed and the repository is cloned.

### Backend

```bash
git switch phase-2-production-backend
git pull origin phase-2-production-backend
git switch -c backup-before-sales-production-20260710
git push -u origin backup-before-sales-production-20260710
git switch phase-2-production-backend

# Copy the CONTENTS of backend-phase-2-production-backend into the repo root.

git status
git add .
git commit -m "Production sales returns permissions audit editing upgrade"
git push origin phase-2-production-backend
```

### Frontend

```bash
git switch main
git pull origin main
git switch -c backup-before-sales-ui-20260710
git push -u origin backup-before-sales-ui-20260710
git switch main

# Copy the CONTENTS of frontend-main into the repo root.

git status
git add .
git commit -m "Upgrade sales returns and backend access control UI"
git push origin main
```

## Railway settings

Keep the Railway service Root Directory as:

`backend`

The supplied `backend/railway.toml` contains:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install --include=dev && npm install prisma@6 @prisma/client@6 && npm run prisma:generate && npm run build"

[deploy]
startCommand = "npx prisma migrate deploy && npm run start"
```

Do not run `prisma db push --accept-data-loss` for this release. The correct production command is:

```bash
npx prisma migrate deploy
```

It is already part of the Railway start command.

## Railway verification

Check the deploy log for all of these:

- npm install completed.
- Prisma Client generated.
- TypeScript build completed.
- Migration `20260710120000_sales_production_upgrade` applied or reported as already applied.
- Server started without restart loop.

Then verify:

- `/health`
- `/api/v1/health/db`
- Login
- `GET /api/v1/sales-documents/context` while authenticated

## Vercel verification

After pushing `main`:

1. Confirm the Vercel deployment is successful.
2. Open the live site in a private/incognito window.
3. Log in.
4. Open Sales and Settings.
5. Hard-refresh with `Ctrl + Shift + R` if an older script remains cached.

The cache-busting query versions were updated in `sales.html` and `settings.html`.

## Does everyone need to log in again?

No planned forced logout is required. The JWT key and authentication secret handling were not changed. A user only needs to log in again if their existing token is expired/invalid or the browser cache contains an old session.

## First permission setup after deployment

1. Log in as Owner or Admin.
2. Open Settings → Users / Roles.
3. Open each operational role.
4. Assign the required Sales, Draft/Post, Payment, Return, Refund, stock, credit, and editing permissions.
5. Save.
6. Test using a non-admin user.

Existing roles with an empty permission array retain legacy access to core create/post/payment/return/refund operations so deployment does not immediately break current users. Sensitive override/edit permissions are not granted by that compatibility rule.

## Rollback

### Frontend rollback

Revert the frontend commit or restore the backup branch. Vercel will redeploy the earlier version.

### Backend rollback

Revert the backend code commit and redeploy. The database migration is additive, so the older backend can ignore the new columns. Do not manually delete the new columns during an emergency rollback.

### Critical caution

Never restore an old database backup after new live sales have been posted unless you intentionally accept losing those newer transactions.
