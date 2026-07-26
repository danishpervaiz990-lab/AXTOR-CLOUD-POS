ALTER TABLE "industry_profiles"
  ADD COLUMN IF NOT EXISTS "registry_version" TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE "business_industries"
  ADD COLUMN IF NOT EXISTS "provisioning_state" TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "registry_version" TEXT NOT NULL DEFAULT 'legacy';

CREATE TABLE IF NOT EXISTS "tenant_provisioning_runs" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_provisioning_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_provisioning_runs_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_provisioning_runs_idempotency_key_key"
  ON "tenant_provisioning_runs"("idempotency_key");

CREATE INDEX IF NOT EXISTS "tenant_provisioning_runs_business_id_created_at_idx"
  ON "tenant_provisioning_runs"("business_id", "created_at");
