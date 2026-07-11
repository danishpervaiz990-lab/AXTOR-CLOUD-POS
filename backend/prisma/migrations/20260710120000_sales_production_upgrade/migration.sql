ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "company" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "customers_business_id_code_key" ON "customers"("business_id", "code");

ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'QAR';
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "sales_channel" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "reference_no" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "internal_notes" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "customer_notes" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "posted_at" TIMESTAMP(3);
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "updated_by_user_id" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_documents_business_id_idempotency_key_key" ON "sales_documents"("business_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_warehouse_id_idx" ON "sales_documents"("business_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_reference_no_idx" ON "sales_documents"("business_id", "reference_no");

ALTER TABLE "customer_payments" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "customer_payments_business_id_idempotency_key_key" ON "customer_payments"("business_id", "idempotency_key");

ALTER TABLE "sales_returns" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_returns_business_id_idempotency_key_key" ON "sales_returns"("business_id", "idempotency_key");
