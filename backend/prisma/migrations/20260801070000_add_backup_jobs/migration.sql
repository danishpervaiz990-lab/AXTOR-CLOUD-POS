-- Additive backup job queue. No existing tenant or transaction data is changed.
CREATE TABLE "backup_jobs" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "requested_by" TEXT,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "idempotency_key" TEXT,
  "storage_key" TEXT,
  "checksum" TEXT,
  "archive_size_bytes" INTEGER,
  "encrypted" BOOLEAN NOT NULL DEFAULT true,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "next_attempt_at" TIMESTAMP(3),
  "retention_until" TIMESTAMP(3),
  "restore_verified_at" TIMESTAMP(3),
  "restore_evidence" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backup_jobs_business_id_idempotency_key_key"
  ON "backup_jobs"("business_id", "idempotency_key");
CREATE INDEX "backup_jobs_status_next_attempt_at_requested_at_idx"
  ON "backup_jobs"("status", "next_attempt_at", "requested_at");
CREATE INDEX "backup_jobs_business_id_requested_at_idx"
  ON "backup_jobs"("business_id", "requested_at");
CREATE INDEX "backup_jobs_retention_until_status_idx"
  ON "backup_jobs"("retention_until", "status");
