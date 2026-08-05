import Decimal from "decimal.js";
import { InventoryMovementType, Prisma } from "@prisma/client";

export type InventoryMovementInput = {
  businessId: string;
  branchId: string;
  warehouseId: string;
  productId: string;
  batchId?: string | null;
  type: InventoryMovementType;
  quantityDelta: string;
  unitCost?: string | null;
  referenceType: string;
  referenceId: string;
  reason?: string | null;
  idempotencyKey: string;
};

export type InventoryMovementResult = {
  movementId: string;
  quantityBefore: string;
  quantityAfter: string;
};

function decimalQuantity(value: string): Decimal {
  const quantity = new Decimal(value);
  if (!quantity.isFinite() || quantity.decimalPlaces() > 4) {
    throw new Error("INVALID_INVENTORY_QUANTITY");
  }
  return quantity;
}

export async function postInventoryMovement(
  transaction: Prisma.TransactionClient,
  input: InventoryMovementInput
): Promise<InventoryMovementResult> {
  const duplicate = await transaction.inventoryMovement.findFirst({
    where: {
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey
    }
  });

  if (duplicate) {
    return {
      movementId: duplicate.id,
      quantityBefore: duplicate.quantityBefore.toFixed(4),
      quantityAfter: duplicate.quantityAfter.toFixed(4)
    };
  }

  const [warehouse, product, batch] = await Promise.all([
    transaction.warehouse.findFirst({
      where: {
        id: input.warehouseId,
        businessId: input.businessId,
        branchId: input.branchId,
        active: true
      }
    }),
    transaction.product.findFirst({
      where: {
        id: input.productId,
        businessId: input.businessId,
        active: true
      }
    }),
    input.batchId
      ? transaction.productBatch.findFirst({
          where: {
            id: input.batchId,
            businessId: input.businessId,
            productId: input.productId,
            warehouseId: input.warehouseId
          }
        })
      : Promise.resolve(null)
  ]);

  if (!warehouse || !product || (input.batchId && !batch)) {
    throw new Error("RESOURCE_NOT_FOUND");
  }

  if (product.trackBatches && !input.batchId) {
    throw new Error("BATCH_REQUIRED");
  }

  const scopeKey = input.batchId ?? "NO_BATCH";
  const quantityDelta = decimalQuantity(input.quantityDelta);
  if (quantityDelta.isZero()) {
    throw new Error("ZERO_INVENTORY_MOVEMENT");
  }

  let balance = await transaction.inventoryBalance.findUnique({
    where: {
      businessId_warehouseId_productId_scopeKey: {
        businessId: input.businessId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        scopeKey
      }
    }
  });

  if (!balance) {
    if (quantityDelta.isNegative()) {
      throw new Error("INSUFFICIENT_STOCK");
    }
    balance = await transaction.inventoryBalance.create({
      data: {
        businessId: input.businessId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        batchId: input.batchId,
        scopeKey,
        quantity: quantityDelta.toFixed(4),
        reserved: "0.0000"
      }
    });

    const movement = await transaction.inventoryMovement.create({
      data: {
        businessId: input.businessId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        batchId: input.batchId,
        type: input.type,
        quantity: quantityDelta.toFixed(4),
        quantityBefore: "0.0000",
        quantityAfter: quantityDelta.toFixed(4),
        unitCost: input.unitCost,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey
      }
    });

    return {
      movementId: movement.id,
      quantityBefore: "0.0000",
      quantityAfter: quantityDelta.toFixed(4)
    };
  }

  const quantityBefore = new Decimal(balance.quantity.toString());
  const quantityAfter = quantityBefore.plus(quantityDelta);
  if (quantityAfter.isNegative() && !product.allowNegativeStock) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  const update = await transaction.inventoryBalance.updateMany({
    where: {
      id: balance.id,
      businessId: input.businessId,
      version: balance.version
    },
    data: {
      quantity: quantityAfter.toFixed(4),
      version: { increment: 1 }
    }
  });

  if (update.count !== 1) {
    throw new Error("CONCURRENT_INVENTORY_MODIFICATION");
  }

  if (batch) {
    const batchAfter = new Decimal(batch.remainingQuantity.toString()).plus(quantityDelta);
    if (batchAfter.isNegative()) {
      throw new Error("INSUFFICIENT_BATCH_STOCK");
    }
    await transaction.productBatch.updateMany({
      where: {
        id: batch.id,
        businessId: input.businessId,
        remainingQuantity: batch.remainingQuantity
      },
      data: {
        remainingQuantity: batchAfter.toFixed(4)
      }
    });
  }

  const movement = await transaction.inventoryMovement.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      batchId: input.batchId,
      type: input.type,
      quantity: quantityDelta.toFixed(4),
      quantityBefore: quantityBefore.toFixed(4),
      quantityAfter: quantityAfter.toFixed(4),
      unitCost: input.unitCost,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey
    }
  });

  return {
    movementId: movement.id,
    quantityBefore: quantityBefore.toFixed(4),
    quantityAfter: quantityAfter.toFixed(4)
  };
}
