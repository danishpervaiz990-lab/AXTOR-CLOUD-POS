# Railway environment variables

## Required

- `DATABASE_URL` — Railway PostgreSQL connection URL. Use Railway's generated value.
- `AUTH_TOKEN_SECRET` — a long random secret for the existing HMAC-signed authentication token. Keep the current production value if users already have active tokens; changing it signs everyone out.

## Optional runtime variables

- `AUTH_TOKEN_EXPIRES_SECONDS` — token lifetime in seconds; defaults to `86400`.
- `NODE_ENV` — use `production` on Railway.
- `PORT` — Railway normally injects this automatically; do not hard-code it unless needed.

## Optional seed command variables

Used only with `npm run seed:owner`:

- `SEED_BUSINESS_NAME`
- `SEED_BUSINESS_SLUG`
- `SEED_OWNER_NAME`

No new provider secret, payment key, SMS key, or email credential is required by this build.
