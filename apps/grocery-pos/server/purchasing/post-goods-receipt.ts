import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import {
  AuditAction,
  BatchStatus,
  InventoryMovementType,
  LedgerDirection,
  Prisma,
  PurchaseStatus
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { postInventoryMovement } from "@/server/inventory/post-inventory-movement";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type GoodsReceiptLineInput = {
  purchaseOrderItemId: string;
  quantity: string;
  batchNumber?: string | null;
  manufactureDate?: Date | null;
  expiryDate?: Date | null;
};

function positiveQuantity(value: string): Decimal {
  const result = new Decimal(value);
  if (!result.isFinite() || !result.isPositive() || result.decimalPlaces() > 4) {
    throw new Error("INVALID_RECEIPT_QUANTITY");
  }
  return result;
}

function hashRequest(input: {
  purchaseOrderId: string;
  lines: GoodsReceiptLineInput[];
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      purchaseOrderId: input.purchaseOrderId,
      lines: input.lines.map((line) => ({
        ...line,
        manufactureDate: line.manufactureDate?.toISOString() ?? null,
        expiryDate: line.expiryDate?.toISOString() ?? null
      }))
    }))
    .digest("hex");
}

export async function postGoodsReceipt(input: {
  context: TenantContext;
  idempotencyKey: string;
  purchaseOrderId: string;
  lines: GoodsReceiptLineInput[];
}) {
  requirePermission(input.context, "purchases.manage");
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (input.lines.length === 0 || input.lines.length > 500) throw new Error("INVALID_RECEIPT_LINES");

  const database = getDatabase();
  const requestHash = hashRequest(input);
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
      operation: "POST_GROCERY_GOODS_RECEIPT",
      requestHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findFirst({
        where: {
          id: input.purchaseOrderId,
          businessId: input.context.businessId,
          status: { in: [PurchaseStatus.APPROVED, PurchaseStatus.PARTIALLY_RECEIVED] }
        },
        include: { items: { include: { product: true } } }
      });
      if (!order) throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");

      const orderItemById = new Map(order.items.map((item) => [item.id, item]));
      if (new Set(input.lines.map((line) => line.purchaseOrderItemId)).size !== input.lines.length) {
        throw new Error("DUPLICATE_RECEIPT_LINE");
      }

      const calculatedLines = input.lines.map((line) => {
        const orderItem = orderItemById.get(line.purchaseOrderItemId);
        if (!orderItem) throw new Error("RESOURCE_NOT_FOUND");
        const receiptQuantity = positiveQuantity(line.quantity);
        const ordered = new Decimal(orderItem.orderedQuantity.toString());
        const alreadyReceived = new Decimal(orderItem.receivedQuantity.toString());
        if (alreadyReceived.plus(receiptQuantity).greaterThan(ordered)) {
          throw new Error("RECEIPT_EXCEEDS_ORDERED_QUANTITY");
        }
        if (orderItem.product.trackBatches && !line.batchNumber?.trim()) {
          throw new Error("BATCH_REQUIRED");
        }
        if (orderItem.product.trackExpiry && !line.expiryDate) {
          throw new Error("EXPIRY_DATE_REQUIRED");
        }
        if (line.expiryDate && line.manufactureDate && line.expiryDate <= line.manufactureDate) {
          throw new Error("INVALID_EXPIRY_DATE");
        }
        return { line, orderItem, receiptQuantity };
      });

      const receiptNumber = `GRN-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const receipt = await transaction.goodsReceipt.create({
        data: {
          businessId: input.context.businessId,
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          receivedById: input.context.userId,
          receiptNumber,
          receivedAt: new Date()
        }
      });

      let receiptValue = new Decimal(0);
      for (let index = 0; index < calculatedLines.length; index += 1) {
        const { line, orderItem, receiptQuantity } = calculatedLines[index]!;
        let batchId: string | null = null;
        if (orderItem.product.trackBatches && line.batchNumber) {
          const existingBatch = await transaction.productBatch.findFirst({
            where: {
              businessId: input.context.businessId,
              productId: orderItem.productId,
              warehouseId: order.warehouseId,
              batchNumber: line.batchNumber.trim()
            }
          });
          const batch = existingBatch ?? await transaction.productBatch.create({
            data: {
              businessId: input.context.businessId,
              productId: orderItem.productId,
              warehouseId: order.warehouseId,
              batchNumber: line.batchNumber.trim(),
              manufactureDate: line.manufactureDate,
              expiryDate: line.expiryDate,
              receivedQuantity: receiptQuantity.toFixed(4),
              remainingQuantity: receiptQuantity.toFixed(4),
              unitCost: orderItem.unitCost.toFixed(4),
              status: BatchStatus.AVAILABLE
            }
          });
          if (existingBatch) {
            if (
              (line.expiryDate && existingBatch.expiryDate?.getTime() !== line.expiryDate.getTime()) ||
              (line.manufactureDate && existingBatch.manufactureDate?.getTime() !== line.manufactureDate.getTime())
            ) {
              throw new Error("BATCH_DATE_MISMATCH");
            }
            await transaction.productBatch.update({
              where: { id: existingBatch.id },
              data: { receivedQuantity: { increment: receiptQuantity.toFixed(4) } }
            });
          }
          batchId = batch.id;
        }

        await transaction.goodsReceiptItem.create({
          data: {
            businessId: input.context.businessId,
            goodsReceiptId: receipt.id,
            productId: orderItem.productId,
            batchId,
            quantity: receiptQuantity.toFixed(4),
            unitCost: orderItem.unitCost.toFixed(4)
          }
        });

        const itemUpdate = await transaction.purchaseOrderItem.updateMany({
          where: {
            id: orderItem.id,
            businessId: input.context.businessId,
            receivedQuantity: orderItem.receivedQuantity
          },
          data: { receivedQuantity: { increment: receiptQuantity.toFixed(4) } }
        });
        if (itemUpdate.count !== 1) throw new Error("CONCURRENT_PURCHASE_RECEIPT");

        await postInventoryMovement(transaction, {
          businessId: input.context.businessId,
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          productId: orderItem.productId,
          batchId,
          type: InventoryMovementType.PURCHASE_RECEIPT,
          quantityDelta: receiptQuantity.toFixed(4),
          unitCost: orderItem.unitCost.toFixed(4),
          referenceType: "GOODS_RECEIPT",
          referenceId: receipt.id,
          reason: `Goods receipt ${receiptNumber}`,
          idempotencyKey: `${input.idempotencyKey}:inventory:${index}`
        });

        receiptValue = receiptValue.plus(receiptQuantity.times(orderItem.unitCost.toString()));
      }

      const refreshedItems = await transaction.purchaseOrderItem.findMany({
        where: { purchaseOrderId: order.id, businessId: input.context.businessId }
      });
      const fullyReceived = refreshedItems.every((item) =>
        new Decimal(item.receivedQuantity.toString()).greaterThanOrEqualTo(item.orderedQuantity.toString())
      );
      const nextStatus = fullyReceived ? PurchaseStatus.RECEIVED : PurchaseStatus.PARTIALLY_RECEIVED;
      await transaction.purchaseOrder.update({
        where: { id: order.id },
        data: { status: nextStatus }
      });
      await transaction.goodsReceipt.update({
        where: { id: receipt.id },
        data: { postedAt: new Date() }
      });

      await transaction.ledgerEntry.create({
        data: {
          businessId: input.context.businessId,
          supplierId: order.supplierId,
          direction: LedgerDirection.CREDIT,
          amount: receiptValue.toFixed(4),
          referenceType: "GOODS_RECEIPT",
          referenceId: receipt.id,
          description: `Goods receipt ${receiptNumber}`
        }
      });
      await transaction.auditLog.create({
        data: {
          businessId: input.context.businessId,
          actorUserId: input.context.userId,
          action: AuditAction.POST,
          entityType: "GOODS_RECEIPT",
          entityId: receipt.id,
          afterData: {
            receiptNumber,
            purchaseOrderId: order.id,
            status: nextStatus,
            lineCount: calculatedLines.length,
            receiptValue: receiptValue.toFixed(4)
          }
        }
      });

      return {
        id: receipt.id,
        receiptNumber,
        purchaseOrderId: order.id,
        purchaseOrderStatus: nextStatus,
        lineCount: calculatedLines.length,
        receiptValue: receiptValue.toFixed(4),
        postedAt: new Date().toISOString()
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
