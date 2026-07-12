import { prisma } from "../db/prisma.js";
import { plain, roundMoney } from "../utils/http.js";

function qatarDayBounds(date = new Date()): { start: Date; end: Date } {
  const local = new Date(date.getTime() + 3 * 3600000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, d) - 3 * 3600000),
    end: new Date(Date.UTC(y, m, d + 1) - 3 * 3600000),
  };
}

function startOfQatarMonth(date = new Date()): Date {
  const local = new Date(date.getTime() + 3 * 3600000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 3 * 3600000);
}

function validSalesWhere(businessId: string, from?: Date, to?: Date): any {
  return {
    businessId,
    documentType: "INVOICE",
    status: { notIn: ["DRAFT", "CANCELLED", "VOID"] },
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
}

export async function getDashboardSummary(businessId: string): Promise<any> {
  const now = new Date();
  const today = qatarDayBounds(now);
  const weekStart = new Date(today.start.getTime() - 6 * 86400000);
  const monthStart = startOfQatarMonth(now);

  const [todayAgg, weekAgg, monthAgg, lowStockProducts, products, receivableAgg, recentInvoices, weeklyDocs, categoryItems, salesmanAgg, salesmen] = await Promise.all([
    prisma.salesDocument.aggregate({ where: validSalesWhere(businessId, today.start, today.end), _sum: { total: true, tax: true }, _count: { _all: true } }),
    prisma.salesDocument.aggregate({ where: validSalesWhere(businessId, weekStart, today.end), _sum: { total: true }, _count: { _all: true } }),
    prisma.salesDocument.aggregate({ where: validSalesWhere(businessId, monthStart), _sum: { total: true }, _count: { _all: true } }),
    prisma.product.findMany({ where: { businessId, deleted: false, active: true }, select: { id: true, sku: true, name: true, currentStock: true, minStock: true } }),
    prisma.product.findMany({ where: { businessId, deleted: false, active: true }, select: { currentStock: true, costPrice: true } }),
    prisma.salesDocument.aggregate({ where: { ...validSalesWhere(businessId), balance: { gt: 0 } }, _sum: { balance: true } }),
    prisma.salesDocument.findMany({ where: validSalesWhere(businessId), include: { items: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.salesDocument.findMany({ where: validSalesWhere(businessId, weekStart, today.end), select: { total: true, createdAt: true } }),
    prisma.salesDocumentItem.findMany({ where: { businessId, salesDocument: validSalesWhere(businessId, today.start, today.end) }, select: { productId: true, name: true, total: true } }),
    prisma.salesDocument.groupBy({ by: ["salesmanId", "salesmanName"], where: { ...validSalesWhere(businessId, monthStart), salesmanId: { not: null } }, _sum: { total: true }, _count: { _all: true }, orderBy: { _sum: { total: "desc" } }, take: 10 }),
    prisma.salesman.findMany({ where: { businessId, active: true }, select: { id: true, name: true } }),
  ]);

  const lowStock = lowStockProducts.filter((p) => Number(p.currentStock) <= Number(p.minStock));
  const stockValue = products.reduce((sum, p) => sum + Number(p.currentStock) * Number(p.costPrice), 0);
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(weekStart.getTime() + i * 86400000 + 3 * 3600000);
    dailyMap.set(date.toISOString().slice(0, 10), 0);
  }
  weeklyDocs.forEach((doc) => {
    const key = new Date(doc.createdAt.getTime() + 3 * 3600000).toISOString().slice(0, 10);
    dailyMap.set(key, (dailyMap.get(key) || 0) + Number(doc.total));
  });

  const productIds = [...new Set(categoryItems.map((item) => item.productId).filter(Boolean))] as string[];
  const categoryProducts = productIds.length
    ? await prisma.product.findMany({ where: { businessId, id: { in: productIds } }, select: { id: true, category: true } })
    : [];
  const categoryByProduct = new Map(categoryProducts.map((p) => [p.id, p.category || "Uncategorized"]));
  const categoryMap = new Map<string, number>();
  categoryItems.forEach((item) => {
    const category = (item.productId && categoryByProduct.get(item.productId)) || "Uncategorized";
    categoryMap.set(category, (categoryMap.get(category) || 0) + Number(item.total));
  });

  const salesmanNameMap = new Map(salesmen.map((s) => [s.id, s.name]));
  return plain({
    today: {
      sales: roundMoney(Number(todayAgg._sum.total || 0)),
      tax: roundMoney(Number(todayAgg._sum.tax || 0)),
      invoices: todayAgg._count._all,
    },
    week: { sales: roundMoney(Number(weekAgg._sum.total || 0)), invoices: weekAgg._count._all },
    month: { sales: roundMoney(Number(monthAgg._sum.total || 0)), invoices: monthAgg._count._all },
    inventory: { stockValue: roundMoney(stockValue), lowStockCount: lowStock.length, lowStock: lowStock.slice(0, 20) },
    receivables: { outstanding: roundMoney(Number(receivableAgg._sum.balance || 0)) },
    recentInvoices,
    weeklySales: [...dailyMap.entries()].map(([date, total]) => ({ date, total: roundMoney(total) })),
    categorySales: [...categoryMap.entries()].map(([category, total]) => ({ category, total: roundMoney(total) })),
    leaderboard: salesmanAgg.map((row: any) => ({
      salesmanId: row.salesmanId,
      salesmanName: row.salesmanName || salesmanNameMap.get(row.salesmanId) || "Salesman",
      sales: roundMoney(Number(row._sum.total || 0)),
      invoiceCount: row._count._all,
    })),
  });
}
