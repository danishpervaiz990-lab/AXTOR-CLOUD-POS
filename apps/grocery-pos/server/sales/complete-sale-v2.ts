import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import {
  AuditAction,
  ChequeDirection,
  ChequeStatus,
  InventoryMovementType,
  LedgerDirection,
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
  SaleStatus
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { applyLedgerEntry } from "@/server/finance/ledger-statement";
import { postInventoryMovement } from "@/server/inventory/post-inventory-movement";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type CheckoutItemInput = {
  productId: string;
  batchId?: string | null;
  quantity: string;
  unitPrice?: string | null;
  discountAmount?: string | null;
};

export type CheckoutPaymentInput = {
  accountId: string;
  methodType: PaymentMethodType;
  amount: string;
  reference?: string | null;
  cheque?: {
    chequeNumber: string;
    bankName: string;
    bankBranch?: string | null;
    maskedAccount?: string | null;
    drawerOrIssuer?: string | null;
    chequeDate: Date;
    dueDate: Date;
  } | null;
};

export type CompleteSaleInput = {
  context: TenantContext;
  idempotencyKey: string;
  branchId: string;
  warehouseId: string;
  registerId: string;
  customerId?: string | null;
  dueAt?: Date | null;
  items: CheckoutItemInput[];
  payments: CheckoutPaymentInput[];
};

export type CompleteSaleResult = {
  saleId: string;
  invoiceNumber: string;
  status: SaleStatus;
  grandTotal: string;
  paidTotal: string;
  pendingChequeTotal: string;
  unsecuredCreditTotal: string;
  balanceDue: string;
};

function positiveQuantity(value: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || !parsed.isPositive() || parsed.decimalPlaces() > 4) {
    throw new Error("INVALID_SALE_QUANTITY");
  }
  return parsed;
}

function nonNegativeAmount(value: string | null | undefined): Decimal {
  const parsed = new Decimal(value ?? "0");
  if (!parsed.isFinite() || parsed.isNegative() || parsed.decimalPlaces() > 4) {
    throw new Error("INVALID_SALE_AMOUNT");
  }
  return parsed;
}

function requestHash(input: CompleteSaleInput): string {
  return createHash("sha256").update(JSON.stringify({
    branchId: input.branchId,
    warehouseId: input.warehouseId,
    registerId: input.registerId,
    customerId: input.customerId ?? null,
    dueAt: input.dueAt?.toISOString() ?? null,
    items: input.items,
    payments: input.payments.map((payment) => ({
      ...payment,
      cheque: payment.cheque ? {
        ...payment.cheque,
        chequeDate: payment.cheque.chequeDate.toISOString(),
        dueDate: payment.cheque.dueDate.toISOString()
      } : null
    }))
  })).digest("hex");
}

function initialChequeStatus(dueDate: Date, now: Date): ChequeStatus {
  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (dueDay > nowDay) return ChequeStatus.POST_DATED;
  if (dueDay === nowDay) return ChequeStatus.DUE_TODAY;
  return ChequeStatus.RECEIVED;
}

function statusForSale(posted: Decimal, pendingCheque: Decimal, unsecuredCredit: Decimal): SaleStatus {
  if (unsecuredCredit.isZero() && pendingCheque.isZero()) return SaleStatus.PAID;
  if (posted.isPositive()) return SaleStatus.PARTIALLY_PAID;
  return SaleStatus.COMPLETED;
}

export async function completeSaleV2(input: CompleteSaleInput): Promise<CompleteSaleResult> {
  requirePermission(input.context, "sales.create");
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (input.items.length === 0 || input.items.length > 500) throw new Error("INVALID_SALE_ITEMS");
  if (input.payments.length > 20) throw new Error("TOO_MANY_PAYMENT_COMPONENTS");
  if (input.payments.some((payment) => payment.methodType === PaymentMethodType.CUSTOMER_CREDIT)) {
    throw new Error("CUSTOMER_CREDIT_COMPONENT_NOT_ALLOWED");
  }

  const database = getDatabase();
  const hash = requestHash(input);
  const existingRequest = await database.idempotencyRecord.findUnique({
    where: { businessId_key: { businessId: input.context.businessId, key: input.idempotencyKey } }
  });
  if (existingRequest) {
    if (existingRequest.requestHash !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    if (existingRequest.completedAt && existingRequest.responseBody) {
      return existingRequest.responseBody as CompleteSaleResult;
    }
    throw new Error("REQUEST_ALREADY_IN_PROGRESS");
  }
  await database.idempotencyRecord.create({
    data: {
      businessId: input.context.businessId,
      key: input.idempotencyKey,
      operation: "COMPLETE_GROCERY_SALE_V2",
      requestHash: hash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      const [branch, warehouse, register, shift, business, customer] = await Promise.all([
        transaction.branch.findFirst({
          where: { id: input.branchId, businessId: input.context.businessId, active: true }
        }),
        transaction.warehouse.findFirst({
          where: {
            id: input.warehouseId,
            businessId: input.context.businessId,
            branchId: input.branchId,
            active: true
          }
        }),
        transaction.register.findFirst({
          where: {
            id: input.registerId,
            businessId: input.context.businessId,
            branchId: input.branchId,
            active: true
          }
        }),
        transaction.cashierShift.findFirst({
          where: {
            businessId: input.context.businessId,
            registerId: input.registerId,
            cashierId: input.context.userId,
            status: { in: ["OPEN", "REOPENED"] }
          },
          orderBy: { openedAt: "desc" }
        }),
        transaction.business.findUnique({ where: { id: input.context.businessId } }),
        input.customerId ? transaction.customer.findFirst({
          where: { id: input.customerId, businessId: input.context.businessId, active: true }
        }) : Promise.resolve(null)
      ]);
      if (!branch || !warehouse || !register || !business || (input.customerId && !customer)) {
        throw new Error("RESOURCE_NOT_FOUND");
      }
      if (!shift) throw new Error("OPEN_CASHIER_SHIFT_REQUIRED");

      const productIds = [...new Set(input.items.map((item) => item.productId))];
      const products = await transaction.product.findMany({
        where: { id: { in: productIds }, businessId: input.context.businessId, active: true }
      });
      if (products.length !== productIds.length) throw new Error("RESOURCE_NOT_FOUND");
      const productById = new Map(products.map((product) => [product.id, product]));

      let subtotal = new Decimal(0);
      let discountTotal = new Decimal(0);
      let taxTotal = new Decimal(0);
      const lines = input.items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) throw new Error("RESOURCE_NOT_FOUND");
        const quantity = positiveQuantity(item.quantity);
        const requestedPrice = item.unitPrice == null ? null : nonNegativeAmount(item.unitPrice);
        if (requestedPrice && !requestedPrice.equals(product.retailPrice.toString())) {
          if (!product.allowPriceOverride) throw new Error("PRICE_OVERRIDE_NOT_ALLOWED");
          requirePermission(input.context, "sales.override_price");
        }
        const unitPrice = requestedPrice ?? new Decimal(product.retailPrice.toString());
        const discount = nonNegativeAmount(item.discountAmount);
        if (discount.isPositive()) {
          if (!product.allowDiscount) throw new Error("DISCOUNT_NOT_ALLOWED");
          requirePermission(input.context, "sales.discount");
        }
        const gross = unitPrice.times(quantity);
        if (discount.greaterThan(gross)) throw new Error("DISCOUNT_EXCEEDS_LINE_VALUE");
        const taxable = gross.minus(discount);
        const tax = taxable.times(product.taxRate.toString()).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        const lineTotal = taxable.plus(tax).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        subtotal = subtotal.plus(gross);
        discountTotal = discountTotal.plus(discount);
        taxTotal = taxTotal.plus(tax);
        return { item, product, quantity, unitPrice, discount, tax, lineTotal };
      });
      const grandTotal = subtotal.minus(discountTotal).plus(taxTotal).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

      const accountIds = [...new Set(input.payments.map((payment) => payment.accountId))];
      const accounts = accountIds.length ? await transaction.paymentAccount.findMany({
        where: {
          id: { in: accountIds },
          businessId: input.context.businessId,
          active: true,
          OR: [{ branchId: null }, { branchId: input.branchId }]
        }
      }) : [];
      if (accounts.length !== accountIds.length) throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
      const accountById = new Map(accounts.map((account) => [account.id, account]));

      let postedPaymentTotal = new Decimal(0);
      let pendingChequeTotal = new Decimal(0);
      for (const payment of input.payments) {
        const account = accountById.get(payment.accountId);
        if (!account || account.methodType !== payment.methodType) {
          throw new Error("PAYMENT_ACCOUNT_METHOD_MISMATCH");
        }
        const value = nonNegativeAmount(payment.amount);
        if (!value.isPositive()) throw new Error("INVALID_PAYMENT_AMOUNT");
        if (payment.methodType === PaymentMethodType.CHEQUE) {
          if (!payment.cheque) throw new Error("CHEQUE_DETAILS_REQUIRED");
          pendingChequeTotal = pendingChequeTotal.plus(value);
        } else {
          if (payment.cheque) throw new Error("CHEQUE_DETAILS_NOT_ALLOWED");
          postedPaymentTotal = postedPaymentTotal.plus(value);
        }
      }

      const allocatedTotal = postedPaymentTotal.plus(pendingChequeTotal);
      if (allocatedTotal.greaterThan(grandTotal)) throw new Error("PAYMENT_COMPONENTS_EXCEED_SALE_TOTAL");
      const unsecuredCreditTotal = grandTotal.minus(allocatedTotal).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      const balanceDue = grandTotal.minus(postedPaymentTotal).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

      if (balanceDue.isPositive() && !customer) {
        throw new Error("CUSTOMER_REQUIRED_FOR_PARTIAL_OR_CREDIT_SALE");
      }
      if (unsecuredCreditTotal.isPositive()) {
        if (!input.dueAt) throw new Error("DUE_DATE_REQUIRED");
        if (!customer?.creditEnabled || customer.creditHold) throw new Error("CUSTOMER_CREDIT_NOT_AVAILABLE");
        requirePermission(input.context, "customer_credit.manage");
      }
      if (customer && balanceDue.isPositive()) {
        const ledgerRows = await transaction.ledgerEntry.findMany({
          where: { businessId: input.context.businessId, customerId: customer.id },
          select: { direction: true, amount: true }
        });
        let currentReceivable = new Decimal(0);
        for (const row of ledgerRows) {
          currentReceivable = applyLedgerEntry(
            currentReceivable,
            "CUSTOMER",
            row.direction,
            new Decimal(row.amount.toString())
          );
        }
        if (currentReceivable.plus(balanceDue).greaterThan(customer.creditLimit.toString())) {
          throw new Error("CUSTOMER_CREDIT_LIMIT_EXCEEDED");
        }
      }

      const invoiceNumber = `INV-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const saleStatus = statusForSale(postedPaymentTotal, pendingChequeTotal, unsecuredCreditTotal);
      const sale = await transaction.sale.create({
        data: {
          businessId: input.context.businessId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          registerId: input.registerId,
          cashierId: input.context.userId,
          customerId: input.customerId,
          invoiceNumber,
          status: saleStatus,
          subtotal: subtotal.toFixed(4),
          discountTotal: discountTotal.toFixed(4),
          taxTotal: taxTotal.toFixed(4),
          grandTotal: grandTotal.toFixed(4),
          paidTotal: postedPaymentTotal.toFixed(4),
          balanceDue: balanceDue.toFixed(4),
          dueAt: input.dueAt,
          completedAt: new Date(),
          items: {
            create: lines.map(({ item, product, quantity, unitPrice, discount, tax, lineTotal }) => ({
              businessId: input.context.businessId,
              productId: product.id,
              batchId: item.batchId,
              quantity: quantity.toFixed(4),
              unitPrice: unitPrice.toFixed(4),
              unitCostSnapshot: product.costPrice.toFixed(4),
              discountAmount: discount.toFixed(4),
              taxAmount: tax.toFixed(4),
              lineTotal: lineTotal.toFixed(4)
            }))
          }
        }
      });

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (!line.product.trackInventory) continue;
        await postInventoryMovement(transaction, {
          businessId: input.context.businessId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          productId: line.product.id,
          batchId: line.item.batchId,
          type: InventoryMovementType.SALE,
          quantityDelta: line.quantity.negated().toFixed(4),
          unitCost: line.product.costPrice.toFixed(4),
          referenceType: "SALE",
          referenceId: sale.id,
          reason: `Completed grocery sale ${invoiceNumber}`,
          idempotencyKey: `${input.idempotencyKey}:inventory:${index}`
        });
      }

      for (let index = 0; index < input.payments.length; index += 1) {
        const payment = input.payments[index]!;
        const paymentAmount = nonNegativeAmount(payment.amount);
        const isCheque = payment.methodType === PaymentMethodType.CHEQUE;
        const paymentRecord = await transaction.paymentTransaction.create({
          data: {
            businessId: input.context.businessId,
            branchId: input.branchId,
            saleId: sale.id,
            accountId: payment.accountId,
            shiftId: shift.id,
            createdById: input.context.userId,
            methodType: payment.methodType,
            direction: PaymentDirection.RECEIPT,
            status: isCheque ? PaymentStatus.PENDING : PaymentStatus.POSTED,
            amount: paymentAmount.toFixed(4),
            currencyCode: business.currencyCode,
            reference: payment.reference,
            idempotencyKey: `${input.idempotencyKey}:payment:${index}`
          }
        });
        if (isCheque && payment.cheque) {
          const cheque = await transaction.cheque.create({
            data: {
              businessId: input.context.businessId,
              branchId: input.branchId,
              paymentAccountId: payment.accountId,
              paymentTransactionId: paymentRecord.id,
              customerId: input.customerId,
              createdById: input.context.userId,
              direction: ChequeDirection.INWARD,
              status: initialChequeStatus(payment.cheque.dueDate, new Date()),
              chequeNumber: payment.cheque.chequeNumber,
              bankName: payment.cheque.bankName,
              bankBranch: payment.cheque.bankBranch,
              maskedAccount: payment.cheque.maskedAccount,
              drawerOrIssuer: payment.cheque.drawerOrIssuer,
              amount: paymentAmount.toFixed(4),
              currencyCode: business.currencyCode,
              chequeDate: payment.cheque.chequeDate,
              receivedOrIssuedAt: new Date(),
              dueDate: payment.cheque.dueDate,
              allocations: {
                create: {
                  businessId: input.context.businessId,
                  referenceType: "SALE",
                  referenceId: sale.id,
                  amount: paymentAmount.toFixed(4)
                }
              }
            }
          });
          await transaction.chequeStatusHistory.create({
            data: {
              businessId: input.context.businessId,
              chequeId: cheque.id,
              fromStatus: null,
              toStatus: cheque.status,
              actorUserId: input.context.userId,
              reason: `Recorded with invoice ${invoiceNumber}`
            }
          });
        }
      }

      if (customer && balanceDue.isPositive()) {
        await transaction.ledgerEntry.create({
          data: {
            businessId: input.context.businessId,
            customerId: customer.id,
            direction: LedgerDirection.DEBIT,
            amount: balanceDue.toFixed(4),
            referenceType: "SALE",
            referenceId: sale.id,
            description: `Invoice ${invoiceNumber}`
          }
        });
      }

      await transaction.auditLog.create({
        data: {
          businessId: input.context.businessId,
          actorUserId: input.context.userId,
          action: AuditAction.POST,
          entityType: "SALE",
          entityId: sale.id,
          afterData: {
            invoiceNumber,
            status: saleStatus,
            grandTotal: grandTotal.toFixed(4),
            postedPaymentTotal: postedPaymentTotal.toFixed(4),
            pendingChequeTotal: pendingChequeTotal.toFixed(4),
            unsecuredCreditTotal: unsecuredCreditTotal.toFixed(4),
            balanceDue: balanceDue.toFixed(4),
            paymentComponents: input.payments.length
          }
        }
      });

      return {
        saleId: sale.id,
        invoiceNumber,
        status: saleStatus,
        grandTotal: grandTotal.toFixed(4),
        paidTotal: postedPaymentTotal.toFixed(4),
        pendingChequeTotal: pendingChequeTotal.toFixed(4),
        unsecuredCreditTotal: unsecuredCreditTotal.toFixed(4),
        balanceDue: balanceDue.toFixed(4)
      } satisfies CompleteSaleResult;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 30_000
    });

    await database.idempotencyRecord.update({
      where: { businessId_key: { businessId: input.context.businessId, key: input.idempotencyKey } },
      data: { statusCode: 201, responseBody: result, completedAt: new Date() }
    });
    return result;
  } catch (error) {
    await database.idempotencyRecord.deleteMany({
      where: { businessId: input.context.businessId, key: input.idempotencyKey, completedAt: null }
    });
    throw error;
  }
}
