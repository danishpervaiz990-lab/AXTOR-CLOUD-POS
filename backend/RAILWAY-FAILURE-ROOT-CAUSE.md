# Deployment Checklist

## Backend GitHub replacement

1. Back up the current backend branch.
2. Delete the current repository contents, keeping `.git` only when working locally.
3. Extract the backend replacement ZIP into the repository root.
4. Confirm `package.json`, `railway.toml`, `nixpacks.toml`, `src/` and `prisma/` are at the root.
5. Commit and push.

## Railway

1. Root Directory: repository root, blank unless the files are intentionally placed in a subfolder.
2. Builder: Nixpacks.
3. Remove dashboard command overrides containing `npm ci`, `prisma db push` or `--accept-data-loss`.
4. Required variables: `DATABASE_URL`, `AUTH_TOKEN_SECRET`, `AUTH_TOKEN_EXPIRES_SECONDS`, `CORS_ORIGIN`, `NODE_ENV`, `PORT`.
5. Deploy and confirm the phases are install, build, pre-deploy and start.
6. Confirm `/health` returns 200.
7. Confirm `/api/v1/health/db` returns 200.
8. Review `prisma migrate deploy` output, especially `pgcrypto` extension availability.

## Frontend GitHub/Vercel replacement

1. Back up the current frontend branch.
2. Extract the frontend ZIP into the repository root.
3. Confirm `index.html`, `login.html`, `js/`, `css/`, `assets/`, `sw.js` and `manifest.webmanifest` are at the root.
4. Push and redeploy Vercel with no build command.
5. Open the site, unregister any old service worker once, clear site data, then reload.
6. Log in and execute the staging QA matrix.
