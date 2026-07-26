# Axtor POS Cloud Backend

Clean Railway deployment root for the Node.js, Express, TypeScript, Prisma 6 and PostgreSQL API.

## Railway contract

- Install: `npm ci --include=dev --no-audit --no-fund`
- Build: `npx prisma validate && npx prisma generate && npm run build`
- Pre-deploy: `npx prisma migrate deploy`
- Start: `node dist/server.js`
- Health: `GET /health`
- Database health: `GET /api/v1/health/db`

Set Railway's root directory to the repository root containing this file. Do not run a second `npm ci` in the build or start command.

Required configuration is documented in `.env.example`. Never commit `.env` or real credentials.

## Local verification

```text
npm ci
npx prisma validate
npx prisma generate
npm run typecheck
npm run build
```

See `docs/` for the audit, route matrix, migration findings, deployment checklist and rollback guide.
