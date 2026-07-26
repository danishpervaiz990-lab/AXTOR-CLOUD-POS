# Railway P1012 resolution — 2026-07-26

## New deployment failure

Railway successfully used the repaired Nixpacks pipeline:

- install: `npm ci --include=dev --no-audit --no-fund`
- build: `npx prisma validate && npx prisma generate && npm run build`

The build then stopped at `prisma validate` with 19 P1012 errors.

## Root cause

The deployed branch still contained an older malformed
`prisma/schema.prisma`. Three model mappings placed the closing model brace on
the same line:

```prisma
@@map("table_name") }
```

Prisma did not close those models correctly and interpreted the next model's
fields as duplicate fields in the preceding model.

Affected models:

- `RestaurantKitchenTicket`
- `HardwareRentalContract`
- `PaintMixQualityCheck`

## Correct form

```prisma
@@map("table_name")
}
```

## Verification identity

The corrected `prisma/schema.prisma` SHA-256 is:

`943e8bbe405adc8517b61f0cb60f4c6ed10d295e0f6227caa8a93884e32db08f`

The backend root also contains `DEPLOYMENT-BUILD-ID.txt`. Its presence in the
GitHub branch confirms that the complete V2 replacement was uploaded.

