import Decimal from "decimal.js";
import {
  ChequeStatus,
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  SaleStatus
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

function startOfBusinessDay(now: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

export async function getGroceryDashboard(context: TenantContext, branchId?: string) {
  requirePermission(context, "dashboard.view");
  const database = getDatabase();
  const business = await database.business.findUnique({
    where: { id: context.businessId },
    select: { name: true, currencyCode: true, timezone: true, active: true }
  });
  if (!business?.active) throw new Error("WORKSPACE_DISABLED");

  if (branchId) {
    const branch = await database.branch.findFirst({
      where: { id: branchId, businessId: context.businessId, active: true }
    });
    if (!branch) throw new Error("RESOURCE_NOT_FOUND");
  }

  const now = new Date();
  const todayStart = startOfBusinessDay(now, business.timezone);
  const expiryWindow = new Date(now.getTime() + 30 * 86_400_000);
  const branchWhere = branchId ? { branchId } : {};

  const [sales, payments, inventory, expiringBatches, cheques, openShifts] = await database.$transaction([
    database.sale.findMany({
      where: {
        businessId: context.businessId,
        ...branchWhere,
        createdAt: { gte: todayStart },
        status: { notIn: [SaleStatus.DRAFT, SaleStatus.HELD, SaleStatus.CANCELLED] }
      },
      select: { grandTotal: true, paidTotal: true, balanceDue: true }
    }),
    database.paymentTransaction.findMany({
      where: {
        businessId: context.businessId,
        ...branchWhere,
        postedAt: { gte: todayStart },
        status: PaymentStatus.POSTED,
        direction: PaymentDirection.RECEIPT
      },
      select: { methodType: true, amount: true }
    }),
    database.inventoryBalance.findMany({
      where: {
        businessId: context.businessId,
        ...(branchId ? { warehouse: { branchId } } : {})
      },
      include: {
        product: { select: { minimumStock: true, active: true } }
      }
    }),
    database.productBatch.findMany({
      where: {
        businessId: context.businessId,
        ...(branchId ? { warehouse: { branchId } } : {}),
        expiryDate: { lte: expiryWindow },
        status: { in: ["AVAILABLE", "QUARANTINED"] },
        remainingQuantity: { gt: 0 }
      },
      select: { id: true, expiryDate: true, remainingQuantity: true }
    }),
    database.cheque.findMany({
      where: {
        businessId: context.businessId,
        ...branchWhere,
        status: { notIn: [ChequeStatus.CLEARED, ChequeStatus.CANCELLED, ChequeStatus.REPLACED, ChequeStatus.RETURNED] },
        dueDate: { lte: expiryWindow }
      },
      select: { direction: true, amount: true, dueDate: true, status: true }
    }),
    database.cashierShift.findMany({
      where: {
        businessId: context.businessId,
        ...branchWhere,
        status: { in: ["OPEN", "REOPENED"] }
      },
      select: { id: true, registerId: true, cashierId: true, openedAt: true }
    })
  ]);

  const salesTotal = sales.reduce((total, sale) => total.plus(sale.grandTotal.toString()), new Decimal(0));
  const paidTotal = sales.reduce((total, sale) => total.plus(sale.paidTotal.toString()), new Decimal(0));
  const outstandingTotal = sales.reduce((total, sale) => total.plus(sale.balanceDue.toString()), new Decimal(0));

  const paymentMethods = new Map<PaymentMethodType, Decimal>();
  for (const payment of payments) {
    paymentMethods.set(
      payment.methodType,
      (paymentMethods.get(payment.methodType) ?? new Decimal(0)).plus(payment.amount.toString())
    );
  }

  const lowStockProductIds = new Set<string>();
  let stockQuantity = new Decimal(0);
  for (const balance of inventory) {
    if (!balance.product.active) continue;
    const available = new Decimal(balance.quantity.toString()).minus(balance.reserved.toString());
    stockQuantity = stockQuantity.plus(available);
    if (available.lessThanOrEqualTo(balance.product.minimumStock.toString())) {
      lowStockProductIds.add(balance.productId);
    }
  }

  let inwardDue = new Decimal(0);
  let outwardDue = new Decimal(0);
  let overdueCheques = 0;
  for (const cheque of cheques) {
    if (cheque.direction === "INWARD") inwardDue = inwardDue.plus(cheque.amount.toString());
    if (cheque.direction === "OUTWARD") outwardDue = outwardDue.plus(cheque.amount.toString());
    if (cheque.dueDate < now) overdueCheques += 1;
  }

  return {
    generatedAt: now.toISOString(),
    business: {
      name: business.name,
      currencyCode: business.currencyCode,
      timezone: business.timezone
    },
    salesToday: {
      count: sales.length,
      gross: salesTotal.toFixed(4),
      postedPaid: paidTotal.toFixed(4),
      outstanding: outstandingTotal.toFixed(4)
    },
    receiptsToday: {
      total: [...paymentMethods.values()].reduce((total, value) => total.plus(value), new Decimal(0)).toFixed(4),
      byMethod: Object.fromEntries(
        [...paymentMethods.entries()].map(([method, value]) => [method, value.toFixed(4)])
      )
    },
    inventory: {
      availableQuantity: stockQuantity.toFixed(4),
      lowStockProducts: lowStockProductIds.size,
      expiringBatchesWithin30Days: expiringBatches.length
    },
    cheques: {
      dueWithin30Days: cheques.length,
      overdueCount: overdueCheques,
      inwardAmount: inwardDue.toFixed(4),
      outwardAmount: outwardDue.toFixed(4)
    },
    operations: {
      openShifts: openShifts.length
    }
  };
}
