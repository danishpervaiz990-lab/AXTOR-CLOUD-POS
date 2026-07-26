-- Release D core additive migration

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "furniture_product_profiles" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "collection" TEXT,
  "dimensions" TEXT,
  "material" TEXT,
  "colour" TEXT,
  "made_to_order" BOOLEAN NOT NULL DEFAULT FALSE,
  "warranty_months" INTEGER NOT NULL DEFAULT 12,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "furniture_product_profiles_u0" ON "furniture_product_profiles" ("business_id", "product_id");

CREATE INDEX IF NOT EXISTS "furniture_product_profiles_i0" ON "furniture_product_profiles" ("business_id", "collection", "active");

CREATE TABLE IF NOT EXISTS "furniture_custom_orders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "order_no" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "product_id" TEXT,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "quoted_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "deposit_required" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "expected_at" TIMESTAMPTZ,
  "approved_at" TIMESTAMPTZ,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "furniture_custom_orders_u0" ON "furniture_custom_orders" ("business_id", "order_no");

CREATE UNIQUE INDEX IF NOT EXISTS "furniture_custom_orders_u1" ON "furniture_custom_orders" ("business_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "furniture_custom_orders_i0" ON "furniture_custom_orders" ("business_id", "status", "expected_at");

CREATE TABLE IF NOT EXISTS "furniture_measurements" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "custom_order_id" TEXT NOT NULL,
  "measurement_key" TEXT NOT NULL,
  "measurement_value" DECIMAL(14,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "furniture_measurements_i0" ON "furniture_measurements" ("business_id", "custom_order_id");

CREATE TABLE IF NOT EXISTS "furniture_production_stages" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "custom_order_id" TEXT NOT NULL,
  "stage_name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "assigned_to" TEXT,
  "notes" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "furniture_production_stages_u0" ON "furniture_production_stages" ("business_id", "custom_order_id", "sequence");

CREATE INDEX IF NOT EXISTS "furniture_production_stages_i0" ON "furniture_production_stages" ("business_id", "status");

CREATE TABLE IF NOT EXISTS "furniture_payments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "custom_order_id" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "payment_type" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'cash',
  "reference" TEXT,
  "idempotency_key" TEXT,
  "paid_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "furniture_payments_u0" ON "furniture_payments" ("business_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "furniture_payments_i0" ON "furniture_payments" ("business_id", "custom_order_id", "paid_at");

CREATE TABLE IF NOT EXISTS "furniture_deliveries" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "custom_order_id" TEXT NOT NULL,
  "scheduled_at" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "vehicle_reference" TEXT,
  "driver_name" TEXT,
  "delivered_at" TIMESTAMPTZ,
  "customer_signature" TEXT
);

CREATE INDEX IF NOT EXISTS "furniture_deliveries_i0" ON "furniture_deliveries" ("business_id", "status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "furniture_installations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "delivery_id" TEXT NOT NULL,
  "scheduled_at" TIMESTAMPTZ NOT NULL,
  "technician_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "completed_at" TIMESTAMPTZ,
  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "furniture_installations_i0" ON "furniture_installations" ("business_id", "status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "furniture_warranties" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "custom_order_id" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "furniture_warranties_i0" ON "furniture_warranties" ("business_id", "status", "expires_at");

CREATE TABLE IF NOT EXISTS "workshop_vehicles" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "registration_no" TEXT NOT NULL,
  "vin" TEXT,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "model_year" INTEGER,
  "mileage" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_vehicles_u0" ON "workshop_vehicles" ("business_id", "registration_no");

CREATE INDEX IF NOT EXISTS "workshop_vehicles_i0" ON "workshop_vehicles" ("business_id", "customer_id");

CREATE TABLE IF NOT EXISTS "workshop_inspections" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "inspection_no" TEXT NOT NULL,
  "mileage" INTEGER NOT NULL,
  "fuel_level" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_inspections_u0" ON "workshop_inspections" ("business_id", "inspection_no");

CREATE INDEX IF NOT EXISTS "workshop_inspections_i0" ON "workshop_inspections" ("business_id", "vehicle_id", "created_at");

CREATE TABLE IF NOT EXISTS "workshop_inspection_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "inspection_id" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "condition" TEXT NOT NULL,
  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "workshop_inspection_items_i0" ON "workshop_inspection_items" ("business_id", "inspection_id");

CREATE TABLE IF NOT EXISTS "workshop_estimates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "estimate_no" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "approved_at" TIMESTAMPTZ,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_estimates_u0" ON "workshop_estimates" ("business_id", "estimate_no");

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_estimates_u1" ON "workshop_estimates" ("business_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "workshop_estimates_i0" ON "workshop_estimates" ("business_id", "vehicle_id", "status");

CREATE TABLE IF NOT EXISTS "workshop_estimate_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "estimate_id" TEXT NOT NULL,
  "item_type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "line_total" DECIMAL(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS "workshop_estimate_items_i0" ON "workshop_estimate_items" ("business_id", "estimate_id");

CREATE TABLE IF NOT EXISTS "workshop_technicians" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "specialty" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS "workshop_technicians_i0" ON "workshop_technicians" ("business_id", "active");

CREATE TABLE IF NOT EXISTS "workshop_bays" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_bays_u0" ON "workshop_bays" ("business_id", "name");

CREATE TABLE IF NOT EXISTS "workshop_job_cards" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "job_no" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "estimate_id" TEXT,
  "technician_id" TEXT,
  "bay_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "promised_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_job_cards_u0" ON "workshop_job_cards" ("business_id", "job_no");

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_job_cards_u1" ON "workshop_job_cards" ("business_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "workshop_job_cards_i0" ON "workshop_job_cards" ("business_id", "status", "promised_at");

CREATE TABLE IF NOT EXISTS "workshop_job_tasks" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "job_card_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "task_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "labour_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "workshop_job_tasks_i0" ON "workshop_job_tasks" ("business_id", "job_card_id", "status");

CREATE TABLE IF NOT EXISTS "workshop_part_usage" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "job_card_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unit_cost" DECIMAL(14,2) NOT NULL,
  "posted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotency_key" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_part_usage_u0" ON "workshop_part_usage" ("business_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "workshop_part_usage_i0" ON "workshop_part_usage" ("business_id", "job_card_id");

CREATE TABLE IF NOT EXISTS "wholesale_price_lists" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "wholesale_price_lists_u0" ON "wholesale_price_lists" ("business_id", "name");

CREATE TABLE IF NOT EXISTS "wholesale_price_list_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "price_list_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "minimum_quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(14,2) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "wholesale_price_list_items_u0" ON "wholesale_price_list_items" ("business_id", "price_list_id", "product_id", "unit", "minimum_quantity");

CREATE TABLE IF NOT EXISTS "wholesale_sales_orders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "order_no" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "customer_po" TEXT,
  "territory" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "requested_delivery_at" TIMESTAMPTZ,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "wholesale_sales_orders_u0" ON "wholesale_sales_orders" ("business_id", "order_no");

CREATE UNIQUE INDEX IF NOT EXISTS "wholesale_sales_orders_u1" ON "wholesale_sales_orders" ("business_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "wholesale_sales_orders_i0" ON "wholesale_sales_orders" ("business_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "wholesale_sales_order_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "sales_order_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "allocated_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "line_total" DECIMAL(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS "wholesale_sales_order_items_i0" ON "wholesale_sales_order_items" ("business_id", "sales_order_id");

CREATE TABLE IF NOT EXISTS "wholesale_pick_lists" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "pick_no" TEXT NOT NULL,
  "sales_order_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "assigned_to" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "wholesale_pick_lists_u0" ON "wholesale_pick_lists" ("business_id", "pick_no");

CREATE INDEX IF NOT EXISTS "wholesale_pick_lists_i0" ON "wholesale_pick_lists" ("business_id", "status");

CREATE TABLE IF NOT EXISTS "wholesale_pick_list_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "pick_list_id" TEXT NOT NULL,
  "sales_order_item_id" TEXT NOT NULL,
  "requested_quantity" DECIMAL(14,3) NOT NULL,
  "picked_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "wholesale_pick_list_items_i0" ON "wholesale_pick_list_items" ("business_id", "pick_list_id");

CREATE TABLE IF NOT EXISTS "wholesale_dispatches" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "dispatch_no" TEXT NOT NULL,
  "sales_order_id" TEXT NOT NULL,
  "route_name" TEXT,
  "driver_name" TEXT,
  "vehicle_reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "dispatched_at" TIMESTAMPTZ,
  "delivered_at" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS "wholesale_dispatches_u0" ON "wholesale_dispatches" ("business_id", "dispatch_no");

CREATE INDEX IF NOT EXISTS "wholesale_dispatches_i0" ON "wholesale_dispatches" ("business_id", "status");

CREATE TABLE IF NOT EXISTS "wholesale_backorders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "sales_order_item_id" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "wholesale_backorders_i0" ON "wholesale_backorders" ("business_id", "status");
