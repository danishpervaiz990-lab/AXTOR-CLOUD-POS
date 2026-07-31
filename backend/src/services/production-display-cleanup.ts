import { prisma } from '../db/prisma.js';

/**
 * Removes customer-facing placeholder wording without changing tenant identity,
 * authentication, permissions, documents, stock, balances, or audit records.
 *
 * The statements are idempotent and intentionally limited to display fields and
 * two known registration-number placeholders. Failures are handled by server.ts
 * so this cosmetic cleanup can never prevent the API from starting.
 */
export async function runProductionDisplayCleanup(): Promise<number> {
  const results = await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "businesses"
      SET
        "name" = COALESCE(
          NULLIF(btrim(regexp_replace(regexp_replace("name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g')), ''),
          'Business'
        ),
        "legal_name" = CASE
          WHEN "legal_name" IS NULL THEN NULL
          ELSE NULLIF(btrim(regexp_replace(regexp_replace("legal_name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g')), '')
        END,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "name" ~* '\mDemo\M'
         OR COALESCE("legal_name", '') ~* '\mDemo\M'
    `,
    prisma.$executeRaw`
      UPDATE "users"
      SET
        "name" = COALESCE(
          NULLIF(btrim(regexp_replace(regexp_replace("name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g')), ''),
          'Owner'
        ),
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "name" ~* '\mDemo\M'
    `,
    prisma.$executeRaw`
      UPDATE "salesmen"
      SET
        "name" = COALESCE(
          NULLIF(btrim(regexp_replace(regexp_replace("name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g')), ''),
          'Salesperson'
        ),
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "name" ~* '\mDemo\M'
    `,
    prisma.$executeRaw`
      UPDATE "app_settings"
      SET
        "value" = replace(
          replace("value"::text, 'CR-000000-DEMO', ''),
          'VAT-0000-DEMO', ''
        )::jsonb,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "value"::text LIKE '%CR-000000-DEMO%'
         OR "value"::text LIKE '%VAT-0000-DEMO%'
    `
  ]);

  const updatedRows = results.reduce((total, count) => total + count, 0);
  if (updatedRows > 0) {
    console.log(`Production display cleanup updated ${updatedRows} placeholder record(s).`);
  }

  return updatedRows;
}
