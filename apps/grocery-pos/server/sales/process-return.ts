import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import {
  AuditAction,
  InventoryMovementType,
  LedgerDirection,
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
  SaleStatus
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { postInventoryMovement } from "@/server/inventory/post-inventory-movement";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type ReturnLineInput = {
  saleItemId: string;
  quantity: string;
  reason: string;
};

export type RefundInput = {
  accountId: string;
  methodType: PaymentMethodType;
  amount: string;
  reference?: string | null;
};

function positive(value: string, code: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || !parsed.isPositive() || parsed.decimalPlaces() > 4) throw new Error(code);
  return parsed;
}

function nonNegative(value: string, code: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.isNegative() || parsed.decimalPlaces() > 4) throw new Error(code);
  return parsed;
}

export async function processSaleReturn(input: {
  context: TenantContext;
  idempotencyKey: string;
  saleId: string;
  lines: ReturnLineInput[];
  refund?: RefundInput | null;
}) {
  requirePermission(input.context, "refunds.create");
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (input.lines.length === 0 || input.lines.length > 500) throw new Error("INVALID_RETURN_LINES");
  if (new Set(input.lines.map((line) => line.saleItemId)).size !== input.lines.length) {
    throw new Error("DUPLICATE_RETURN_LINE");
  }
  if (
    input.refund?.methodType === PaymentMethodType.CHEQUE ||
    input.refund?.methodType === PaymentMethodType.CUSTOMER_CREDIT
  ) {
    throw new Error("DEDICATED_REFUND_WORKFLOW_REQUIRED");
  }

  const requestHash = createHash("sha256").update(JSON.stringify({
    saleId: input.saleId,
    lines: input.lines,
    refund: input.refund ?? null
  })).digest("hex");
  const database = getDatabase();
  const existing = await database.idempotencyRecord.findUnique({
    where: { businessId_key: { businessId: input.context.businessId, key: input.idempotencyKey } }
  });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    if (existing.completedAt && existing.responseBody) return existing.responseBody;
    throw new Error("REQUEST_ALREADY_IN_PROGRESS");
  }
  await database.idempotencyRecord.create({
    data: {
      businessId: input.context.businessId,
      key: input.idempotencyKey,
      operation: "PROCESS_GROCERY_SALE_RETURN",
      requestHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      const sale = await transaction.sale.findFirst({
        where: {
          id: input.saleId,
          businessId: input.context.businessId,
          status: { notIn: [SaleStatus.DRAFT, SaleStatus.HELD, SaleStatus.CANCELLED, SaleStatus.FULLY_RETURNED] }
        },
        include: {
          business: { select: { currencyCode: true } },
          items: { include: { product: true } }
        }
      });
      if (!sale) throw new Error("SALE_NOT_RETURNABLE");

      const saleItemById = new Map(sale.items.map((item) => [item.id, item]));
      const priorMovements = await transaction.inventoryMovement.findMany({
        where: {
          businessId: input.context.businessId,
          type: InventoryMovementType.SALE_RETURN,
          referenceType: "SALE_RETURN_ITEM",
          referenceId: { in: sale.items.map((item) => item.id) }
        },
        select: { referenceId: true, quantity: true }
      });
      const priorQuantityByItem = new Map<string, Decimal>();
      for (const movement of priorMovements) {
        priorQuantityByItem.set(
          movement.referenceId,
          (priorQuantityByItem.get(movement.referenceId) ?? new Decimal(0)).plus(movement.quantity.toString())
        );
      }

      let returnValue = new Decimal(0);
      const calculated = input.lines.map((line) => {
        const item = saleItemById.get(line.saleItemId);
        if (!item) throw new Error("RESOURCE_NOT_FOUND");
        const returnQuantity = positive(line.quantity, "INVALID_RETURN_QUANTITY");
        const soldQuantity = new Decimal(item.quantity.toString());
        const priorQuantity = priorQuantityByItem.get(item.id) ?? new Decimal(0);
        if (priorQuantity.plus(returnQuantity).greaterThan(soldQuantity)) {
          throw new Error("RETURN_EXCEEDS_AVAILABLE_QUANTITY");
        }
        if (line.reason.trim().length < 3) throw new Error("RETURN_REASON_REQUIRED");
        const unitNet = new Decimal(item.lineTotal.toString()).dividedBy(soldQuantity);
        const lineValue = unitNet.times(returnQuantity).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        returnValue = returnValue.plus(lineValue);
        return { line, item, returnQuantity, priorQuantity, lineValue };
      });

      const refundAmount = input.refund ? nonNegative(input.refund.amount, "INVALID_REFUND_AMOUNT") : new Decimal(0);
      if (refundAmount.greaterThan(returnValue)) throw new Error("REFUND_EXCEEDS_RETURN_VALUE");
      if (refundAmount.greaterThan(sale.paidTotal.toString())) throw new Error("REFUND_EXCEEDS_NET_PAID");
      if (!sale.customerId && refundAmount.lessThan(returnValue) && new Decimal(sale.paidTotal.toString()).isPositive()) {
        throw new Error("WALK_IN_RETURN_REQUIRES_REFUND");
      }

      let refundTransactionId: string | null = null;
      if (input.refund && refundAmount.isPositive()) {
        const account = await transaction.paymentAccount.findFirst({
          where: {
            id: input.refund.accountId,
            businessId: input.context.businessId,
            active: true,
            methodType: input.refund.methodType,
            OR: [{ branchId: null }, { branchId: sale.branchId }]
          }
        });
        if (!account) throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
        const payment = await transaction.paymentTransaction.create({
          data: {
            businessId: input.context.businessId,
            branchId: sale.branchId,
            saleId: sale.id,
            accountId: account.id,
            createdById: input.context.userId,
            methodType: input.refund.methodType,
            direction: PaymentDirection.PAYMENT,
            status: PaymentStatus.POSTED,
            amount: refundAmount.toFixed(4),
            currencyCode: sale.business.currencyCode,
            reference: input.refund.reference ?? `Refund ${sale.invoiceNumber}`,
            idempotencyKey: `${input.idempotencyKey}:refund`
          }
        });
        refundTransactionId = payment.id;
      }

      for (let index = 0; index < calculated.length; index += 1) {
        const row = calculated[index]!;
        if (row.item.product.trackInventory) {
          await postInventoryMovement(transaction, {
            businessId: input.context.businessId,
            branchId: sale.branchId,
            warehouseId: sale.warehouseId,
            productId: row.item.productId,
            batchId: row.item.batchId,
            type: InventoryMovementType.SALE_RETURN,
            quantityDelta: row.returnQuantity.toFixed(4),
            unitCost: row.item.unitCostSnapshot.toFixed(4),
            referenceType: "SALE_RETURN_ITEM",
            referenceId: row.item.id,
            reason: row.line.reason.trim(),
            idempotencyKey: `${input.idempotencyKey}:return:${index}`
          });
        }
      }

      let cumulativeReturnValue = new Decimal(0);
      let fullyReturned = true;
      for (const item of sale.items) {
        const soldQuantity = new Decimal(item.quantity.toString());
        const priorQuantity = priorQuantityByItem.get(item.id) ?? new Decimal(0);
        const current = calculated.find((row) => row.item.id === item.id)?.returnQuantity ?? new Decimal(0);
        const totalReturnedQuantity = priorQuantity.plus(current);
        if (totalReturnedQuantity.lessThan(soldQuantity)) fullyReturned = false;
        cumulativeReturnValue = cumulativeReturnValue.plus(
          new Decimal(item.lineTotal.toString()).dividedBy(soldQuantity).times(totalReturnedQuantity)
        );
      }
      cumulativeReturnValue = cumulativeReturnValue.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      const remainingSaleValue = Decimal.max(
        new Decimal(sale.grandTotal.toString()).minus(cumulativeReturnValue),
        new Decimal(0)
      );
      const newPaidTotal = Decimal.max(new Decimal(sale.paidTotal.toString()).minus(refundAmount), new Decimal(0));
      const newBalanceDue = Decimal.max(remainingSaleValue.minus(newPaidTotal), new Decimal(0));
      const nextStatus = fullyReturned ? SaleStatus.FULLY_RETURNED : SaleStatus.PARTIALLY_RETURNED;

      const saleUpdate = await transaction.sale.updateMany({
        where: {
          id: sale.id,
          businessId: input.context.businessId,
          version: sale.version
        },
        data: {
          status: nextStatus,
          paidTotal: newPaidTotal.toFixed(4),
          balanceDue: newBalanceDue.toFixed(4),
          version: { increment: 1 }
        }
      });
      if (saleUpdate.count !== 1) throw new Error("CONCURRENT_SALE_MODIFICATION");

      let creditLedgerEntryId: string | null = null;
      let refundLedgerEntryId: string | null = null;
      if (sale.customerId) {
        const creditEntry = await transaction.ledgerEntry.create({
          data: {
            businessId: input.context.businessId,
            customerId: sale.customerId,
            direction: LedgerDirection.CREDIT,
            amount: returnValue.toFixed(4),
            referenceType: "SALES_RETURN",
            referenceId: input.idempotencyKey,
            description: `Return against ${sale.invoiceNumber}`
          }
        });
        creditLedgerEntryId = creditEntry.id;
        if (refundAmount.isPositive()) {
          const refundEntry = await transaction.ledgerEntry.create({
            data: {
              businessId: input.context.businessId,
              customerId: sale.customerId,
              direction: LedgerDirection.DEBIT,
              amount: refundAmount.toFixed(4),
              referenceType: "CUSTOMER_REFUND",
              referenceId: refundTransactionId ?? input.idempotencyKey,
              description: `Refund against ${sale.invoiceNumber}`
            }
          });
          refundLedgerEntryId = refundEntry.id;
        }
      }

      await transaction.auditLog.create({
        data: {
          businessId: input.context.businessId,
          actorUserId: input.context.userId,
          action: AuditAction.RETURN,
          entityType: "SALES_RETURN",
          entityId: input.idempotencyKey,
          beforeData: {
            saleId: sale.id,
            status: sale.status,
            paidTotal: sale.paidTotal.toFixed(4),
            balanceDue: sale.balanceDue.toFixed(4),
            version: sale.version
          },
          afterData: {
            saleId: sale.id,
            status: nextStatus,
            returnValue: returnValue.toFixed(4),
            cumulativeReturnValue: cumulativeReturnValue.toFixed(4),
            refundAmount: refundAmount.toFixed(4),
            paidTotal: newPaidTotal.toFixed(4),
            balanceDue: newBalanceDue.toFixed(4),
            refundTransactionId,
            creditLedgerEntryId,
            refundLedgerEntryId,
            lines: calculated.map((row) => ({
              saleItemId: row.item.id,
              productId: row.item.productId,
              batchId: row.item.batchId,
              quantity: row.returnQuantity.toFixed(4),
              value: row.lineValue.toFixed(4),
              reason: row.line.reason.trim()
            }))
          }
        }
      });

      return {
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        status: nextStatus,
        returnReference: input.idempotencyKey,
        returnValue: returnValue.toFixed(4),
        refundAmount: refundAmount.toFixed(4),
        refundTransactionId,
        paidTotal: newPaidTotal.toFixed(4),
        balanceDue: newBalanceDue.toFixed(4)
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 });

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
