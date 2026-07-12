-- Axtor POS full backend build-out.
-- Existing production databases receive the missing columns first; the idempotent baseline below creates all missing tables, indexes and foreign keys.
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'Retail';
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "manager" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "inventory_stocks" ADD COLUMN IF NOT EXISTS "reorder_level" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "shift_id" TEXT;
ALTER TABLE "sales_documents" ADD COLUMN IF NOT EXISTS "counter_id" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "reference_no" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP(3);
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "account_number" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "counters" ADD COLUMN IF NOT EXISTS "cashier_user_id" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "cashier_name" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "counter_name" TEXT;

CREATE INDEX IF NOT EXISTS "sales_documents_business_id_shift_id_idx" ON "sales_documents"("business_id", "shift_id");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_counter_id_idx" ON "sales_documents"("business_id", "counter_id");
CREATE INDEX IF NOT EXISTS "purchases_business_id_warehouse_id_idx" ON "purchases"("business_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "expenses_business_id_account_id_idx" ON "expenses"("business_id", "account_id");
CREATE INDEX IF NOT EXISTS "expenses_business_id_branch_id_idx" ON "expenses"("business_id", "branch_id");
-- Idempotent baseline generated from prisma/schema.prisma.
-- Safe for a fresh PostgreSQL database and safe to run against an already initialized Axtor database.

DO $$ BEGIN
  CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'QUOTATION', 'DELIVERY_NOTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalesDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'CREDIT', 'CANCELLED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CounterStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "businesses" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "slug" TEXT NOT NULL,
  "status" "BusinessStatus" NOT NULL DEFAULT 'TRIAL',
  "country" TEXT DEFAULT 'QA',
  "timezone" TEXT DEFAULT 'Asia/Qatar',
  "currency" TEXT DEFAULT 'QAR',
  "tax_number" TEXT,
  "subscription_plan" TEXT,
  "subscription_status" TEXT,
  "trial_ends_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "password_hash" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "roles" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_system_role" BOOLEAN NOT NULL DEFAULT FALSE,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "branches" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "country" TEXT DEFAULT 'QA',
  "type" TEXT DEFAULT 'Retail',
  "manager" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "address" TEXT,
  "map_url" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "company" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "type" TEXT DEFAULT 'Retail',
  "address" TEXT,
  "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit_days" INTEGER NOT NULL DEFAULT 30,
  "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT DEFAULT 'active',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "credit_days" INTEGER NOT NULL DEFAULT 30,
  "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_categories" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "qr_code" TEXT,
  "code" TEXT,
  "item_code" TEXT,
  "product_code" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "brand" TEXT,
  "unit" TEXT DEFAULT 'PCS',
  "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cost_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "min_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "opening_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "current_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "deleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "image_url" TEXT,
  "custom_fields" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "inventory_stocks" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "qty_on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "qty_reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "reorder_level" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "movement_no" TEXT NOT NULL,
  "product_id" TEXT,
  "sku" TEXT,
  "product_name" TEXT NOT NULL,
  "warehouse_id" TEXT,
  "to_warehouse_id" TEXT,
  "direction" "StockDirection" NOT NULL,
  "movement_type" TEXT NOT NULL,
  "reference_no" TEXT,
  "qty" DECIMAL(14,3) NOT NULL,
  "before_qty" DECIMAL(14,3),
  "after_qty" DECIMAL(14,3),
  "source" TEXT,
  "metadata" JSONB,
  "movement_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sales_documents" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "warehouse_id" TEXT,
  "shift_id" TEXT,
  "counter_id" TEXT,
  "document_no" TEXT NOT NULL,
  "document_type" "DocumentType" NOT NULL,
  "document_prefix" TEXT,
  "lpo_no" TEXT,
  "customer_po_no" TEXT,
  "po_no" TEXT,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "salesman_id" TEXT,
  "salesman_name" TEXT,
  "payment_method" TEXT,
  "currency" TEXT DEFAULT 'QAR',
  "sales_channel" TEXT,
  "reference_no" TEXT,
  "internal_notes" TEXT,
  "customer_notes" TEXT,
  "payment_status" TEXT,
  "stock_status" TEXT,
  "status" "SalesDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "return_status" TEXT NOT NULL DEFAULT 'not_returned',
  "returned_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "return_count" INTEGER NOT NULL DEFAULT 0,
  "refunded_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refund_status" TEXT NOT NULL DEFAULT 'not_refunded',
  "credit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "customer_credit_applied" BOOLEAN NOT NULL DEFAULT FALSE,
  "due_date" TIMESTAMP(3),
  "issued_at" TIMESTAMP(3),
  "posted_at" TIMESTAMP(3),
  "idempotency_key" TEXT,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales_document_items" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "sales_document_id" TEXT NOT NULL,
  "product_id" TEXT,
  "sku" TEXT,
  "barcode" TEXT,
  "qr_code" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT DEFAULT 'PCS',
  "qty" DECIMAL(14,3) NOT NULL,
  "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sales_returns" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "return_no" TEXT NOT NULL,
  "source_sales_document_id" TEXT NOT NULL,
  "source_document_no" TEXT,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refund_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales_return_items" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "sales_return_id" TEXT NOT NULL,
  "product_id" TEXT,
  "sku" TEXT,
  "barcode" TEXT,
  "qr_code" TEXT,
  "name" TEXT NOT NULL,
  "unit" TEXT DEFAULT 'PCS',
  "sold_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "return_qty" DECIMAL(14,3) NOT NULL,
  "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "customer_refunds" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "refund_no" TEXT NOT NULL,
  "sales_document_id" TEXT NOT NULL,
  "sales_return_id" TEXT,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" TEXT NOT NULL,
  "account_id" TEXT,
  "reference_no" TEXT,
  "notes" TEXT,
  "idempotency_key" TEXT,
  "refund_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "customer_payments" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "receipt_no" TEXT NOT NULL,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" TEXT,
  "account_id" TEXT,
  "reference_no" TEXT,
  "idempotency_key" TEXT,
  "allocation" JSONB,
  "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchases" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "warehouse_id" TEXT,
  "purchase_no" TEXT NOT NULL,
  "supplier_id" TEXT,
  "supplier_name" TEXT NOT NULL,
  "authorized_by" TEXT,
  "reference_no" TEXT,
  "due_date" TIMESTAMP(3),
  "received_at" TIMESTAMP(3),
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchase_items" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "purchase_id" TEXT NOT NULL,
  "product_id" TEXT,
  "sku" TEXT,
  "barcode" TEXT,
  "name" TEXT NOT NULL,
  "qty" DECIMAL(14,3) NOT NULL,
  "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "supplier_payments" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "voucher_no" TEXT NOT NULL,
  "supplier_id" TEXT,
  "supplier_name" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" TEXT,
  "account_id" TEXT,
  "reference_no" TEXT,
  "allocation" JSONB,
  "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "account_number" TEXT,
  "bank_name" TEXT,
  "currency" TEXT DEFAULT 'QAR',
  "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "account_id" TEXT,
  "branch_id" TEXT,
  "created_by_user_id" TEXT,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "reference_no" TEXT,
  "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "counters" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "cashier_user_id" TEXT,
  "status" "CounterStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "shifts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "counter_id" TEXT,
  "cashier_user_id" TEXT,
  "cashier_name" TEXT,
  "counter_name" TEXT,
  "opened_by_user_id" TEXT,
  "closed_by_user_id" TEXT,
  "opening_cash" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "closing_cash" DECIMAL(14,2),
  "expected_cash" DECIMAL(14,2),
  "variance" DECIMAL(14,2),
  "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "document_counters" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "document_type" "DocumentType" NOT NULL,
  "prefix" TEXT NOT NULL,
  "next_number" INTEGER NOT NULL DEFAULT 1,
  "padding" INTEGER NOT NULL DEFAULT 6,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "salesmen" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT,
  "branch_id" TEXT,
  "branch_name" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "join_date" TIMESTAMP(3),
  "base_commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "salesman_targets" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "salesman_id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "target_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "target_invoices" INTEGER NOT NULL DEFAULT 0,
  "commission_tiers" JSONB,
  "bonus_on_target" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "commission_payouts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "salesman_id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "gross_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "achievement_pct" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_payout" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "approved_by_user_id" TEXT,
  "paid_date" TIMESTAMP(3),
  "payment_method" TEXT,
  "notes" TEXT,
  "disputed" BOOLEAN NOT NULL DEFAULT FALSE,
  "dispute_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "stock_counts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "count_no" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "counted_by_user_id" TEXT,
  "approved_by_user_id" TEXT,
  "counted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "stock_count_items" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "stock_count_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "sku" TEXT,
  "product_name" TEXT NOT NULL,
  "system_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "counted_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "difference" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "purchase_requests" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "request_no" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "qty" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'open',
  "purchase_id" TEXT,
  "requested_by_user_id" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "purchase_id" TEXT NOT NULL,
  "receipt_no" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "received_by_user_id" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "goods_receipt_id" TEXT NOT NULL,
  "product_id" TEXT,
  "sku" TEXT,
  "product_name" TEXT NOT NULL,
  "qty" DECIMAL(14,3) NOT NULL,
  "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "purchase_returns" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "purchase_id" TEXT,
  "return_no" TEXT NOT NULL,
  "supplier_id" TEXT,
  "supplier_name" TEXT NOT NULL,
  "warehouse_id" TEXT,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchase_return_items" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "purchase_return_id" TEXT NOT NULL,
  "product_id" TEXT,
  "sku" TEXT,
  "product_name" TEXT NOT NULL,
  "qty" DECIMAL(14,3) NOT NULL,
  "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "account_transactions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "reference_no" TEXT,
  "description" TEXT,
  "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_type" TEXT,
  "source_id" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "promotions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "value_text" TEXT,
  "code" TEXT,
  "scope" JSONB,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "loyalty_programs" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Default Loyalty Program',
  "points_per_currency" DECIMAL(10,4) NOT NULL DEFAULT 1,
  "redemption_rate" DECIMAL(10,4) NOT NULL DEFAULT 0.01,
  "rules" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "loyalty_accounts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "points" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tier" TEXT NOT NULL DEFAULT 'Bronze',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "loyalty_ledger" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "points" DECIMAL(14,2) NOT NULL,
  "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reference_no" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "approval_rules" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "threshold" DECIMAL(14,2),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "request_no" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "entity_type" TEXT,
  "entity_id" TEXT,
  "requested_by_user_id" TEXT,
  "decided_by_user_id" TEXT,
  "decision_note" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "communication_logs" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "business_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "customer_name" TEXT,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'prepared',
  "reference_no" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "businesses_slug_key" ON "businesses"("slug");

CREATE UNIQUE INDEX IF NOT EXISTS "users_business_id_email_key" ON "users"("business_id", "email");
CREATE INDEX IF NOT EXISTS "users_business_id_idx" ON "users"("business_id");
CREATE INDEX IF NOT EXISTS "users_branch_id_idx" ON "users"("branch_id");

CREATE UNIQUE INDEX IF NOT EXISTS "roles_business_id_name_key" ON "roles"("business_id", "name");
CREATE INDEX IF NOT EXISTS "roles_business_id_idx" ON "roles"("business_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_business_id_user_id_role_id_key" ON "user_roles"("business_id", "user_id", "role_id");
CREATE INDEX IF NOT EXISTS "user_roles_business_id_idx" ON "user_roles"("business_id");
CREATE INDEX IF NOT EXISTS "user_roles_user_id_idx" ON "user_roles"("user_id");
CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles"("role_id");

CREATE UNIQUE INDEX IF NOT EXISTS "branches_business_id_name_key" ON "branches"("business_id", "name");
CREATE INDEX IF NOT EXISTS "branches_business_id_idx" ON "branches"("business_id");

CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_business_id_name_key" ON "warehouses"("business_id", "name");
CREATE INDEX IF NOT EXISTS "warehouses_business_id_idx" ON "warehouses"("business_id");
CREATE INDEX IF NOT EXISTS "warehouses_branch_id_idx" ON "warehouses"("branch_id");

CREATE UNIQUE INDEX IF NOT EXISTS "customers_business_id_code_key" ON "customers"("business_id", "code");
CREATE INDEX IF NOT EXISTS "customers_business_id_idx" ON "customers"("business_id");
CREATE INDEX IF NOT EXISTS "customers_business_id_name_idx" ON "customers"("business_id", "name");

CREATE INDEX IF NOT EXISTS "suppliers_business_id_idx" ON "suppliers"("business_id");
CREATE INDEX IF NOT EXISTS "suppliers_business_id_name_idx" ON "suppliers"("business_id", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "product_categories_business_id_name_key" ON "product_categories"("business_id", "name");
CREATE INDEX IF NOT EXISTS "product_categories_business_id_idx" ON "product_categories"("business_id");

CREATE UNIQUE INDEX IF NOT EXISTS "products_business_id_sku_key" ON "products"("business_id", "sku");
CREATE INDEX IF NOT EXISTS "products_business_id_idx" ON "products"("business_id");
CREATE INDEX IF NOT EXISTS "products_business_id_barcode_idx" ON "products"("business_id", "barcode");
CREATE INDEX IF NOT EXISTS "products_business_id_qr_code_idx" ON "products"("business_id", "qr_code");

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_stocks_business_id_product_id_warehouse_id_key" ON "inventory_stocks"("business_id", "product_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "inventory_stocks_business_id_idx" ON "inventory_stocks"("business_id");
CREATE INDEX IF NOT EXISTS "inventory_stocks_product_id_idx" ON "inventory_stocks"("product_id");
CREATE INDEX IF NOT EXISTS "inventory_stocks_warehouse_id_idx" ON "inventory_stocks"("warehouse_id");

CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_business_id_movement_no_key" ON "stock_movements"("business_id", "movement_no");
CREATE INDEX IF NOT EXISTS "stock_movements_business_id_idx" ON "stock_movements"("business_id");
CREATE INDEX IF NOT EXISTS "stock_movements_business_id_sku_idx" ON "stock_movements"("business_id", "sku");
CREATE INDEX IF NOT EXISTS "stock_movements_business_id_reference_no_idx" ON "stock_movements"("business_id", "reference_no");

CREATE UNIQUE INDEX IF NOT EXISTS "sales_documents_business_id_document_no_key" ON "sales_documents"("business_id", "document_no");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_documents_business_id_idempotency_key_key" ON "sales_documents"("business_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_idx" ON "sales_documents"("business_id");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_warehouse_id_idx" ON "sales_documents"("business_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_shift_id_idx" ON "sales_documents"("business_id", "shift_id");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_counter_id_idx" ON "sales_documents"("business_id", "counter_id");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_reference_no_idx" ON "sales_documents"("business_id", "reference_no");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_document_type_idx" ON "sales_documents"("business_id", "document_type");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_customer_id_idx" ON "sales_documents"("business_id", "customer_id");
CREATE INDEX IF NOT EXISTS "sales_documents_business_id_status_idx" ON "sales_documents"("business_id", "status");

CREATE INDEX IF NOT EXISTS "sales_document_items_business_id_idx" ON "sales_document_items"("business_id");
CREATE INDEX IF NOT EXISTS "sales_document_items_sales_document_id_idx" ON "sales_document_items"("sales_document_id");
CREATE INDEX IF NOT EXISTS "sales_document_items_business_id_sku_idx" ON "sales_document_items"("business_id", "sku");

CREATE UNIQUE INDEX IF NOT EXISTS "sales_returns_business_id_return_no_key" ON "sales_returns"("business_id", "return_no");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_returns_business_id_idempotency_key_key" ON "sales_returns"("business_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "sales_returns_business_id_idx" ON "sales_returns"("business_id");
CREATE INDEX IF NOT EXISTS "sales_returns_business_id_source_sales_document_id_idx" ON "sales_returns"("business_id", "source_sales_document_id");
CREATE INDEX IF NOT EXISTS "sales_returns_business_id_customer_id_idx" ON "sales_returns"("business_id", "customer_id");

CREATE INDEX IF NOT EXISTS "sales_return_items_business_id_idx" ON "sales_return_items"("business_id");
CREATE INDEX IF NOT EXISTS "sales_return_items_sales_return_id_idx" ON "sales_return_items"("sales_return_id");
CREATE INDEX IF NOT EXISTS "sales_return_items_business_id_sku_idx" ON "sales_return_items"("business_id", "sku");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_refunds_business_id_refund_no_key" ON "customer_refunds"("business_id", "refund_no");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_refunds_business_id_idempotency_key_key" ON "customer_refunds"("business_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "customer_refunds_business_id_idx" ON "customer_refunds"("business_id");
CREATE INDEX IF NOT EXISTS "customer_refunds_business_id_sales_document_id_idx" ON "customer_refunds"("business_id", "sales_document_id");
CREATE INDEX IF NOT EXISTS "customer_refunds_business_id_sales_return_id_idx" ON "customer_refunds"("business_id", "sales_return_id");
CREATE INDEX IF NOT EXISTS "customer_refunds_business_id_customer_id_idx" ON "customer_refunds"("business_id", "customer_id");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_payments_business_id_receipt_no_key" ON "customer_payments"("business_id", "receipt_no");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_payments_business_id_idempotency_key_key" ON "customer_payments"("business_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "customer_payments_business_id_idx" ON "customer_payments"("business_id");
CREATE INDEX IF NOT EXISTS "customer_payments_business_id_customer_id_idx" ON "customer_payments"("business_id", "customer_id");

CREATE UNIQUE INDEX IF NOT EXISTS "purchases_business_id_purchase_no_key" ON "purchases"("business_id", "purchase_no");
CREATE INDEX IF NOT EXISTS "purchases_business_id_idx" ON "purchases"("business_id");
CREATE INDEX IF NOT EXISTS "purchases_business_id_supplier_id_idx" ON "purchases"("business_id", "supplier_id");
CREATE INDEX IF NOT EXISTS "purchases_business_id_warehouse_id_idx" ON "purchases"("business_id", "warehouse_id");

CREATE INDEX IF NOT EXISTS "purchase_items_business_id_idx" ON "purchase_items"("business_id");
CREATE INDEX IF NOT EXISTS "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");
CREATE INDEX IF NOT EXISTS "purchase_items_business_id_sku_idx" ON "purchase_items"("business_id", "sku");

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payments_business_id_voucher_no_key" ON "supplier_payments"("business_id", "voucher_no");
CREATE INDEX IF NOT EXISTS "supplier_payments_business_id_idx" ON "supplier_payments"("business_id");
CREATE INDEX IF NOT EXISTS "supplier_payments_business_id_supplier_id_idx" ON "supplier_payments"("business_id", "supplier_id");

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_business_id_name_key" ON "accounts"("business_id", "name");
CREATE INDEX IF NOT EXISTS "accounts_business_id_idx" ON "accounts"("business_id");

CREATE INDEX IF NOT EXISTS "expenses_business_id_idx" ON "expenses"("business_id");
CREATE INDEX IF NOT EXISTS "expenses_business_id_category_idx" ON "expenses"("business_id", "category");
CREATE INDEX IF NOT EXISTS "expenses_business_id_account_id_idx" ON "expenses"("business_id", "account_id");
CREATE INDEX IF NOT EXISTS "expenses_business_id_branch_id_idx" ON "expenses"("business_id", "branch_id");

CREATE UNIQUE INDEX IF NOT EXISTS "counters_business_id_name_key" ON "counters"("business_id", "name");
CREATE INDEX IF NOT EXISTS "counters_business_id_idx" ON "counters"("business_id");
CREATE INDEX IF NOT EXISTS "counters_branch_id_idx" ON "counters"("branch_id");

CREATE INDEX IF NOT EXISTS "shifts_business_id_idx" ON "shifts"("business_id");
CREATE INDEX IF NOT EXISTS "shifts_business_id_status_idx" ON "shifts"("business_id", "status");
CREATE INDEX IF NOT EXISTS "shifts_counter_id_idx" ON "shifts"("counter_id");

CREATE INDEX IF NOT EXISTS "audit_logs_business_id_idx" ON "audit_logs"("business_id");
CREATE INDEX IF NOT EXISTS "audit_logs_business_id_entity_type_entity_id_idx" ON "audit_logs"("business_id", "entity_type", "entity_id");

CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_business_id_key_key" ON "app_settings"("business_id", "key");
CREATE INDEX IF NOT EXISTS "app_settings_business_id_idx" ON "app_settings"("business_id");

CREATE UNIQUE INDEX IF NOT EXISTS "document_counters_business_id_branch_id_document_type_key" ON "document_counters"("business_id", "branch_id", "document_type");
CREATE INDEX IF NOT EXISTS "document_counters_business_id_idx" ON "document_counters"("business_id");

CREATE UNIQUE INDEX IF NOT EXISTS "salesmen_business_id_email_key" ON "salesmen"("business_id", "email");
CREATE INDEX IF NOT EXISTS "salesmen_business_id_idx" ON "salesmen"("business_id");
CREATE INDEX IF NOT EXISTS "salesmen_business_id_active_idx" ON "salesmen"("business_id", "active");
CREATE INDEX IF NOT EXISTS "salesmen_business_id_branch_id_idx" ON "salesmen"("business_id", "branch_id");

CREATE UNIQUE INDEX IF NOT EXISTS "salesman_targets_business_id_salesman_id_month_key" ON "salesman_targets"("business_id", "salesman_id", "month");
CREATE INDEX IF NOT EXISTS "salesman_targets_business_id_month_idx" ON "salesman_targets"("business_id", "month");

CREATE UNIQUE INDEX IF NOT EXISTS "commission_payouts_business_id_salesman_id_month_key" ON "commission_payouts"("business_id", "salesman_id", "month");
CREATE INDEX IF NOT EXISTS "commission_payouts_business_id_month_idx" ON "commission_payouts"("business_id", "month");
CREATE INDEX IF NOT EXISTS "commission_payouts_business_id_status_idx" ON "commission_payouts"("business_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "stock_counts_business_id_count_no_key" ON "stock_counts"("business_id", "count_no");
CREATE INDEX IF NOT EXISTS "stock_counts_business_id_warehouse_id_idx" ON "stock_counts"("business_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "stock_counts_business_id_status_idx" ON "stock_counts"("business_id", "status");

CREATE INDEX IF NOT EXISTS "stock_count_items_business_id_idx" ON "stock_count_items"("business_id");
CREATE INDEX IF NOT EXISTS "stock_count_items_stock_count_id_idx" ON "stock_count_items"("stock_count_id");

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requests_business_id_request_no_key" ON "purchase_requests"("business_id", "request_no");
CREATE INDEX IF NOT EXISTS "purchase_requests_business_id_status_idx" ON "purchase_requests"("business_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_business_id_receipt_no_key" ON "goods_receipts"("business_id", "receipt_no");
CREATE INDEX IF NOT EXISTS "goods_receipts_business_id_purchase_id_idx" ON "goods_receipts"("business_id", "purchase_id");
CREATE INDEX IF NOT EXISTS "goods_receipts_business_id_warehouse_id_idx" ON "goods_receipts"("business_id", "warehouse_id");

CREATE INDEX IF NOT EXISTS "goods_receipt_items_business_id_idx" ON "goods_receipt_items"("business_id");
CREATE INDEX IF NOT EXISTS "goods_receipt_items_goods_receipt_id_idx" ON "goods_receipt_items"("goods_receipt_id");

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_returns_business_id_return_no_key" ON "purchase_returns"("business_id", "return_no");
CREATE INDEX IF NOT EXISTS "purchase_returns_business_id_supplier_id_idx" ON "purchase_returns"("business_id", "supplier_id");

CREATE INDEX IF NOT EXISTS "purchase_return_items_business_id_idx" ON "purchase_return_items"("business_id");
CREATE INDEX IF NOT EXISTS "purchase_return_items_purchase_return_id_idx" ON "purchase_return_items"("purchase_return_id");

CREATE INDEX IF NOT EXISTS "account_transactions_business_id_account_id_idx" ON "account_transactions"("business_id", "account_id");
CREATE INDEX IF NOT EXISTS "account_transactions_business_id_transaction_date_idx" ON "account_transactions"("business_id", "transaction_date");

CREATE UNIQUE INDEX IF NOT EXISTS "promotions_business_id_code_key" ON "promotions"("business_id", "code");
CREATE INDEX IF NOT EXISTS "promotions_business_id_active_idx" ON "promotions"("business_id", "active");

CREATE INDEX IF NOT EXISTS "loyalty_programs_business_id_active_idx" ON "loyalty_programs"("business_id", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_accounts_business_id_customer_id_key" ON "loyalty_accounts"("business_id", "customer_id");
CREATE INDEX IF NOT EXISTS "loyalty_accounts_business_id_customer_name_idx" ON "loyalty_accounts"("business_id", "customer_name");

CREATE INDEX IF NOT EXISTS "loyalty_ledger_business_id_customer_id_idx" ON "loyalty_ledger"("business_id", "customer_id");
CREATE INDEX IF NOT EXISTS "loyalty_ledger_business_id_created_at_idx" ON "loyalty_ledger"("business_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_business_id_read_at_idx" ON "notifications"("business_id", "read_at");
CREATE INDEX IF NOT EXISTS "notifications_business_id_user_id_idx" ON "notifications"("business_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "approval_rules_business_id_key_key" ON "approval_rules"("business_id", "key");
CREATE INDEX IF NOT EXISTS "approval_rules_business_id_active_idx" ON "approval_rules"("business_id", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_business_id_request_no_key" ON "approval_requests"("business_id", "request_no");
CREATE INDEX IF NOT EXISTS "approval_requests_business_id_status_idx" ON "approval_requests"("business_id", "status");

CREATE INDEX IF NOT EXISTS "communication_logs_business_id_created_at_idx" ON "communication_logs"("business_id", "created_at");
CREATE INDEX IF NOT EXISTS "communication_logs_business_id_customer_id_idx" ON "communication_logs"("business_id", "customer_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_business_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_branch_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_business_id_fkey') THEN
    ALTER TABLE "roles" ADD CONSTRAINT "roles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_business_id_fkey') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_fkey') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_id_fkey') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_business_id_fkey') THEN
    ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_business_id_fkey') THEN
    ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_branch_id_fkey') THEN
    ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_business_id_fkey') THEN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_business_id_fkey') THEN
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_categories_business_id_fkey') THEN
    ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_business_id_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_stocks_business_id_fkey') THEN
    ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_business_id_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_documents_business_id_fkey') THEN
    ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_document_items_business_id_fkey') THEN
    ALTER TABLE "sales_document_items" ADD CONSTRAINT "sales_document_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_document_items_sales_document_id_fkey') THEN
    ALTER TABLE "sales_document_items" ADD CONSTRAINT "sales_document_items_sales_document_id_fkey" FOREIGN KEY ("sales_document_id") REFERENCES "sales_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_returns_business_id_fkey') THEN
    ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_returns_source_sales_document_id_fkey') THEN
    ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_source_sales_document_id_fkey" FOREIGN KEY ("source_sales_document_id") REFERENCES "sales_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_return_items_business_id_fkey') THEN
    ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_return_items_sales_return_id_fkey') THEN
    ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_refunds_business_id_fkey') THEN
    ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_refunds_sales_document_id_fkey') THEN
    ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_sales_document_id_fkey" FOREIGN KEY ("sales_document_id") REFERENCES "sales_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_refunds_sales_return_id_fkey') THEN
    ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_payments_business_id_fkey') THEN
    ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_business_id_fkey') THEN
    ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_business_id_fkey') THEN
    ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_purchase_id_fkey') THEN
    ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_business_id_fkey') THEN
    ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_business_id_fkey') THEN
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_business_id_fkey') THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'counters_business_id_fkey') THEN
    ALTER TABLE "counters" ADD CONSTRAINT "counters_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'counters_branch_id_fkey') THEN
    ALTER TABLE "counters" ADD CONSTRAINT "counters_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_business_id_fkey') THEN
    ALTER TABLE "shifts" ADD CONSTRAINT "shifts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_branch_id_fkey') THEN
    ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_counter_id_fkey') THEN
    ALTER TABLE "shifts" ADD CONSTRAINT "shifts_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_business_id_fkey') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_business_id_fkey') THEN
    ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_counters_business_id_fkey') THEN
    ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salesmen_business_id_fkey') THEN
    ALTER TABLE "salesmen" ADD CONSTRAINT "salesmen_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salesman_targets_business_id_fkey') THEN
    ALTER TABLE "salesman_targets" ADD CONSTRAINT "salesman_targets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salesman_targets_salesman_id_fkey') THEN
    ALTER TABLE "salesman_targets" ADD CONSTRAINT "salesman_targets_salesman_id_fkey" FOREIGN KEY ("salesman_id") REFERENCES "salesmen" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_payouts_business_id_fkey') THEN
    ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_payouts_salesman_id_fkey') THEN
    ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_salesman_id_fkey" FOREIGN KEY ("salesman_id") REFERENCES "salesmen" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_counts_business_id_fkey') THEN
    ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_items_business_id_fkey') THEN
    ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_items_stock_count_id_fkey') THEN
    ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_business_id_fkey') THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_business_id_fkey') THEN
    ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_purchase_id_fkey') THEN
    ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_items_business_id_fkey') THEN
    ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_items_goods_receipt_id_fkey') THEN
    ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_returns_business_id_fkey') THEN
    ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_returns_purchase_id_fkey') THEN
    ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_return_items_business_id_fkey') THEN
    ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_return_items_purchase_return_id_fkey') THEN
    ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_transactions_business_id_fkey') THEN
    ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_transactions_account_id_fkey') THEN
    ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotions_business_id_fkey') THEN
    ALTER TABLE "promotions" ADD CONSTRAINT "promotions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_programs_business_id_fkey') THEN
    ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_business_id_fkey') THEN
    ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_ledger_business_id_fkey') THEN
    ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_business_id_fkey') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_rules_business_id_fkey') THEN
    ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_business_id_fkey') THEN
    ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_logs_business_id_fkey') THEN
    ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

