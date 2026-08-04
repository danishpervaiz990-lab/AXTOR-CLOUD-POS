-- Normalize legacy text/varchar Business enum columns without deleting data.
-- Every stored value is validated before either column is converted. Unknown
-- values abort the migration and leave the production schema unchanged.

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
      AND NOT ("status"::TEXT = ANY (ARRAY['ACTIVE','TRIAL','SUSPENDED','CANCELLED']::TEXT[]));

    IF invalid_status_values IS NOT NULL THEN
      RAISE EXCEPTION 'Business status conversion blocked by unsupported values: %', invalid_status_values;
    END IF;

    UPDATE "businesses" SET "status" = 'TRIAL' WHERE "status" IS NULL;
    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "status" TYPE "BusinessStatus" USING "status"::TEXT::"BusinessStatus"';
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
      AND NOT ("onboarding_state"::TEXT = ANY (ARRAY['NOT_STARTED','IN_PROGRESS','COMPLETED']::TEXT[]));

    IF invalid_onboarding_values IS NOT NULL THEN
      RAISE EXCEPTION 'Business onboarding conversion blocked by unsupported values: %', invalid_onboarding_values;
    END IF;

    UPDATE "businesses" SET "onboarding_state" = 'NOT_STARTED' WHERE "onboarding_state" IS NULL;
    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "onboarding_state" DROP DEFAULT';
    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "onboarding_state" TYPE "OnboardingState" USING "onboarding_state"::TEXT::"OnboardingState"';
    EXECUTE 'ALTER TABLE "businesses" ALTER COLUMN "onboarding_state" SET DEFAULT ''NOT_STARTED''::"OnboardingState"';
  END IF;
END $$;
