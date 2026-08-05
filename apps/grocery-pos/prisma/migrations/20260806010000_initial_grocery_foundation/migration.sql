-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'LOCKED');

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('OWNER', 'ADMINISTRATOR', 'MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'SALESPERSON', 'VIEWER_AUDITOR');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'WEIGHTED', 'SERVICE');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'EXPIRED', 'DAMAGED', 'DEPLETED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'PURCHASE_RECEIPT', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'COUNT_GAIN', 'COUNT_LOSS', 'ADJUSTMENT_GAIN', 'ADJUSTMENT_LOSS', 'DAMAGE', 'WASTAGE', 'EXPIRY');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'HELD', 'COMPLETED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'PARTIALLY_RETURNED', 'FULLY_RETURNED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CUSTOMER_CREDIT', 'GIFT_VOUCHER', 'LOYALTY', 'CHEQUE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('RECEIPT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChequeDirection" AS ENUM ('INWARD', 'OUTWARD');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('RECEIVED', 'ISSUED', 'POST_DATED', 'DUE_TODAY', 'DEPOSITED', 'SUBMITTED_FOR_CLEARING', 'CLEARED', 'BOUNCED', 'RETURNED', 'REPLACED', 'CANCELLED', 'STOPPED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING', 'CASH_IN', 'CASH_OUT', 'DROP', 'WITHDRAWAL', 'REFUND', 'CLOSING_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'POST', 'REVERSE', 'CLEAR', 'BOUNCE', 'RETURN', 'CANCEL', 'REOPEN', 'EXPORT', 'LOGIN', 'LOGOUT');

-- CreateTable
CREATE TABLE "grocery_businesses" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'QAR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Qatar',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_users" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "RoleKey" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_sessions" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_branches" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_warehouses" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_registers" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_categories" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_units" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimalScale" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_products" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "categoryId" UUID,
    "baseUnitId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "plu" TEXT,
    "name" TEXT NOT NULL,
    "localName" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'STANDARD',
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "trackBatches" BOOLEAN NOT NULL DEFAULT false,
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "allowPriceOverride" BOOLEAN NOT NULL DEFAULT false,
    "allowDiscount" BOOLEAN NOT NULL DEFAULT true,
    "costPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "retailPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "wholesalePrice" DECIMAL(19,4),
    "memberPrice" DECIMAL(19,4),
    "minimumStock" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reorderQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_product_barcodes" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "barcode" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_product_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_unit_conversions" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "fromUnitId" UUID NOT NULL,
    "toUnitId" UUID NOT NULL,
    "factor" DECIMAL(19,6) NOT NULL,

    CONSTRAINT "grocery_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_product_batches" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "receivedQuantity" DECIMAL(19,4) NOT NULL,
    "remainingQuantity" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_inventory_balances" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "scopeKey" TEXT NOT NULL DEFAULT 'NO_BATCH',
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_inventory_movements" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "quantityBefore" DECIMAL(19,4) NOT NULL,
    "quantityAfter" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4),
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_customers" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "creditEnabled" BOOLEAN NOT NULL DEFAULT false,
    "creditLimit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "creditHold" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_suppliers" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "creditLimit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_sales" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "registerId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "customerId" UUID,
    "invoiceNumber" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "paidTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_sale_items" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "unitCostSnapshot" DECIMAL(19,4) NOT NULL,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_purchase_orders" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedAt" TIMESTAMP(3),
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_purchase_order_items" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "orderedQuantity" DECIMAL(19,4) NOT NULL,
    "receivedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "grocery_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_goods_receipts" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "receivedById" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_goods_receipt_items" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "grocery_goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_payment_accounts" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "methodType" "PaymentMethodType" NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "maskedAccountNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_payment_transactions" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID,
    "saleId" UUID,
    "accountId" UUID NOT NULL,
    "shiftId" UUID,
    "createdById" UUID NOT NULL,
    "methodType" "PaymentMethodType" NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(19,4) NOT NULL,
    "feeAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currencyCode" VARCHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(19,8) NOT NULL DEFAULT 1,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_cheques" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID,
    "paymentAccountId" UUID NOT NULL,
    "paymentTransactionId" UUID,
    "customerId" UUID,
    "supplierId" UUID,
    "createdById" UUID NOT NULL,
    "direction" "ChequeDirection" NOT NULL,
    "status" "ChequeStatus" NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankBranch" TEXT,
    "maskedAccount" TEXT,
    "drawerOrIssuer" TEXT,
    "payeeOrBeneficiary" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "chequeDate" TIMESTAMP(3) NOT NULL,
    "receivedOrIssuedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "depositDate" TIMESTAMP(3),
    "clearingDate" TIMESTAMP(3),
    "bounceOrReturnDate" TIMESTAMP(3),
    "cancellationDate" TIMESTAMP(3),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_cheques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_cheque_allocations" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "chequeId" UUID NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_cheque_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_cheque_status_history" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "chequeId" UUID NOT NULL,
    "fromStatus" "ChequeStatus",
    "toStatus" "ChequeStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_cheque_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_cheque_reminders" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "chequeId" UUID NOT NULL,
    "reminderKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_cheque_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_cashier_shifts" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "registerId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingCash" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "actualCash" DECIMAL(19,4),
    "variance" DECIMAL(19,4),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_cashier_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_cash_movements" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_expenses" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "paymentAccountId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_ledger_entries" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID,
    "supplierId" UUID,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_audit_logs" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_idempotency_records" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "grocery_idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grocery_businesses_slug_key" ON "grocery_businesses"("slug");

-- CreateIndex
CREATE INDEX "grocery_users_businessId_role_status_idx" ON "grocery_users"("businessId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_users_businessId_email_key" ON "grocery_users"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_sessions_tokenHash_key" ON "grocery_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "grocery_sessions_businessId_userId_expiresAt_idx" ON "grocery_sessions"("businessId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "grocery_branches_businessId_active_idx" ON "grocery_branches"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_branches_businessId_code_key" ON "grocery_branches"("businessId", "code");

-- CreateIndex
CREATE INDEX "grocery_warehouses_businessId_branchId_active_idx" ON "grocery_warehouses"("businessId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_warehouses_businessId_code_key" ON "grocery_warehouses"("businessId", "code");

-- CreateIndex
CREATE INDEX "grocery_registers_businessId_branchId_active_idx" ON "grocery_registers"("businessId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_registers_businessId_code_key" ON "grocery_registers"("businessId", "code");

-- CreateIndex
CREATE INDEX "grocery_categories_businessId_active_idx" ON "grocery_categories"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_categories_businessId_code_key" ON "grocery_categories"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_units_businessId_code_key" ON "grocery_units"("businessId", "code");

-- CreateIndex
CREATE INDEX "grocery_products_businessId_categoryId_active_idx" ON "grocery_products"("businessId", "categoryId", "active");

-- CreateIndex
CREATE INDEX "grocery_products_businessId_name_idx" ON "grocery_products"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_products_businessId_sku_key" ON "grocery_products"("businessId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_products_businessId_plu_key" ON "grocery_products"("businessId", "plu");

-- CreateIndex
CREATE INDEX "grocery_product_barcodes_businessId_productId_idx" ON "grocery_product_barcodes"("businessId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_product_barcodes_businessId_barcode_key" ON "grocery_product_barcodes"("businessId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_unit_conversions_businessId_productId_fromUnitId_to_key" ON "grocery_unit_conversions"("businessId", "productId", "fromUnitId", "toUnitId");

-- CreateIndex
CREATE INDEX "grocery_product_batches_businessId_warehouseId_expiryDate_s_idx" ON "grocery_product_batches"("businessId", "warehouseId", "expiryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_product_batches_businessId_productId_warehouseId_ba_key" ON "grocery_product_batches"("businessId", "productId", "warehouseId", "batchNumber");

-- CreateIndex
CREATE INDEX "grocery_inventory_balances_businessId_productId_warehouseId_idx" ON "grocery_inventory_balances"("businessId", "productId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_inventory_balances_businessId_warehouseId_productId_key" ON "grocery_inventory_balances"("businessId", "warehouseId", "productId", "scopeKey");

-- CreateIndex
CREATE INDEX "grocery_inventory_movements_businessId_branchId_warehouseId_idx" ON "grocery_inventory_movements"("businessId", "branchId", "warehouseId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "grocery_inventory_movements_businessId_referenceType_refere_idx" ON "grocery_inventory_movements"("businessId", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_inventory_movements_businessId_idempotencyKey_key" ON "grocery_inventory_movements"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "grocery_customers_businessId_name_active_idx" ON "grocery_customers"("businessId", "name", "active");

-- CreateIndex
CREATE INDEX "grocery_customers_businessId_phone_idx" ON "grocery_customers"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_customers_businessId_code_key" ON "grocery_customers"("businessId", "code");

-- CreateIndex
CREATE INDEX "grocery_suppliers_businessId_name_active_idx" ON "grocery_suppliers"("businessId", "name", "active");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_suppliers_businessId_code_key" ON "grocery_suppliers"("businessId", "code");

-- CreateIndex
CREATE INDEX "grocery_sales_businessId_branchId_createdAt_idx" ON "grocery_sales"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "grocery_sales_businessId_customerId_status_idx" ON "grocery_sales"("businessId", "customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_sales_businessId_invoiceNumber_key" ON "grocery_sales"("businessId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "grocery_sale_items_businessId_saleId_idx" ON "grocery_sale_items"("businessId", "saleId");

-- CreateIndex
CREATE INDEX "grocery_sale_items_businessId_productId_idx" ON "grocery_sale_items"("businessId", "productId");

-- CreateIndex
CREATE INDEX "grocery_purchase_orders_businessId_supplierId_status_idx" ON "grocery_purchase_orders"("businessId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_purchase_orders_businessId_orderNumber_key" ON "grocery_purchase_orders"("businessId", "orderNumber");

-- CreateIndex
CREATE INDEX "grocery_purchase_order_items_businessId_purchaseOrderId_idx" ON "grocery_purchase_order_items"("businessId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "grocery_goods_receipts_businessId_supplierId_receivedAt_idx" ON "grocery_goods_receipts"("businessId", "supplierId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_goods_receipts_businessId_receiptNumber_key" ON "grocery_goods_receipts"("businessId", "receiptNumber");

-- CreateIndex
CREATE INDEX "grocery_goods_receipt_items_businessId_goodsReceiptId_idx" ON "grocery_goods_receipt_items"("businessId", "goodsReceiptId");

-- CreateIndex
CREATE INDEX "grocery_payment_accounts_businessId_methodType_active_idx" ON "grocery_payment_accounts"("businessId", "methodType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_payment_accounts_businessId_code_key" ON "grocery_payment_accounts"("businessId", "code");

-- CreateIndex
CREATE INDEX "grocery_payment_transactions_businessId_methodType_directio_idx" ON "grocery_payment_transactions"("businessId", "methodType", "direction", "postedAt");

-- CreateIndex
CREATE INDEX "grocery_payment_transactions_businessId_accountId_postedAt_idx" ON "grocery_payment_transactions"("businessId", "accountId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_payment_transactions_businessId_idempotencyKey_key" ON "grocery_payment_transactions"("businessId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_cheques_paymentTransactionId_key" ON "grocery_cheques"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "grocery_cheques_businessId_direction_status_dueDate_idx" ON "grocery_cheques"("businessId", "direction", "status", "dueDate");

-- CreateIndex
CREATE INDEX "grocery_cheques_businessId_customerId_idx" ON "grocery_cheques"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "grocery_cheques_businessId_supplierId_idx" ON "grocery_cheques"("businessId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_cheques_businessId_direction_chequeNumber_bankName_key" ON "grocery_cheques"("businessId", "direction", "chequeNumber", "bankName");

-- CreateIndex
CREATE INDEX "grocery_cheque_allocations_businessId_referenceType_referen_idx" ON "grocery_cheque_allocations"("businessId", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_cheque_allocations_businessId_chequeId_referenceTyp_key" ON "grocery_cheque_allocations"("businessId", "chequeId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "grocery_cheque_status_history_businessId_chequeId_occurredA_idx" ON "grocery_cheque_status_history"("businessId", "chequeId", "occurredAt");

-- CreateIndex
CREATE INDEX "grocery_cheque_reminders_businessId_scheduledAt_deliveredAt_idx" ON "grocery_cheque_reminders"("businessId", "scheduledAt", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_cheque_reminders_businessId_chequeId_reminderKey_key" ON "grocery_cheque_reminders"("businessId", "chequeId", "reminderKey");

-- CreateIndex
CREATE INDEX "grocery_cashier_shifts_businessId_registerId_status_idx" ON "grocery_cashier_shifts"("businessId", "registerId", "status");

-- CreateIndex
CREATE INDEX "grocery_cashier_shifts_businessId_cashierId_openedAt_idx" ON "grocery_cashier_shifts"("businessId", "cashierId", "openedAt");

-- CreateIndex
CREATE INDEX "grocery_cash_movements_businessId_shiftId_createdAt_idx" ON "grocery_cash_movements"("businessId", "shiftId", "createdAt");

-- CreateIndex
CREATE INDEX "grocery_expenses_businessId_branchId_incurredAt_idx" ON "grocery_expenses"("businessId", "branchId", "incurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_expenses_businessId_expenseNumber_key" ON "grocery_expenses"("businessId", "expenseNumber");

-- CreateIndex
CREATE INDEX "grocery_ledger_entries_businessId_customerId_occurredAt_idx" ON "grocery_ledger_entries"("businessId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "grocery_ledger_entries_businessId_supplierId_occurredAt_idx" ON "grocery_ledger_entries"("businessId", "supplierId", "occurredAt");

-- CreateIndex
CREATE INDEX "grocery_ledger_entries_businessId_referenceType_referenceId_idx" ON "grocery_ledger_entries"("businessId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "grocery_audit_logs_businessId_entityType_entityId_createdAt_idx" ON "grocery_audit_logs"("businessId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "grocery_audit_logs_businessId_actorUserId_createdAt_idx" ON "grocery_audit_logs"("businessId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "grocery_idempotency_records_businessId_operation_expiresAt_idx" ON "grocery_idempotency_records"("businessId", "operation", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "grocery_idempotency_records_businessId_key_key" ON "grocery_idempotency_records"("businessId", "key");

-- AddForeignKey
ALTER TABLE "grocery_users" ADD CONSTRAINT "grocery_users_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sessions" ADD CONSTRAINT "grocery_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "grocery_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_branches" ADD CONSTRAINT "grocery_branches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_warehouses" ADD CONSTRAINT "grocery_warehouses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_warehouses" ADD CONSTRAINT "grocery_warehouses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_registers" ADD CONSTRAINT "grocery_registers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_registers" ADD CONSTRAINT "grocery_registers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_registers" ADD CONSTRAINT "grocery_registers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "grocery_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_categories" ADD CONSTRAINT "grocery_categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_units" ADD CONSTRAINT "grocery_units_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_products" ADD CONSTRAINT "grocery_products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_products" ADD CONSTRAINT "grocery_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "grocery_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_products" ADD CONSTRAINT "grocery_products_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "grocery_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_product_barcodes" ADD CONSTRAINT "grocery_product_barcodes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_unit_conversions" ADD CONSTRAINT "grocery_unit_conversions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_unit_conversions" ADD CONSTRAINT "grocery_unit_conversions_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "grocery_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_unit_conversions" ADD CONSTRAINT "grocery_unit_conversions_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "grocery_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_product_batches" ADD CONSTRAINT "grocery_product_batches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_product_batches" ADD CONSTRAINT "grocery_product_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_product_batches" ADD CONSTRAINT "grocery_product_batches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "grocery_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_balances" ADD CONSTRAINT "grocery_inventory_balances_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_balances" ADD CONSTRAINT "grocery_inventory_balances_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "grocery_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_balances" ADD CONSTRAINT "grocery_inventory_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_balances" ADD CONSTRAINT "grocery_inventory_balances_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "grocery_product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_movements" ADD CONSTRAINT "grocery_inventory_movements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_movements" ADD CONSTRAINT "grocery_inventory_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "grocery_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_movements" ADD CONSTRAINT "grocery_inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_inventory_movements" ADD CONSTRAINT "grocery_inventory_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "grocery_product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_customers" ADD CONSTRAINT "grocery_customers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_suppliers" ADD CONSTRAINT "grocery_suppliers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sales" ADD CONSTRAINT "grocery_sales_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sales" ADD CONSTRAINT "grocery_sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sales" ADD CONSTRAINT "grocery_sales_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "grocery_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sales" ADD CONSTRAINT "grocery_sales_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "grocery_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sales" ADD CONSTRAINT "grocery_sales_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sales" ADD CONSTRAINT "grocery_sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "grocery_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sale_items" ADD CONSTRAINT "grocery_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "grocery_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sale_items" ADD CONSTRAINT "grocery_sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_sale_items" ADD CONSTRAINT "grocery_sale_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "grocery_product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_purchase_orders" ADD CONSTRAINT "grocery_purchase_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_purchase_orders" ADD CONSTRAINT "grocery_purchase_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_purchase_orders" ADD CONSTRAINT "grocery_purchase_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "grocery_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_purchase_orders" ADD CONSTRAINT "grocery_purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "grocery_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_purchase_orders" ADD CONSTRAINT "grocery_purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_purchase_order_items" ADD CONSTRAINT "grocery_purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "grocery_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_purchase_order_items" ADD CONSTRAINT "grocery_purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipts" ADD CONSTRAINT "grocery_goods_receipts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipts" ADD CONSTRAINT "grocery_goods_receipts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipts" ADD CONSTRAINT "grocery_goods_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "grocery_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipts" ADD CONSTRAINT "grocery_goods_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "grocery_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipts" ADD CONSTRAINT "grocery_goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "grocery_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipts" ADD CONSTRAINT "grocery_goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipt_items" ADD CONSTRAINT "grocery_goods_receipt_items_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "grocery_goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipt_items" ADD CONSTRAINT "grocery_goods_receipt_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "grocery_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_goods_receipt_items" ADD CONSTRAINT "grocery_goods_receipt_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "grocery_product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_accounts" ADD CONSTRAINT "grocery_payment_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_accounts" ADD CONSTRAINT "grocery_payment_accounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_transactions" ADD CONSTRAINT "grocery_payment_transactions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_transactions" ADD CONSTRAINT "grocery_payment_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_transactions" ADD CONSTRAINT "grocery_payment_transactions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "grocery_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_transactions" ADD CONSTRAINT "grocery_payment_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "grocery_payment_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_transactions" ADD CONSTRAINT "grocery_payment_transactions_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "grocery_cashier_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_payment_transactions" ADD CONSTRAINT "grocery_payment_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheques" ADD CONSTRAINT "grocery_cheques_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheques" ADD CONSTRAINT "grocery_cheques_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheques" ADD CONSTRAINT "grocery_cheques_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "grocery_payment_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheques" ADD CONSTRAINT "grocery_cheques_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "grocery_payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheques" ADD CONSTRAINT "grocery_cheques_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "grocery_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheques" ADD CONSTRAINT "grocery_cheques_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "grocery_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheques" ADD CONSTRAINT "grocery_cheques_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheque_allocations" ADD CONSTRAINT "grocery_cheque_allocations_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "grocery_cheques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheque_status_history" ADD CONSTRAINT "grocery_cheque_status_history_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "grocery_cheques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cheque_reminders" ADD CONSTRAINT "grocery_cheque_reminders_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "grocery_cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cashier_shifts" ADD CONSTRAINT "grocery_cashier_shifts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cashier_shifts" ADD CONSTRAINT "grocery_cashier_shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cashier_shifts" ADD CONSTRAINT "grocery_cashier_shifts_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "grocery_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cashier_shifts" ADD CONSTRAINT "grocery_cashier_shifts_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cash_movements" ADD CONSTRAINT "grocery_cash_movements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cash_movements" ADD CONSTRAINT "grocery_cash_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "grocery_cashier_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_cash_movements" ADD CONSTRAINT "grocery_cash_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_expenses" ADD CONSTRAINT "grocery_expenses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_expenses" ADD CONSTRAINT "grocery_expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "grocery_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_expenses" ADD CONSTRAINT "grocery_expenses_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "grocery_payment_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_expenses" ADD CONSTRAINT "grocery_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "grocery_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_ledger_entries" ADD CONSTRAINT "grocery_ledger_entries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_ledger_entries" ADD CONSTRAINT "grocery_ledger_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "grocery_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_ledger_entries" ADD CONSTRAINT "grocery_ledger_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "grocery_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_audit_logs" ADD CONSTRAINT "grocery_audit_logs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_audit_logs" ADD CONSTRAINT "grocery_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "grocery_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_idempotency_records" ADD CONSTRAINT "grocery_idempotency_records_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "grocery_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
