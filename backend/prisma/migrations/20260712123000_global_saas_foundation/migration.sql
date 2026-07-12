-- Axtor Cloud POS global SaaS foundation.
-- Additive migration: no existing table, column, or customer row is removed.

DO $$ BEGIN CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY','ANNUAL','CUSTOM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('TRIAL','ACTIVE','GRACE','SUSPENDED','CANCELLED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OnboardingState" AS ENUM ('NOT_STARTED','IN_PROGRESS','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "default_language" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "date_format" TEXT NOT NULL DEFAULT 'yyyy-MM-dd',
  ADD COLUMN IF NOT EXISTS "number_locale" TEXT NOT NULL DEFAULT 'en-QA',
  ADD COLUMN IF NOT EXISTS "tax_label" TEXT NOT NULL DEFAULT 'Tax',
  ADD COLUMN IF NOT EXISTS "onboarding_state" "OnboardingState" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "onboarding_step" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "maintenance_mode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_language" TEXT, ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "preferred_currency" TEXT, ADD COLUMN IF NOT EXISTS "tax_exempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "preferred_currency" TEXT;

ALTER TABLE "sales_documents"
  ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "exchange_rate_source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "exchange_rate_timestamp" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "base_subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_balance" DECIMAL(14,2) NOT NULL DEFAULT 0;
UPDATE "sales_documents" SET "base_subtotal"="subtotal", "base_discount"="discount", "base_tax"="tax", "base_total"="total", "base_paid"="paid", "base_balance"="balance", "exchange_rate_timestamp"=COALESCE("issued_at","created_at") WHERE "base_total"=0 AND "total"<>0;

ALTER TABLE "customer_payments"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "exchange_rate_source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "exchange_rate_timestamp" TIMESTAMP(3);
UPDATE "customer_payments" SET "base_amount"="amount", "exchange_rate_timestamp"="payment_date" WHERE "base_amount"=0 AND "amount"<>0;

ALTER TABLE "customer_refunds"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "exchange_rate_source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "exchange_rate_timestamp" TIMESTAMP(3);
UPDATE "customer_refunds" SET "base_amount"="amount", "exchange_rate_timestamp"="refund_date" WHERE "base_amount"=0 AND "amount"<>0;

ALTER TABLE "purchases"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'QAR', ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "exchange_rate_source" TEXT NOT NULL DEFAULT 'manual', ADD COLUMN IF NOT EXISTS "exchange_rate_timestamp" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "base_subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "base_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_tax" DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "base_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "base_paid" DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "base_balance" DECIMAL(14,2) NOT NULL DEFAULT 0;
UPDATE "purchases" SET "base_subtotal"="subtotal", "base_discount"="discount", "base_tax"="tax", "base_total"="total", "base_paid"="paid", "base_balance"="balance", "exchange_rate_timestamp"="purchase_date" WHERE "base_total"=0 AND "total"<>0;

ALTER TABLE "supplier_payments"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'QAR', ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "exchange_rate_source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "exchange_rate_timestamp" TIMESTAMP(3);
UPDATE "supplier_payments" SET "base_amount"="amount", "exchange_rate_timestamp"="payment_date" WHERE "base_amount"=0 AND "amount"<>0;

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'QAR', ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "exchange_rate_source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "exchange_rate_timestamp" TIMESTAMP(3);
UPDATE "expenses" SET "base_amount"="amount", "exchange_rate_timestamp"="expense_date" WHERE "base_amount"=0 AND "amount"<>0;

CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "description" TEXT, "is_recommended" BOOLEAN NOT NULL DEFAULT false,
  "monthly_price" DECIMAL(14,2), "annual_price" DECIMAL(14,2), "price_currency" TEXT NOT NULL DEFAULT 'USD', "max_users" INTEGER,
  "max_branches" INTEGER, "max_warehouses" INTEGER, "max_currencies" INTEGER, "max_languages" INTEGER, "support_level" TEXT NOT NULL DEFAULT 'email',
  "api_access" BOOLEAN NOT NULL DEFAULT false, "white_label" BOOLEAN NOT NULL DEFAULT false, "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "subscription_plans_active_sort_order_idx" ON "subscription_plans"("active","sort_order");

CREATE TABLE IF NOT EXISTS "plan_features" (
  "id" TEXT PRIMARY KEY, "plan_id" TEXT NOT NULL, "feature_key" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "limit_value" INTEGER,
  "config" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "plan_features_plan_id_feature_key_key" ON "plan_features"("plan_id","feature_key");
CREATE INDEX IF NOT EXISTS "plan_features_feature_key_idx" ON "plan_features"("feature_key");

CREATE TABLE IF NOT EXISTS "tenant_subscriptions" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "plan_id" TEXT NOT NULL, "status" "TenantSubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY', "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "trial_ends_at" TIMESTAMP(3),
  "current_period_start" TIMESTAMP(3), "current_period_end" TIMESTAMP(3), "grace_ends_at" TIMESTAMP(3), "cancelled_at" TIMESTAMP(3),
  "is_current" BOOLEAN NOT NULL DEFAULT true, "provider" TEXT NOT NULL DEFAULT 'manual', "provider_reference" TEXT, "custom_limits" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_subscriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "tenant_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_business_id_is_current_status_idx" ON "tenant_subscriptions"("business_id","is_current","status");
CREATE INDEX IF NOT EXISTS "tenant_subscriptions_current_period_end_idx" ON "tenant_subscriptions"("current_period_end");

CREATE TABLE IF NOT EXISTS "tenant_feature_overrides" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "feature_key" TEXT NOT NULL, "enabled" BOOLEAN, "limit_value" INTEGER, "reason" TEXT,
  "expires_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_feature_overrides_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_feature_overrides_business_id_feature_key_key" ON "tenant_feature_overrides"("business_id","feature_key");
CREATE INDEX IF NOT EXISTS "tenant_feature_overrides_business_id_expires_at_idx" ON "tenant_feature_overrides"("business_id","expires_at");

CREATE TABLE IF NOT EXISTS "usage_records" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "metric_key" TEXT NOT NULL, "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "period_start" TIMESTAMP(3) NOT NULL, "period_end" TIMESTAMP(3) NOT NULL, "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_records_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "usage_records_business_id_metric_key_period_key" ON "usage_records"("business_id","metric_key","period_start","period_end");
CREATE INDEX IF NOT EXISTS "usage_records_business_id_metric_key_idx" ON "usage_records"("business_id","metric_key");

CREATE TABLE IF NOT EXISTS "subscription_invoices" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "plan_id" TEXT NOT NULL, "invoice_no" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL DEFAULT 'draft',
  "currency" TEXT NOT NULL DEFAULT 'USD', "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0, "tax" DECIMAL(14,2) NOT NULL DEFAULT 0, "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "due_at" TIMESTAMP(3), "paid_at" TIMESTAMP(3), "metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_invoices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "subscription_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "subscription_invoices_business_id_status_idx" ON "subscription_invoices"("business_id","status");

CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "invoice_id" TEXT, "provider" TEXT NOT NULL DEFAULT 'manual', "provider_reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending', "currency" TEXT NOT NULL DEFAULT 'USD', "amount" DECIMAL(14,2) NOT NULL DEFAULT 0, "received_at" TIMESTAMP(3),
  "metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "subscription_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "subscription_payments_business_id_status_idx" ON "subscription_payments"("business_id","status");

CREATE TABLE IF NOT EXISTS "industry_profiles" (
  "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "description" TEXT, "default_terminology" JSONB, "default_settings" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true, "sort_order" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "industry_profiles_active_sort_order_idx" ON "industry_profiles"("active","sort_order");
CREATE TABLE IF NOT EXISTS "industry_features" (
  "id" TEXT PRIMARY KEY, "industry_id" TEXT NOT NULL, "feature_key" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "industry_features_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industry_profiles"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "industry_features_industry_id_feature_key_key" ON "industry_features"("industry_id","feature_key");
CREATE TABLE IF NOT EXISTS "business_industries" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL UNIQUE, "industry_id" TEXT NOT NULL, "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_industries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "business_industries_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industry_profiles"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "business_industries_industry_id_idx" ON "business_industries"("industry_id");
CREATE TABLE IF NOT EXISTS "industry_settings" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "key" TEXT NOT NULL, "value" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "industry_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "industry_settings_business_id_key_key" ON "industry_settings"("business_id","key");

CREATE TABLE IF NOT EXISTS "currencies" (
  "code" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "symbol" TEXT NOT NULL, "decimal_precision" INTEGER NOT NULL DEFAULT 2,
  "symbol_position" TEXT NOT NULL DEFAULT 'before', "thousand_separator" TEXT NOT NULL DEFAULT ',', "decimal_separator" TEXT NOT NULL DEFAULT '.',
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "currencies_active_name_idx" ON "currencies"("active","name");
CREATE TABLE IF NOT EXISTS "business_currencies" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "currency_code" TEXT NOT NULL, "is_base" BOOLEAN NOT NULL DEFAULT false, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_currencies_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "business_currencies_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_currencies_business_id_currency_code_key" ON "business_currencies"("business_id","currency_code");
CREATE INDEX IF NOT EXISTS "business_currencies_business_id_is_base_idx" ON "business_currencies"("business_id","is_base");
CREATE UNIQUE INDEX IF NOT EXISTS "business_currencies_one_base_per_business" ON "business_currencies"("business_id") WHERE "is_base"=true AND "active"=true;

CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT, "base_code" TEXT NOT NULL, "quote_code" TEXT NOT NULL, "rate" DECIMAL(20,8) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual', "effective_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exchange_rates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "exchange_rates_base_code_fkey" FOREIGN KEY ("base_code") REFERENCES "currencies"("code") ON DELETE RESTRICT,
  CONSTRAINT "exchange_rates_quote_code_fkey" FOREIGN KEY ("quote_code") REFERENCES "currencies"("code") ON DELETE RESTRICT,
  CONSTRAINT "exchange_rates_positive_check" CHECK ("rate">0), CONSTRAINT "exchange_rates_pair_check" CHECK ("base_code"<>"quote_code")
);
CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rates_business_pair_time_key" ON "exchange_rates"("business_id","base_code","quote_code","effective_at");
CREATE INDEX IF NOT EXISTS "exchange_rates_business_pair_time_idx" ON "exchange_rates"("business_id","base_code","quote_code","effective_at" DESC);
CREATE TABLE IF NOT EXISTS "document_currency_rates" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" TEXT NOT NULL, "currency_code" TEXT NOT NULL,
  "base_currency_code" TEXT NOT NULL, "rate" DECIMAL(20,8) NOT NULL, "source" TEXT NOT NULL DEFAULT 'manual', "rate_timestamp" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_currency_rates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "document_currency_rates_positive_check" CHECK ("rate">0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "document_currency_rates_business_entity_key" ON "document_currency_rates"("business_id","entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "document_currency_rates_business_currency_idx" ON "document_currency_rates"("business_id","currency_code");

CREATE TABLE IF NOT EXISTS "business_locales" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL UNIQUE, "country_code" TEXT NOT NULL DEFAULT 'QA', "timezone" TEXT NOT NULL DEFAULT 'Asia/Qatar',
  "language_code" TEXT NOT NULL DEFAULT 'en', "date_format" TEXT NOT NULL DEFAULT 'yyyy-MM-dd', "number_locale" TEXT NOT NULL DEFAULT 'en-QA',
  "address_format" TEXT, "phone_format" TEXT, "invoice_terminology" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_locales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "tax_rates" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "name" TEXT NOT NULL, "label" TEXT NOT NULL DEFAULT 'Tax', "rate" DECIMAL(7,4) NOT NULL,
  "inclusive" BOOLEAN NOT NULL DEFAULT false, "zero_rated" BOOLEAN NOT NULL DEFAULT false, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_rates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_rates_range_check" CHECK ("rate">=0 AND "rate"<=100)
);
CREATE UNIQUE INDEX IF NOT EXISTS "tax_rates_business_id_name_key" ON "tax_rates"("business_id","name");
CREATE INDEX IF NOT EXISTS "tax_rates_business_id_active_idx" ON "tax_rates"("business_id","active");
CREATE TABLE IF NOT EXISTS "tax_groups" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "name" TEXT NOT NULL, "rate_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_groups_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "tax_groups_business_id_name_key" ON "tax_groups"("business_id","name");
CREATE TABLE IF NOT EXISTS "business_tax_settings" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL UNIQUE, "tax_system" TEXT NOT NULL DEFAULT 'none', "tax_label" TEXT NOT NULL DEFAULT 'Tax',
  "registration_number" TEXT, "prices_include_tax" BOOLEAN NOT NULL DEFAULT false, "config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_tax_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "tenant_onboarding" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL UNIQUE, "current_step" INTEGER NOT NULL DEFAULT 1, "completed_steps" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "state" "OnboardingState" NOT NULL DEFAULT 'NOT_STARTED', "answers" JSONB NOT NULL DEFAULT '{}'::JSONB, "sample_data_requested" BOOLEAN NOT NULL DEFAULT false,
  "completed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_onboarding_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "tenant_onboarding_step_check" CHECK ("current_step">=1 AND "current_step"<=20)
);
CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL UNIQUE, "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3), "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ip_address" TEXT, "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "auth_sessions_business_user_revoked_idx" ON "auth_sessions"("business_id","user_id","revoked_at");
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
CREATE TABLE IF NOT EXISTS "data_import_jobs" (
  "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "entity_type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'preview', "file_name" TEXT,
  "total_rows" INTEGER NOT NULL DEFAULT 0, "valid_rows" INTEGER NOT NULL DEFAULT 0, "error_rows" INTEGER NOT NULL DEFAULT 0, "errors" JSONB,
  "created_by_user_id" TEXT, "completed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_import_jobs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "data_import_jobs_business_entity_created_idx" ON "data_import_jobs"("business_id","entity_type","created_at" DESC);

-- Existing tenants are preserved and receive a base-currency row after the catalog seed creates currencies.
-- The catalog seed performs this safely at application startup; no business data is deleted here.
