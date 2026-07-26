-- Additive multi-industry operations foundation.
-- No existing table or column is removed or rewritten.

CREATE TABLE "industry_records" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "industry_code" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "reference_no" TEXT,
  "display_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "related_entity_id" TEXT,
  "start_at" TIMESTAMP(3),
  "end_at" TIMESTAMP(3),
  "due_at" TIMESTAMP(3),
  "amount" DECIMAL(14,2),
  "currency" TEXT DEFAULT 'QAR',
  "data" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" TEXT,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "industry_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "industry_records_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "industry_records_business_id_entity_type_reference_no_key"
  ON "industry_records"("business_id", "entity_type", "reference_no");
CREATE UNIQUE INDEX "industry_records_business_id_idempotency_key_key"
  ON "industry_records"("business_id", "idempotency_key");
CREATE INDEX "industry_records_business_id_industry_code_entity_type_status_idx"
  ON "industry_records"("business_id", "industry_code", "entity_type", "status");
CREATE INDEX "industry_records_business_id_due_at_idx"
  ON "industry_records"("business_id", "due_at");
CREATE INDEX "industry_records_business_id_related_entity_id_idx"
  ON "industry_records"("business_id", "related_entity_id");

CREATE TABLE "print_profiles" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "paper_size" TEXT NOT NULL,
  "width_mm" DECIMAL(7,2),
  "height_mm" DECIMAL(7,2),
  "margin_top_mm" DECIMAL(7,2) NOT NULL DEFAULT 8,
  "margin_right_mm" DECIMAL(7,2) NOT NULL DEFAULT 8,
  "margin_bottom_mm" DECIMAL(7,2) NOT NULL DEFAULT 8,
  "margin_left_mm" DECIMAL(7,2) NOT NULL DEFAULT 8,
  "font_scale" DECIMAL(5,2) NOT NULL DEFAULT 1,
  "bilingual" BOOLEAN NOT NULL DEFAULT false,
  "copies" TEXT[] NOT NULL DEFAULT ARRAY['Original']::TEXT[],
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_profiles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "print_profiles_business_id_code_key" ON "print_profiles"("business_id", "code");
CREATE INDEX "print_profiles_business_id_document_type_active_idx" ON "print_profiles"("business_id", "document_type", "active");

CREATE TABLE "notification_rules" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  "schedule" JSONB,
  "conditions" JSONB NOT NULL,
  "template" JSONB NOT NULL,
  "quiet_hours" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_rules_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_rules_business_id_code_key" ON "notification_rules"("business_id", "code");
CREATE INDEX "notification_rules_business_id_event_type_active_idx" ON "notification_rules"("business_id", "event_type", "active");

CREATE TABLE "notification_outbox" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "rule_id" TEXT,
  "channel" TEXT NOT NULL,
  "recipient_ref" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_outbox_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_outbox_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "notification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_outbox_business_id_idempotency_key_key" ON "notification_outbox"("business_id", "idempotency_key");
CREATE INDEX "notification_outbox_business_id_status_next_attempt_at_idx" ON "notification_outbox"("business_id", "status", "next_attempt_at");

CREATE TABLE "inventory_batches" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "batch_no" TEXT NOT NULL,
  "gtin" TEXT,
  "production_date" TIMESTAMP(3),
  "best_before_date" TIMESTAMP(3),
  "expiry_date" TIMESTAMP(3),
  "smallest_unit" TEXT NOT NULL DEFAULT 'PCS',
  "units_per_stock_unit" DECIMAL(14,4) NOT NULL DEFAULT 1,
  "qty_on_hand_base" DECIMAL(16,4) NOT NULL DEFAULT 0,
  "qty_reserved_base" DECIMAL(16,4) NOT NULL DEFAULT 0,
  "cost_per_base_unit" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'available',
  "quarantine_reason" TEXT,
  "recall_reference" TEXT,
  "metadata" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_batches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "inventory_batches_business_id_product_id_warehouse_id_batch_no_key"
  ON "inventory_batches"("business_id", "product_id", "warehouse_id", "batch_no");
CREATE INDEX "inventory_batches_business_id_expiry_date_status_idx"
  ON "inventory_batches"("business_id", "expiry_date", "status");
CREATE INDEX "inventory_batches_business_id_gtin_idx" ON "inventory_batches"("business_id", "gtin");

ALTER TABLE "sales_document_items"
  ADD COLUMN "inventory_batch_id" TEXT,
  ADD COLUMN "batch_no" TEXT,
  ADD COLUMN "expiry_date" TIMESTAMP(3);

ALTER TABLE "sales_document_items"
  ADD CONSTRAINT "sales_document_items_inventory_batch_id_fkey"
  FOREIGN KEY ("inventory_batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "sales_document_items_business_id_inventory_batch_id_idx"
  ON "sales_document_items"("business_id", "inventory_batch_id");
