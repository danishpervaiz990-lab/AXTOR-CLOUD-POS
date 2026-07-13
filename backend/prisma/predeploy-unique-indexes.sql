-- Safe, non-destructive predeploy for the existing Axtor production database.
-- It never deletes or rewrites customer, payment, sales, or return records.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "customers"
    WHERE "code" IS NOT NULL AND BTRIM("code") <> ''
    GROUP BY "business_id", "code"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate non-empty customer codes exist within a business; unique index was not created.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "customer_payments"
    WHERE "idempotency_key" IS NOT NULL
    GROUP BY "business_id", "idempotency_key"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate customer payment idempotency keys exist; unique index was not created.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "sales_documents"
    WHERE "idempotency_key" IS NOT NULL
    GROUP BY "business_id", "idempotency_key"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate sales document idempotency keys exist; unique index was not created.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "sales_returns"
    WHERE "idempotency_key" IS NOT NULL
    GROUP BY "business_id", "idempotency_key"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate sales return idempotency keys exist; unique index was not created.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_business_id_code_key"
  ON "customers" ("business_id", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_payments_business_id_idempotency_key_key"
  ON "customer_payments" ("business_id", "idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "sales_documents_business_id_idempotency_key_key"
  ON "sales_documents" ("business_id", "idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "sales_returns_business_id_idempotency_key_key"
  ON "sales_returns" ("business_id", "idempotency_key");
