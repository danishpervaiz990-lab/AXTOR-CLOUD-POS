-- Additive entitlement correction for the Retail Reports entry point.
-- No tenant, subscription, transaction or existing feature row is removed.

INSERT INTO "plan_features" (
  "id",
  "plan_id",
  "feature_key",
  "enabled",
  "created_at",
  "updated_at"
)
SELECT
  'pf_standard_reports_daily_sales_20260730',
  "id",
  'reports.daily_sales',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "subscription_plans"
WHERE "code" = 'standard'
ON CONFLICT ("plan_id", "feature_key") DO UPDATE
SET "enabled" = true,
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "plan_features" (
  "id",
  "plan_id",
  "feature_key",
  "enabled",
  "created_at",
  "updated_at"
)
SELECT
  'pf_professional_reports_wildcard_20260730',
  "id",
  'reports.*',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "subscription_plans"
WHERE "code" = 'professional'
ON CONFLICT ("plan_id", "feature_key") DO UPDATE
SET "enabled" = true,
    "updated_at" = CURRENT_TIMESTAMP;
