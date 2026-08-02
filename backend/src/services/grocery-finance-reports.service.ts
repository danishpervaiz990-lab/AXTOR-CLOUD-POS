import type { SalesDocumentStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, roundMoney } from "../utils/http.js";

const IDS = new Set([
  "grocery-customer-statement",
  "grocery-supplier-statement",
  "grocery-refund-impact",
  "grocery-finance-summary",
]);

const INVALID: SalesDocumentStatus[] = ["DRAFT", "CANCELLED", "VOID"];
const money = (value: unknown) => roundMoney(Number(value || 0));
const pct = (value: unknown, base: unknown) => {
  const denominator = Number(base || 0);
  return Math.abs(denominator) < 0.0000001 ? 0 : roundMoney((Number(value || 0) / denominator) * 100);
};
const result = (title: string, columns: any[], rows: any[], summary: any[] = []) => ({ title, columns, rows, summary });

function qatarRange(query: any) {
  const fromText = cleanString(query.from);
  const toText = cleanString(query.to);
  const now = new Date();
  const fallback = new Date(now.getTime() - 30 * 86400000);
  const from = fromText && /^\d{4}-\d{2}-\d{2}$/.test(fromText)
    ? new Date(`${fromText}T00:00:00.000+03:00`)
    : fallback;
  const to = toText && /^\d{4}-\d{2}-\d{2}$/.test(toText)
    ? new Date(`${toText}T23:59:59.999+03:00`)
    : now;
  return { from, to };
}

export function isGroceryFinanceReport(id: string) {
  return IDS.has(id);
}

export async function runGroceryFinanceReport(businessId: string, id: string, query: any = {}) {
  if (!IDS.has(id)) throw new ApiError(404, "Grocery finance report not found");
  const { from, to } = qatarRange(query);

  if (id === "grocery-customer-statement") {
    const customerId = cleanString(query.customerId);
    const customers = await prisma.customer.findMany({
      where: { businessId, active: true, ...(customerId ? { id: customerId } : {}) },
      select: { id: true, name: true, balance: true, creditLimit: true },
      orderBy: { name: "asc" },
      take: customerId ? 1 : 500,
    });
    const ids = customers.map((row) => row.id);
    const docs = ids.length ? await prisma.salesDocument.findMany({
      where: {
        businessId,
        customerId: { in: ids },
        documentType: "INVOICE",
        status: { notIn: INVALID },
        createdAt: { gte: from, lte: to },
      },
      select: { customerId: true, total: true, paid: true, balance: true, returnedAmount: true, refundedAmount: true },
    }) : [];
    const grouped = new Map<string, any>();
    for (const customer of customers) grouped.set(customer.id, {
      customer: customer.name,
      invoices: 0,
      invoiced: 0,
      paid: 0,
      returned: 0,
      refunded: 0,
      periodOutstanding: 0,
      currentBalance: money(customer.balance),
      creditLimit: money(customer.creditLimit),
    });
    for (const doc of docs) {
      if (!doc.customerId) continue;
      const row = grouped.get(doc.customerId);
      if (!row) continue;
      row.invoices += 1;
      row.invoiced += Number(doc.total || 0);
      row.paid += Number(doc.paid || 0);
      row.returned += Number(doc.returnedAmount || 0);
      row.refunded += Number(doc.refundedAmount || 0);
      row.periodOutstanding += Number(doc.balance || 0);
    }
    const rows = [...grouped.values()].map((row) => ({
      ...row,
      invoiced: money(row.invoiced),
      paid: money(row.paid),
      returned: money(row.returned),
      refunded: money(row.refunded),
      periodOutstanding: money(row.periodOutstanding),
      collectionPct: pct(row.paid, row.invoiced),
      creditUtilizationPct: pct(row.currentBalance, row.creditLimit),
    }));
    return result("Grocery Customer Statement Summary", [
      { key: "customer", label: "Customer" },
      { key: "invoices", label: "Invoices" },
      { key: "invoiced", label: "Invoiced" },
      { key: "paid", label: "Paid" },
      { key: "returned", label: "Returned" },
      { key: "refunded", label: "Refunded" },
      { key: "periodOutstanding", label: "Period Outstanding" },
      { key: "currentBalance", label: "Current Balance" },
      { key: "creditLimit", label: "Credit Limit" },
      { key: "collectionPct", label: "Collection %" },
      { key: "creditUtilizationPct", label: "Credit Used %" },
    ], rows, [
      { label: "Customers", value: rows.length },
      { label: "Invoiced", value: money(rows.reduce((s, r) => s + r.invoiced, 0)) },
      { label: "Paid", value: money(rows.reduce((s, r) => s + r.paid, 0)) },
      { label: "Current Receivables", value: money(rows.reduce((s, r) => s + r.currentBalance, 0)) },
    ]);
  }

  if (id === "grocery-supplier-statement") {
    const supplierId = cleanString(query.supplierId);
    const suppliers = await prisma.supplier.findMany({
      where: { businessId, active: true, ...(supplierId ? { id: supplierId } : {}) },
      select: { id: true, name: true, balance: true },
      orderBy: { name: "asc" },
      take: supplierId ? 1 : 500,
    });
    const ids = suppliers.map((row) => row.id);
    const purchases = ids.length ? await prisma.purchase.findMany({
      where: { businessId, supplierId: { in: ids }, purchaseDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { supplierId: true, total: true, paid: true, balance: true },
    }) : [];
    const grouped = new Map<string, any>();
    for (const supplier of suppliers) grouped.set(supplier.id, {
      supplier: supplier.name,
      purchases: 0,
      purchased: 0,
      paid: 0,
      periodPayable: 0,
      currentBalance: money(supplier.balance),
    });
    for (const purchase of purchases) {
      if (!purchase.supplierId) continue;
      const row = grouped.get(purchase.supplierId);
      if (!row) continue;
      row.purchases += 1;
      row.purchased += Number(purchase.total || 0);
      row.paid += Number(purchase.paid || 0);
      row.periodPayable += Number(purchase.balance || 0);
    }
    const rows = [...grouped.values()].map((row) => ({
      ...row,
      purchased: money(row.purchased),
      paid: money(row.paid),
      periodPayable: money(row.periodPayable),
      paymentPct: pct(row.paid, row.purchased),
    }));
    return result("Grocery Supplier Statement Summary", [
      { key: "supplier", label: "Supplier" },
      { key: "purchases", label: "Purchases" },
      { key: "purchased", label: "Purchased" },
      { key: "paid", label: "Paid" },
      { key: "periodPayable", label: "Period Payable" },
      { key: "currentBalance", label: "Current Balance" },
      { key: "paymentPct", label: "Paid %" },
    ], rows, [
      { label: "Suppliers", value: rows.length },
      { label: "Purchased", value: money(rows.reduce((s, r) => s + r.purchased, 0)) },
      { label: "Paid", value: money(rows.reduce((s, r) => s + r.paid, 0)) },
      { label: "Current Payables", value: money(rows.reduce((s, r) => s + r.currentBalance, 0)) },
    ]);
  }

  if (id === "grocery-refund-impact") {
    const docs = await prisma.salesDocument.findMany({
      where: {
        businessId,
        documentType: "INVOICE",
        status: { notIn: INVALID },
        createdAt: { gte: from, lte: to },
        OR: [{ returnedAmount: { gt: 0 } }, { refundedAmount: { gt: 0 } }],
      },
      select: {
        documentNo: true,
        customerName: true,
        total: true,
        paid: true,
        returnedAmount: true,
        refundedAmount: true,
        returnCount: true,
        returnStatus: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const rows = docs.map((doc) => ({
      invoice: doc.documentNo,
      customer: doc.customerName,
      invoiceTotal: money(doc.total),
      paid: money(doc.paid),
      returned: money(doc.returnedAmount),
      refunded: money(doc.refundedAmount),
      retainedRevenue: money(Number(doc.total || 0) - Number(doc.returnedAmount || 0)),
      returnCount: doc.returnCount,
      returnStatus: doc.returnStatus || "not_returned",
      refundPct: pct(doc.refundedAmount, doc.paid),
    }));
    return result("Grocery Returns & Refund Financial Impact", [
      { key: "invoice", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "invoiceTotal", label: "Invoice Total" },
      { key: "paid", label: "Paid" },
      { key: "returned", label: "Returned" },
      { key: "refunded", label: "Refunded" },
      { key: "retainedRevenue", label: "Retained Revenue" },
      { key: "returnCount", label: "Return Count" },
      { key: "returnStatus", label: "Return Status" },
      { key: "refundPct", label: "Refund % of Paid" },
    ], rows, [
      { label: "Affected Invoices", value: rows.length },
      { label: "Returned", value: money(rows.reduce((s, r) => s + r.returned, 0)) },
      { label: "Refunded", value: money(rows.reduce((s, r) => s + r.refunded, 0)) },
      { label: "Retained Revenue", value: money(rows.reduce((s, r) => s + r.retainedRevenue, 0)) },
    ]);
  }

  const [customers, suppliers, stocks, products, docs] = await Promise.all([
    prisma.customer.aggregate({ where: { businessId, active: true }, _sum: { balance: true } }),
    prisma.supplier.aggregate({ where: { businessId, active: true }, _sum: { balance: true } }),
    prisma.inventoryStock.findMany({ where: { businessId }, select: { productId: true, qtyOnHand: true } }),
    prisma.product.findMany({ where: { businessId, deleted: false }, select: { id: true, costPrice: true } }),
    prisma.salesDocument.findMany({
      where: { businessId, documentType: "INVOICE", status: { notIn: INVALID }, createdAt: { gte: from, lte: to } },
      select: { total: true, paid: true, balance: true, returnedAmount: true, refundedAmount: true, tax: true },
    }),
  ]);
  const costs = new Map(products.map((product) => [product.id, Number(product.costPrice || 0)]));
  const stockValue = money(stocks.reduce((sum, row) => sum + Number(row.qtyOnHand || 0) * (costs.get(row.productId) || 0), 0));
  const sales = money(docs.reduce((sum, row) => sum + Number(row.total || 0), 0));
  const paid = money(docs.reduce((sum, row) => sum + Number(row.paid || 0), 0));
  const outstanding = money(docs.reduce((sum, row) => sum + Number(row.balance || 0), 0));
  const returns = money(docs.reduce((sum, row) => sum + Number(row.returnedAmount || 0), 0));
  const refunds = money(docs.reduce((sum, row) => sum + Number(row.refundedAmount || 0), 0));
  const tax = money(docs.reduce((sum, row) => sum + Number(row.tax || 0), 0));
  const rows = [
    { metric: "Gross Invoice Sales", amount: sales, ratioPct: 100 },
    { metric: "Collected", amount: paid, ratioPct: pct(paid, sales) },
    { metric: "Period Outstanding", amount: outstanding, ratioPct: pct(outstanding, sales) },
    { metric: "Returns", amount: returns, ratioPct: pct(returns, sales) },
    { metric: "Refunds", amount: refunds, ratioPct: pct(refunds, paid) },
    { metric: "Tax", amount: tax, ratioPct: pct(tax, sales) },
    { metric: "Inventory Value", amount: stockValue, ratioPct: pct(stockValue, sales) },
    { metric: "Customer Receivables", amount: money(customers._sum.balance), ratioPct: pct(customers._sum.balance, sales) },
    { metric: "Supplier Payables", amount: money(suppliers._sum.balance), ratioPct: pct(suppliers._sum.balance, sales) },
  ];
  return result("Grocery Finance Reconciliation Summary", [
    { key: "metric", label: "Metric" },
    { key: "amount", label: "Amount" },
    { key: "ratioPct", label: "Ratio %" },
  ], rows, [
    { label: "Sales", value: sales },
    { label: "Collection %", value: pct(paid, sales), format: "percent" },
    { label: "Returns", value: returns },
    { label: "Refunds", value: refunds },
    { label: "Inventory Value", value: stockValue },
  ]);
}
