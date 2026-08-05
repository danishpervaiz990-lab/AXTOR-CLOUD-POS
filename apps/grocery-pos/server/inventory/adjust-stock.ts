import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { AuditAction, InventoryMovementType, Prisma } from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { postInventoryMovement } from "@/server/inventory/post-inventory-movement";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export async function adjustStock(input: {
  context: TenantContext;
  idempotencyKey: string;
  branchId: string;
  warehouseId: string;
  productId: string;
  batchId?: string | null;
  quantityDelta: string;
  reason: string;
}) {
  requirePermission(input.context, "inventory.adjust");
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const delta = new Decimal(input.quantityDelta);
  if (!delta.isFinite() || delta.isZero() || delta.decimalPlaces() > 4) {
    throw new Error("INVALID_INVENTORY_QUANTITY");
  }
  if (input.reason.trim().length < 3) throw new Error("ADJUSTMENT_REASON_REQUIRED");

  const requestHash = createHash("sha256").update(JSON.stringify({
    branchId: input.branchId,
    warehouseId: input.warehouseId,
    productId: input.productId,
    batchId: input.batchId ?? null,
    quantityDelta: delta.toFixed(4),
    reason: input.reason.trim()
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
      operation: "ADJUST_GROCERY_STOCK",
      requestHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      const movement = await postInventoryMovement(transaction, {
        businessId: input.context.businessId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        batchId: input.batchId,
        type: delta.isPositive() ? InventoryMovementType.ADJUSTMENT_GAIN : InventoryMovementType.ADJUSTMENT_LOSS,
        quantityDelta: delta.toFixed(4),
        referenceType: "STOCK_ADJUSTMENT",
        referenceId: input.idempotencyKey,
        reason: input.reason.trim(),
        idempotencyKey: `${input.idempotencyKey}:movement`
      });
      await transaction.auditLog.create({
        data: {
          businessId: input.context.businessId,
          actorUserId: input.context.userId,
          action: AuditAction.POST,
          entityType: "STOCK_ADJUSTMENT",
          entityId: movement.movementId,
          afterData: {
            productId: input.productId,
            batchId: input.batchId ?? null,
            warehouseId: input.warehouseId,
            quantityDelta: delta.toFixed(4),
            quantityBefore: movement.quantityBefore,
            quantityAfter: movement.quantityAfter,
            reason: input.reason.trim()
          }
        }
      });
      return {
        id: movement.movementId,
        productId: input.productId,
        batchId: input.batchId ?? null,
        quantityDelta: delta.toFixed(4),
        quantityBefore: movement.quantityBefore,
        quantityAfter: movement.quantityAfter
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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
