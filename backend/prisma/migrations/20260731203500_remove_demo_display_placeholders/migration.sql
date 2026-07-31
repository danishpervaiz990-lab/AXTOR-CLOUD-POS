-- End-user production cleanup.
-- This migration is intentionally non-destructive: it changes display text only.
-- Tenant IDs, slugs, emails, passwords, permissions, documents and transactions are preserved.

UPDATE "businesses"
SET
  "name" = btrim(regexp_replace(regexp_replace("name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g')),
  "legal_name" = CASE
    WHEN "legal_name" IS NULL THEN NULL
    ELSE btrim(regexp_replace(regexp_replace("legal_name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g'))
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "name" ~* '\mDemo\M'
   OR COALESCE("legal_name", '') ~* '\mDemo\M';

UPDATE "users"
SET
  "name" = btrim(regexp_replace(regexp_replace("name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g')),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "name" ~* '\mDemo\M';

UPDATE "salesmen"
SET
  "name" = btrim(regexp_replace(regexp_replace("name", '\mDemo\M', '', 'gi'), '[[:space:]]+', ' ', 'g')),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "name" ~* '\mDemo\M';

-- Remove only the known placeholder registration numbers from JSON settings.
UPDATE "app_settings"
SET
  "value" = replace(
    replace("value"::text, 'CR-000000-DEMO', ''),
    'VAT-0000-DEMO', ''
  )::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "value"::text LIKE '%CR-000000-DEMO%'
   OR "value"::text LIKE '%VAT-0000-DEMO%';
