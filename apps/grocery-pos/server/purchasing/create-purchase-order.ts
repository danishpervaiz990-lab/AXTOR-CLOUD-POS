import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { AuditAction, Prisma, PurchaseStatus } from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type PurchaseOrderLineInput = {
  productId: string;
  quantity: string;
  unitCost: string;
};

function positiveDecimal(value: string, code: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || !parsed.isPositive() || parsed.decimalPlaces() > 4) {
    throw new Error(code);
  }
  return parsed;
}

export async function createPurchaseOrder(input: {
  context: TenantContext;
  branchId: string;
  warehouseId: string;
  supplierId: string;
  expectedAt?: Date | null;
  lines: PurchaseOrderLineInput[];
}) {
  requirePermission(input.context, "purchases.manage");
  if (input.lines.length === 0 || input.lines.length > 500) {
    throw new Error("INVALID_PURCHASE_ORDER_LINES");
  }

  const database = getDatabase();
  return database.$transaction(async (transaction) => {
    const [branch, warehouse, supplier] = await Promise.all([
      transaction.branch.findFirst({
        where: { id: input.branchId, businessId: input.context.businessId, active: true }
      }),
      transaction.warehouse.findFirst({
        where: {
          id: input.warehouseId,
          branchId: input.branchId,
          businessId: input.context.businessId,
          active: true
        }
      }),
      transaction.supplier.findFirst({
        where: { id: input.supplierId, businessId: input.context.businessId, active: true }
      })
    ]);
    if (!branch || !warehouse || !supplier) throw new Error("RESOURCE_NOT_FOUND");

    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const productCount = await transaction.product.count({
      where: { id: { in: productIds }, businessId: input.context.businessId, active: true }
    });
    if (productCount !== productIds.length) throw new Error("RESOURCE_NOT_FOUND");

    let subtotal = new Decimal(0);
    const lines = input.lines.map((line) => {
      const orderedQuantity = positiveDecimal(line.quantity, "INVALID_PURCHASE_QUANTITY");
      const unitCost = positiveDecimal(line.unitCost, "INVALID_PURCHASE_COST");
      const lineTotal = orderedQuantity.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      subtotal = subtotal.plus(lineTotal);
      return { ...line, orderedQuantity, unitCost, lineTotal };
    });

    const orderNumber = `PO-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const order = await transaction.purchaseOrder.create({
      data: {
        businessId: input.context.businessId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        supplierId: input.supplierId,
        createdById: input.context.userId,
        orderNumber,
        status: PurchaseStatus.DRAFT,
        expectedAt: input.expectedAt,
        subtotal: subtotal.toFixed(4),
        discountTotal: "0.0000",
        taxTotal: "0.0000",
        grandTotal: subtotal.toFixed(4),
        items: {
          create: lines.map((line) => ({
            businessId: input.context.businessId,
            productId: line.productId,
            orderedQuantity: line.orderedQuantity.toFixed(4),
            receivedQuantity: "0.0000",
            unitCost: line.unitCost.toFixed(4),
            lineTotal: line.lineTotal.toFixed(4)
          }))
        }
      },
      include: { items: true }
    });

    await transaction.auditLog.create({
      data: {
        businessId: input.context.businessId,
        actorUserId: input.context.userId,
        action: AuditAction.CREATE,
        entityType: "PURCHASE_ORDER",
        entityId: order.id,
        afterData: {
          orderNumber,
          supplierId: input.supplierId,
          warehouseId: input.warehouseId,
          status: order.status,
          itemCount: order.items.length,
          grandTotal: order.grandTotal.toFixed(4)
        }
      }
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotal: order.subtotal.toFixed(4),
      grandTotal: order.grandTotal.toFixed(4),
      itemCount: order.items.length,
      createdAt: order.createdAt.toISOString()
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
