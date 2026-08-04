-- Add the current Business onboarding and localization columns to legacy
-- production schemas. This migration runs after enum reconciliation so its
-- defaults can safely reference committed enum values.

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "legal_name" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'QA',
  ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'Asia/Qatar',
  ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS "tax_number" TEXT,
  ADD COLUMN IF NOT EXISTS "subscription_plan" TEXT,
  ADD COLUMN IF NOT EXISTS "subscription_status" TEXT,
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "default_language" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "date_format" TEXT NOT NULL DEFAULT 'yyyy-MM-dd',
  ADD COLUMN IF NOT EXISTS "number_locale" TEXT NOT NULL DEFAULT 'en-QA',
  ADD COLUMN IF NOT EXISTS "tax_label" TEXT NOT NULL DEFAULT 'Tax',
  ADD COLUMN IF NOT EXISTS "onboarding_state" "OnboardingState" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "onboarding_step" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Repair nullable legacy rows without deleting or replacing tenant data.
UPDATE "businesses" SET
  "country" = COALESCE("country", 'QA'),
  "timezone" = COALESCE("timezone", 'Asia/Qatar'),
  "currency" = COALESCE("currency", 'QAR'),
  "default_language" = COALESCE("default_language", 'en'),
  "date_format" = COALESCE("date_format", 'yyyy-MM-dd'),
  "number_locale" = COALESCE("number_locale", 'en-QA'),
  "tax_label" = COALESCE("tax_label", 'Tax'),
  "onboarding_state" = COALESCE("onboarding_state", 'NOT_STARTED'::"OnboardingState"),
  "onboarding_step" = COALESCE("onboarding_step", 1),
  "maintenance_mode" = COALESCE("maintenance_mode", false),
  "created_at" = COALESCE("created_at", CURRENT_TIMESTAMP),
  "updated_at" = COALESCE("updated_at", CURRENT_TIMESTAMP);
