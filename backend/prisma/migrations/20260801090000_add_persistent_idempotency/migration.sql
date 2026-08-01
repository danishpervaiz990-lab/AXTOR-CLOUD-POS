-- Persistent tenant-scoped idempotency for financial and stock-changing writes.
-- Additive only: no existing table or tenant data is modified.

CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "result_json" JSONB,
  "result_reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_records_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "idempotency_records_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "idempotency_records_status_check"
    CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_scope_key"
  ON "idempotency_records"("business_id", "user_id", "action", "idempotency_key");

CREATE INDEX IF NOT EXISTS "idempotency_records_business_created_idx"
  ON "idempotency_records"("business_id", "created_at");

CREATE INDEX IF NOT EXISTS "idempotency_records_expires_idx"
  ON "idempotency_records"("expires_at");
