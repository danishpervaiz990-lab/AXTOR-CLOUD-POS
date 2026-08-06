import Decimal from "decimal.js";
import { BatchStatus, Prisma } from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type InventoryReportFilters = {
  warehouseId?: string;
  categoryId?: string;
  search?: string;
  lowStockOnly?: boolean;
  expiringWithinDays?: number;
  page?: number;
  pageSize?: number;
};

function utcEndOfDayAfter(days: number): Date {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + days,
    23, 59, 59, 999
  ));
}

export async function getInventoryReport(
  context: TenantContext,
  filters: InventoryReportFilters
) {
  requirePermission(context, "inventory.view");
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 250);

  if (filters.warehouseId) {
    const exists = await getDatabase().warehouse.count({
      where: { id: filters.warehouseId, businessId: context.businessId, active: true }
    });
    if (!exists) throw new Error("RESOURCE_NOT_FOUND");
  }

  const productWhere: Prisma.ProductWhereInput = {
    businessId: context.businessId,
    active: true,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.search ? {
      OR: [
        { sku: { contains: filters.search, mode: "insensitive" } },
        { name: { contains: filters.search, mode: "insensitive" } },
        { plu: { equals: filters.search } },
        { barcodes: { some: { barcode: { contains: filters.search } } } }
      ]
    } : {})
  };

  const database = getDatabase();
  const products = await database.product.findMany({
    where: productWhere,
    include: {
      category: { select: { id: true, code: true, name: true } },
      baseUnit: { select: { code: true, name: true, symbol: true, decimalScale: true } },
      inventoryBalances: {
        where: filters.warehouseId ? { warehouseId: filters.warehouseId } : {},
        include: { warehouse: { select: { id: true, code: true, name: true, branchId: true } } }
      },
      batches: {
        where: {
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
          ...(filters.expiringWithinDays !== undefined ? {
            expiryDate: { lte: utcEndOfDayAfter(filters.expiringWithinDays) },
            status: { in: [BatchStatus.AVAILABLE, BatchStatus.QUARANTINED] }
          } : {})
        },
        select: {
          id: true,
          warehouseId: true,
          batchNumber: true,
          manufactureDate: true,
          expiryDate: true,
          remainingQuantity: true,
          unitCost: true,
          status: true
        },
        orderBy: [{ expiryDate: "asc" }, { batchNumber: "asc" }]
      }
    },
    orderBy: [{ name: "asc" }, { sku: "asc" }]
  });

  const allRows = products.map((product) => {
    const total = product.inventoryBalances.reduce(
      (sum, balance) => sum.plus(balance.quantity.toString()),
      new Decimal(0)
    );
    const reserved = product.inventoryBalances.reduce(
      (sum, balance) => sum.plus(balance.reserved.toString()),
      new Decimal(0)
    );
    const available = total.minus(reserved);
    const minimum = new Decimal(product.minimumStock.toString());
    return {
      id: product.id,
      sku: product.sku,
      plu: product.plu,
      name: product.name,
      type: product.type,
      category: product.category,
      baseUnit: product.baseUnit,
      trackBatches: product.trackBatches,
      trackExpiry: product.trackExpiry,
      minimumStock: minimum.toFixed(4),
      reorderQuantity: product.reorderQuantity.toFixed(4),
      quantity: total.toFixed(4),
      reserved: reserved.toFixed(4),
      available: available.toFixed(4),
      lowStock: available.lessThanOrEqualTo(minimum),
      locations: product.inventoryBalances.map((balance) => ({
        warehouse: balance.warehouse,
        batchId: balance.batchId,
        quantity: balance.quantity.toFixed(4),
        reserved: balance.reserved.toFixed(4),
        available: new Decimal(balance.quantity.toString()).minus(balance.reserved.toString()).toFixed(4)
      })),
      batches: product.batches.map((batch) => ({
        ...batch,
        manufactureDate: batch.manufactureDate?.toISOString() ?? null,
        expiryDate: batch.expiryDate?.toISOString() ?? null,
        remainingQuantity: batch.remainingQuantity.toFixed(4),
        unitCost: batch.unitCost.toFixed(4)
      }))
    };
  });

  const filteredRows = filters.lowStockOnly ? allRows.filter((row) => row.lowStock) : allRows;
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const totalQuantity = filteredRows.reduce((sum, row) => sum.plus(row.quantity), new Decimal(0));
  const totalAvailable = filteredRows.reduce((sum, row) => sum.plus(row.available), new Decimal(0));

  return {
    totals: {
      products: filteredRows.length,
      lowStockProducts: filteredRows.filter((row) => row.lowStock).length,
      expiringBatches: filteredRows.reduce((count, row) => count + row.batches.length, 0),
      quantity: totalQuantity.toFixed(4),
      available: totalAvailable.toFixed(4)
    },
    rows: pagedRows,
    pagination: {
      page,
      pageSize,
      total: filteredRows.length,
      pageCount: Math.ceil(filteredRows.length / pageSize)
    }
  };
}
