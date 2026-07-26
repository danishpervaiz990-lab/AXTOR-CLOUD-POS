CREATE TABLE IF NOT EXISTS "restaurant_areas" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "restaurant_tables" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "area_id" TEXT,
  "table_no" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 2,
  "status" TEXT NOT NULL DEFAULT 'available',
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "restaurant_menu_categories" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kitchen_station" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "restaurant_menu_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "category_id" TEXT,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "price" DECIMAL(14,4) NOT NULL,
  "preparation_minutes" INTEGER NOT NULL DEFAULT 10,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "restaurant_orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "order_no" TEXT NOT NULL,
  "order_type" TEXT NOT NULL,
  "table_id" TEXT,
  "customer_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "service_charge" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "idempotency_key" TEXT
);

CREATE TABLE IF NOT EXISTS "restaurant_order_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "menu_item_id" TEXT,
  "item_name" TEXT NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "unit_price" DECIMAL(14,4) NOT NULL,
  "modifiers" JSONB,
  "line_total" DECIMAL(14,4) NOT NULL,
  "preparation_status" TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS "restaurant_kitchen_tickets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "station" TEXT NOT NULL,
  "ticket_no" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "hardware_product_profiles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "base_unit" TEXT NOT NULL,
  "cuttable" BOOLEAN NOT NULL DEFAULT false,
  "serial_tracked" BOOLEAN NOT NULL DEFAULT false,
  "warranty_months" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "hardware_unit_conversions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "from_unit" TEXT NOT NULL,
  "to_unit" TEXT NOT NULL,
  "factor" DECIMAL(14,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS "trade_price_levels" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "discount_percent" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "customer_projects" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "project_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "credit_limit" DECIMAL(14,4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "hardware_staged_deliveries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "project_id" TEXT,
  "document_no" TEXT NOT NULL,
  "scheduled_date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "notes" TEXT,
  "idempotency_key" TEXT
);

CREATE TABLE IF NOT EXISTS "hardware_backorders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "product_id" TEXT NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "fulfilled_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "hardware_rental_contracts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "contract_no" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "item_description" TEXT NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "due_at" TIMESTAMP(3) NOT NULL,
  "returned_at" TIMESTAMP(3),
  "deposit" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS "paint_brands" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "paint_product_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "brand_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "technology" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "paint_colors" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "collection" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "paint_formulas" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "formula_code" TEXT NOT NULL,
  "color_id" TEXT NOT NULL,
  "product_line_id" TEXT NOT NULL,
  "base_code" TEXT NOT NULL,
  "pack_size" DECIMAL(14,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "current_revision" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "paint_formula_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "formula_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "paint_formula_components" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "component_code" TEXT NOT NULL,
  "component_name" TEXT NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "paint_mix_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "job_no" TEXT NOT NULL,
  "formula_id" TEXT NOT NULL,
  "formula_revision" INTEGER NOT NULL,
  "customer_reference" TEXT,
  "vehicle_project_reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "quantity" DECIMAL(14,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "mix_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "selling_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "non_returnable_accepted" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "idempotency_key" TEXT
);

CREATE TABLE IF NOT EXISTS "paint_mix_consumptions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "mix_job_id" TEXT NOT NULL,
  "component_code" TEXT NOT NULL,
  "planned_quantity" DECIMAL(14,4) NOT NULL,
  "actual_quantity" DECIMAL(14,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "cost" DECIMAL(14,4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "paint_mix_quality_checks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL,
  "mix_job_id" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "checked_by" TEXT,
  "notes" TEXT,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_areas_business_id_name_key" ON "restaurant_areas"("business_id","name");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_tables_business_id_table_no_key" ON "restaurant_tables"("business_id","table_no");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_menu_categories_business_id_name_key" ON "restaurant_menu_categories"("business_id","name");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_menu_items_business_id_sku_key" ON "restaurant_menu_items"("business_id","sku");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_orders_business_id_order_no_key" ON "restaurant_orders"("business_id","order_no");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_orders_business_id_idempotency_key_key" ON "restaurant_orders"("business_id","idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_kitchen_tickets_business_id_ticket_no_key" ON "restaurant_kitchen_tickets"("business_id","ticket_no");
CREATE UNIQUE INDEX IF NOT EXISTS "hardware_product_profiles_business_id_product_id_key" ON "hardware_product_profiles"("business_id","product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "hardware_unit_conversions_business_id_product_id_from_unit_to_unit_key" ON "hardware_unit_conversions"("business_id","product_id","from_unit","to_unit");
CREATE UNIQUE INDEX IF NOT EXISTS "trade_price_levels_business_id_name_key" ON "trade_price_levels"("business_id","name");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_projects_business_id_project_code_key" ON "customer_projects"("business_id","project_code");
CREATE UNIQUE INDEX IF NOT EXISTS "hardware_staged_deliveries_business_id_document_no_key" ON "hardware_staged_deliveries"("business_id","document_no");
CREATE UNIQUE INDEX IF NOT EXISTS "hardware_staged_deliveries_business_id_idempotency_key_key" ON "hardware_staged_deliveries"("business_id","idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "hardware_rental_contracts_business_id_contract_no_key" ON "hardware_rental_contracts"("business_id","contract_no");
CREATE UNIQUE INDEX IF NOT EXISTS "paint_brands_business_id_name_key" ON "paint_brands"("business_id","name");
CREATE UNIQUE INDEX IF NOT EXISTS "paint_product_lines_business_id_brand_id_name_key" ON "paint_product_lines"("business_id","brand_id","name");
CREATE UNIQUE INDEX IF NOT EXISTS "paint_colors_business_id_code_key" ON "paint_colors"("business_id","code");
CREATE UNIQUE INDEX IF NOT EXISTS "paint_formulas_business_id_formula_code_key" ON "paint_formulas"("business_id","formula_code");
CREATE UNIQUE INDEX IF NOT EXISTS "paint_formula_revisions_business_id_formula_id_revision_key" ON "paint_formula_revisions"("business_id","formula_id","revision");
CREATE UNIQUE INDEX IF NOT EXISTS "paint_mix_jobs_business_id_job_no_key" ON "paint_mix_jobs"("business_id","job_no");
CREATE UNIQUE INDEX IF NOT EXISTS "paint_mix_jobs_business_id_idempotency_key_key" ON "paint_mix_jobs"("business_id","idempotency_key");
