-- Recovery migration for legacy Business enum columns and canonical aliases.
-- It is idempotent, validates every non-null value first, and converts only
-- businesses.status and businesses.onboarding_state.

DO $$
DECLARE
  status_type TEXT;
  onboarding_type TEXT;
  invalid_status_values TEXT[];
  invalid_onboarding_values TEXT[];
BEGIN
  SELECT udt_name INTO status_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'businesses'
    AND column_name = 'status';

  IF status_type IS NULL THEN
    RAISE EXCEPTION 'Business status column is missing';
  END IF;

  IF status_type <> 'BusinessStatus' THEN
    SELECT array_agg(DISTINCT "status"::TEXT ORDER BY "status"::TEXT)
      INTO invalid_status_values
    FROM "businesses"
    WHERE "status" IS NOT NULL
      AND regexp_replace(upper(btrim("status"::TEXT)), '[[:space:]-]+', '_', 'g')
          NOT IN ('ACTIVE','TRIAL','SUSPENDED','CANCELLED','CANCELED');

    IF invalid_status_values IS NOT NULL THEN
      RAISE EXCEPTION 'Business status recovery blocked by unsupported values: %', invalid_status_values;
    END IF;

    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE $sql$
      ALTER TABLE "businesses"
      ALTER COLUMN "status" TYPE "BusinessStatus"
      USING (
        CASE regexp_replace(upper(btrim(COALESCE("status"::TEXT, 'TRIAL'))), '[[:space:]-]+', '_', 'g')
          WHEN 'ACTIVE' THEN 'ACTIVE'
          WHEN 'TRIAL' THEN 'TRIAL'
          WHEN 'SUSPENDED' THEN 'SUSPENDED'
          WHEN 'CANCELED' THEN 'CANCELLED'
          WHEN 'CANCELLED' THEN 'CANCELLED'
        END
      )::"BusinessStatus"
    $sql$;
    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "status" SET DEFAULT ''TRIAL''::"BusinessStatus"';
  END IF;

  SELECT udt_name INTO onboarding_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'businesses'
    AND column_name = 'onboarding_state';

  IF onboarding_type IS NULL THEN
    RAISE EXCEPTION 'Business onboarding_state column is missing';
  END IF;

  IF onboarding_type <> 'OnboardingState' THEN
    SELECT array_agg(DISTINCT "onboarding_state"::TEXT ORDER BY "onboarding_state"::TEXT)
      INTO invalid_onboarding_values
    FROM "businesses"
    WHERE "onboarding_state" IS NOT NULL
      AND regexp_replace(upper(btrim("onboarding_state"::TEXT)), '[[:space:]-]+', '_', 'g')
          NOT IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','COMPLETE');

    IF invalid_onboarding_values IS NOT NULL THEN
      RAISE EXCEPTION 'Business onboarding recovery blocked by unsupported values: %', invalid_onboarding_values;
    END IF;

    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "onboarding_state" DROP DEFAULT';
    EXECUTE $sql$
      ALTER TABLE "businesses"
      ALTER COLUMN "onboarding_state" TYPE "OnboardingState"
      USING (
        CASE regexp_replace(upper(btrim(COALESCE("onboarding_state"::TEXT, 'NOT_STARTED'))), '[[:space:]-]+', '_', 'g')
          WHEN 'NOT_STARTED' THEN 'NOT_STARTED'
          WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
          WHEN 'COMPLETE' THEN 'COMPLETED'
          WHEN 'COMPLETED' THEN 'COMPLETED'
        END
      )::"OnboardingState"
    $sql$;
    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "onboarding_state" SET DEFAULT ''NOT_STARTED''::"OnboardingState"';
  END IF;
END $$;
