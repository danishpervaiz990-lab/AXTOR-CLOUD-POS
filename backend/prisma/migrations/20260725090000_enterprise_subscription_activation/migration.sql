-- Correct legacy Custom / Enterprise tenants that were mistakenly created as
-- trials. This is deliberately scoped to the enterprise plan only.
UPDATE "tenant_subscriptions" AS subscription
SET "status" = 'ACTIVE',
    "trial_ends_at" = NULL
FROM "subscription_plans" AS plan
WHERE subscription."plan_id" = plan."id"
  AND subscription."is_current" = TRUE
  AND subscription."status" = 'TRIAL'
  AND plan."code" = 'enterprise';

UPDATE "businesses"
SET "status" = 'ACTIVE',
    "subscription_status" = 'ACTIVE',
    "trial_ends_at" = NULL
WHERE "subscription_plan" = 'enterprise'
  AND ("subscription_status" = 'TRIAL' OR "status" = 'TRIAL');
