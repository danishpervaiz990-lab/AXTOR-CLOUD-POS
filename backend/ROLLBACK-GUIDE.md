# Railway Failure Root Cause

## Confirmed cause

Nixpacks installed dependencies during its install phase:

```text
npm ci --include=dev --no-audit --no-fund
```

The old `railway.toml` then ran a second `npm ci` in the build phase. Railway mounted `/app/node_modules/.cache` as a cache target, so the second install attempted to remove a mounted directory and failed:

```text
EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'
```

## Repair

Dependency installation now occurs once. The build command is:

```text
npx prisma validate && npx prisma generate && npm run build
```

The pre-deploy command remains `npx prisma migrate deploy`, and runtime remains `node dist/server.js`.

## Other defects found behind the first failure

- Three malformed Prisma model endings caused P1012 validation failures.
- Thirteen new relation fields lacked opposite relations on `Business`.
- Release A–D industry routes were outside `src/`, so the successful TypeScript build did not compile or mount them.
- The backend ZIP contained a nested duplicate backend project.
- Railway selected Node 18 because no engine contract existed.

All of these defects were corrected in the replacement backend.
