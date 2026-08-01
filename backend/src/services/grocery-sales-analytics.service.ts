import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, roundMoney } from "../utils/http.js";

const REPORT_IDS = new Set([
  "grocery-sales-category",
  "grocery-sales-brand",
  "grocery-payment-method",
  "grocery-cashier-sales",
  "grocery-terminal-sales",
]);

const INVALID_STATUSES = ["DRAFT", "CANCELLED", "VOID"] as const;

function money(value: unknown) {
  return roundMoney(Number(value || 0));
}

function percentage(value: unknown, total: unknown) {
  const denominator = Number(total || 0);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.0000001) return 0;
  return roundMoney((Number(value || 0) / denominator) * 100);
}

function range(query: any) {
  const valid = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(cleanString(value));
  const fromText: string = valid(query?.from)
    ? cleanString(query.from)
    : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toText: string = valid(query?.to)
    ? cleanString(query.to)
    : new Date().toISOString().slice(0, 10);
  return {
    from: new Date(`${fromText}T00:00:00.000+03:00`),
    to: new Date(`${toText}T23:59:59.999+03:00`),
  };
}

async function requireGrocery(businessId: string) {
  const selection = await prisma.businessIndustry.findUnique({
    where: { businessId },
    include: { industry: { select: { code: true } } },
  });
  if (String(selection?.industry?.code || "").toLowerCase() !== "grocery") {
    throw new ApiError(403, "Grocery report access requires a Grocery tenant");
  }
}

function result(title: string, columns: any[], rows: any[], summary: any[]) {
  return { title, columns, rows, summary };
}

export function isGrocerySalesAnalyticsReport(reportId: string) {
  return REPORT_IDS.has(reportId);
}

export async function runGrocerySalesAnalyticsReport(businessId: string, reportId: string, query: any = {}) {
  if (!isGrocerySalesAnalyticsReport(reportId)) return null;
  await requireGrocery(businessId);
  const { from, to } = range(query);
  const documents = await prisma.salesDocument.findMany({
    where: {
      businessId,
      documentType: "INVOICE",
      createdAt: { gte: from, lte: to },
      status: { notIn: [...INVALID_STATUSES] },
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  if (reportId === "grocery-sales-category" || reportId === "grocery-sales-brand") {
    const productIds = [...new Set(documents.flatMap(doc => doc.items.map(item => item.productId).filter(Boolean)))] as string[];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { businessId, id: { in: productIds } },
          select: { id: true, category: true, brand: true, costPrice: true },
        })
      : [];
    const productMap = new Map(products.map(product => [product.id, product]));
    const keyName = reportId === "grocery-sales-category" ? "category" : "brand";
    const grouped = new Map<string, { name: string; qty: number; sales: number; cost: number }>();
    for (const doc of documents) {
      for (const item of doc.items) {
        const product = item.productId ? productMap.get(item.productId) : null;
        const name = cleanString(product?.[keyName]) || `Unassigned ${keyName}`;
        const row = grouped.get(name) || { name, qty: 0, sales: 0, cost: 0 };
        row.qty += Number(item.qty || 0);
        row.sales += Number(item.total || 0);
        row.cost += Number(product?.costPrice || 0) * Number(item.qty || 0);
        grouped.set(name, row);
      }
    }
    const totalSales = [...grouped.values()].reduce((sum, row) => sum + row.sales, 0);
    const rows = [...grouped.values()].map(row => ({
      [keyName]: row.name,
      quantity: Number(row.qty.toFixed(3)),
      sales: money(row.sales),
      cost: money(row.cost),
      profit: money(row.sales - row.cost),
      marginPct: percentage(row.sales - row.cost, row.sales),
      salesSharePct: percentage(row.sales, totalSales),
    })).sort((a, b) => b.sales - a.sales);
    return result(
      reportId === "grocery-sales-category" ? "Grocery Sales by Category" : "Grocery Sales by Brand",
      [
        { key: keyName, label: reportId === "grocery-sales-category" ? "Category" : "Brand" },
        { key: "quantity", label: "Quantity" }, { key: "sales", label: "Sales" },
        { key: "cost", label: "Cost" }, { key: "profit", label: "Profit" },
        { key: "marginPct", label: "Margin %" }, { key: "salesSharePct", label: "Sales Share %" },
      ],
      rows,
      [
        { label: "Sales", value: money(totalSales) },
        { label: "Cost", value: money(rows.reduce((sum, row) => sum + row.cost, 0)) },
        { label: "Profit", value: money(rows.reduce((sum, row) => sum + row.profit, 0)) },
        { label: reportId === "grocery-sales-category" ? "Categories" : "Brands", value: rows.length },
      ],
    );
  }

  if (reportId === "grocery-payment-method") {
    const grouped = new Map<string, { invoices: number; sales: number; paid: number; balance: number }>();
    for (const doc of documents) {
      const method = cleanString(doc.paymentMethod) || "Unspecified";
      const row = grouped.get(method) || { invoices: 0, sales: 0, paid: 0, balance: 0 };
      row.invoices += 1;
      row.sales += Number(doc.total || 0);
      row.paid += Number(doc.paid || 0);
      row.balance += Number(doc.balance || 0);
      grouped.set(method, row);
    }
    const totalSales = [...grouped.values()].reduce((sum, row) => sum + row.sales, 0);
    const rows = [...grouped.entries()].map(([paymentMethod, row]) => ({
      paymentMethod,
      invoices: row.invoices,
      sales: money(row.sales),
      paid: money(row.paid),
      balance: money(row.balance),
      collectionPct: percentage(row.paid, row.sales),
      salesSharePct: percentage(row.sales, totalSales),
    })).sort((a, b) => b.sales - a.sales);
    return result(
      "Grocery Payment Method Summary",
      [
        { key: "paymentMethod", label: "Payment Method" }, { key: "invoices", label: "Invoices" },
        { key: "sales", label: "Sales" }, { key: "paid", label: "Paid" },
        { key: "balance", label: "Outstanding" }, { key: "collectionPct", label: "Collection %" },
        { key: "salesSharePct", label: "Sales Share %" },
      ],
      rows,
      [
        { label: "Sales", value: money(totalSales) },
        { label: "Paid", value: money(rows.reduce((sum, row) => sum + row.paid, 0)) },
        { label: "Outstanding", value: money(rows.reduce((sum, row) => sum + row.balance, 0)) },
        { label: "Methods", value: rows.length },
      ],
    );
  }

  if (reportId === "grocery-cashier-sales") {
    const userIds = [...new Set(documents.map(doc => doc.createdByUserId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { businessId, id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const userMap = new Map(users.map(user => [user.id, user]));
    const grouped = new Map<string, { cashier: string; email: string; invoices: number; sales: number; paid: number }>();
    for (const doc of documents) {
      const user = doc.createdByUserId ? userMap.get(doc.createdByUserId) : null;
      const key = doc.createdByUserId || "unassigned";
      const row = grouped.get(key) || { cashier: user?.name || "Unassigned Cashier", email: user?.email || "-", invoices: 0, sales: 0, paid: 0 };
      row.invoices += 1;
      row.sales += Number(doc.total || 0);
      row.paid += Number(doc.paid || 0);
      grouped.set(key, row);
    }
    const totalSales = [...grouped.values()].reduce((sum, row) => sum + row.sales, 0);
    const rows = [...grouped.values()].map(row => ({
      cashier: row.cashier,
      email: row.email,
      invoices: row.invoices,
      sales: money(row.sales),
      paid: money(row.paid),
      averageTicket: money(row.invoices ? row.sales / row.invoices : 0),
      salesSharePct: percentage(row.sales, totalSales),
    })).sort((a, b) => b.sales - a.sales);
    return result(
      "Grocery Cashier Sales",
      [
        { key: "cashier", label: "Cashier" }, { key: "email", label: "Email" },
        { key: "invoices", label: "Invoices" }, { key: "sales", label: "Sales" },
        { key: "paid", label: "Paid" }, { key: "averageTicket", label: "Average Ticket" },
        { key: "salesSharePct", label: "Sales Share %" },
      ],
      rows,
      [{ label: "Sales", value: money(totalSales) }, { label: "Invoices", value: documents.length }, { label: "Cashiers", value: rows.length }],
    );
  }

  const counterIds = [...new Set(documents.map(doc => doc.counterId).filter(Boolean))] as string[];
  const counters = counterIds.length
    ? await prisma.counter.findMany({ where: { businessId, id: { in: counterIds } }, select: { id: true, name: true, code: true } })
    : [];
  const counterMap = new Map(counters.map(counter => [counter.id, counter]));
  const grouped = new Map<string, { terminal: string; code: string; invoices: number; sales: number; paid: number }>();
  for (const doc of documents) {
    const counter = doc.counterId ? counterMap.get(doc.counterId) : null;
    const key = doc.counterId || "unassigned";
    const row = grouped.get(key) || { terminal: counter?.name || "Unassigned Terminal", code: counter?.code || "-", invoices: 0, sales: 0, paid: 0 };
    row.invoices += 1;
    row.sales += Number(doc.total || 0);
    row.paid += Number(doc.paid || 0);
    grouped.set(key, row);
  }
  const totalSales = [...grouped.values()].reduce((sum, row) => sum + row.sales, 0);
  const rows = [...grouped.values()].map(row => ({
    terminal: row.terminal,
    code: row.code,
    invoices: row.invoices,
    sales: money(row.sales),
    paid: money(row.paid),
    averageTicket: money(row.invoices ? row.sales / row.invoices : 0),
    salesSharePct: percentage(row.sales, totalSales),
  })).sort((a, b) => b.sales - a.sales);
  return result(
    "Grocery Terminal / Counter Sales",
    [
      { key: "terminal", label: "Terminal / Counter" }, { key: "code", label: "Code" },
      { key: "invoices", label: "Invoices" }, { key: "sales", label: "Sales" },
      { key: "paid", label: "Paid" }, { key: "averageTicket", label: "Average Ticket" },
      { key: "salesSharePct", label: "Sales Share %" },
    ],
    rows,
    [{ label: "Sales", value: money(totalSales) }, { label: "Invoices", value: documents.length }, { label: "Terminals", value: rows.length }],
  );
}
