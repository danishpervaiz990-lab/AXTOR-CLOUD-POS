import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const db: any = prisma;
const DAY = 86_400_000;
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function dayStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function customerProfile(customer: any) {
  const p = json(json(customer?.metadata).groceryProfile);
  return { alternateMobile: p.alternateMobile || null, billingAddress: p.billingAddress || customer?.address || null, deliveryAddress: p.deliveryAddress || null, taxVatNumber: p.taxVatNumber || null, priceLevel: p.priceLevel || "retail", loyaltyMembership: p.loyaltyMembership || null, loyaltyPoints: num(p.loyaltyPoints), notes: p.notes || null, blockCreditSalesIfOverdue: Boolean(p.blockCreditSalesIfOverdue), creditWarningDays: Math.max(0, Math.trunc(num(p.creditWarningDays))) };
}
async function ageingCuts(businessId: string) {
  const setting = await db.appSetting.findFirst({ where: { businessId, key: "grocery.ageing.buckets" } });
  const raw = Array.isArray(setting?.value) ? setting.value : json(setting?.value).value;
  const values = Array.isArray(raw) ? raw.map((x: unknown) => Math.max(1, Math.trunc(num(x)))).filter(Boolean).slice(0, 5) : [];
  return values.length === 5 && values.every((x: number, i: number) => i === 0 || x > values[i - 1]) ? values : [7, 15, 30, 60, 90];
}
function bucket(days: number, cuts: number[]) {
  if (days <= 0) return "Current";
  if (days <= cuts[0]) return `1–${cuts[0]} days`;
  if (days <= cuts[1]) return `${cuts[0] + 1}–${cuts[1]} days`;
  if (days <= cuts[2]) return `${cuts[1] + 1}–${cuts[2]} days`;
  if (days <= cuts[3]) return `${cuts[2] + 1}–${cuts[3]} days`;
  if (days <= cuts[4]) return `${cuts[3] + 1}–${cuts[4]} days`;
  return `${cuts[4]}+ days`;
}
type ProfitMetric = { grossProfit: number; cogs: number; exact: boolean; basis: string };
function invoiceProfit(invoice: any): ProfitMetric {
  const snapshot = json(json(invoice.metadata).groceryCostSnapshot);
  if (num(snapshot.version) >= 1 && Number.isFinite(Number(snapshot.totalCogs))) {
    const netSales = round2(num(invoice.subtotal) - num(invoice.discount));
    return { grossProfit: round2(netSales - num(snapshot.totalCogs)), cogs: round2(num(snapshot.totalCogs)), exact: true, basis: "sale_cost_snapshot" };
  }
  let cogs = 0;
  let covered = true;
  for (const item of invoice.items || []) {
    const qty = num(item.qty);
    const batch = item.inventoryBatch;
    if (batch) {
      const multiplier = String(item.unit || "").toLowerCase() === String(batch.smallestUnit || "").toLowerCase() ? 1 : Math.max(1, num(batch.unitsPerStockUnit, 1));
      cogs += qty * multiplier * num(batch.costPerBaseUnit);
    } else if (item.product) {
      cogs += qty * num(item.product.costPrice);
      covered = false;
    } else {
      covered = false;
    }
  }
  const netSales = round2(num(invoice.subtotal) - num(invoice.discount));
  return { grossProfit: round2(netSales - cogs), cogs: round2(cogs), exact: false, basis: covered ? "current_batch_cost_fallback" : "current_cost_fallback" };
}

export async function groceryCustomerDetail(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const customer = await db.customer.findFirst({ where: { id: req.params.id, businessId } });
    if (!customer) return res.status(404).json({ ok: false, error: { message: "Customer not found" } });
    const [invoices, payments, returns, cuts] = await Promise.all([
      db.salesDocument.findMany({ where: { businessId, customerId: customer.id, documentType: "INVOICE", status: { notIn: ["CANCELLED", "VOID"] } }, include: { items: { include: { inventoryBatch: true } } }, orderBy: { issuedAt: "desc" }, take: 1000 }),
      db.customerPayment.findMany({ where: { businessId, customerId: customer.id }, orderBy: { paymentDate: "desc" }, take: 1000 }),
      db.salesReturn.findMany({ where: { businessId, customerId: customer.id }, include: { items: true }, orderBy: { returnDate: "desc" }, take: 1000 }),
      ageingCuts(businessId),
    ]);
    const productIds = [...new Set<string>(invoices.flatMap((invoice: any) => (invoice.items || []).map((item: any) => String(item.productId || "")).filter(Boolean)))];
    const products = productIds.length ? await db.product.findMany({ where: { businessId, id: { in: productIds } } }) : [];
    const productById = new Map<string, any>(products.map((p: any): [string, any] => [String(p.id), p]));
    for (const invoice of invoices) for (const item of invoice.items || []) item.product = item.productId ? productById.get(String(item.productId)) : null;

    const totalPurchases = round2(invoices.reduce((s: number, x: any) => s + num(x.total), 0));
    const totalReturns = round2(returns.reduce((s: number, x: any) => s + num(x.total), 0));
    const totalPayments = round2(payments.reduce((s: number, x: any) => s + num(x.amount), 0));
    const outstanding = round2(invoices.reduce((s: number, x: any) => s + Math.max(0, num(x.balance)), 0));
    const now = dayStart();
    const overdueInvoices = invoices.filter((x: any) => num(x.balance) > 0 && x.dueDate && dayStart(new Date(x.dueDate)) < now);
    const overdueAmount = round2(overdueInvoices.reduce((s: number, x: any) => s + num(x.balance), 0));
    const creditLimit = num(customer.creditLimit);
    const availableCredit = creditLimit > 0 ? Math.max(0, round2(creditLimit - outstanding)) : null;

    const profits: ProfitMetric[] = invoices.map((invoice: any) => invoiceProfit(invoice));
    const grossProfitGenerated = round2(profits.reduce((sum: number, metric: ProfitMetric) => sum + metric.grossProfit, 0));
    const exactProfitInvoices = profits.filter((metric: ProfitMetric) => metric.exact).length;
    const profitCoveragePercentage = invoices.length ? round2(exactProfitInvoices / invoices.length * 100) : 100;

    const productMap = new Map<string, any>();
    for (const invoice of invoices) for (const item of invoice.items || []) {
      const key = String(item.productId || item.sku || item.name);
      const row = productMap.get(key) || { productId: item.productId || null, name: item.name, quantity: 0, sales: 0 };
      row.quantity += num(item.qty); row.sales += num(item.total); productMap.set(key, row);
    }
    const ageing = invoices.filter((x: any) => num(x.balance) > 0).map((x: any) => {
      const due = x.dueDate ? dayStart(new Date(x.dueDate)) : null;
      const overdueDays = due && due < now ? Math.max(0, Math.floor((now.getTime() - due.getTime()) / DAY)) : 0;
      const dueStatus = due ? (due.getTime() === now.getTime() ? "Due Today" : due < now ? "Overdue" : "Not Due") : "Not Due";
      return { invoiceId: x.id, invoiceNo: x.documentNo, invoiceDate: x.issuedAt || x.createdAt, dueDate: x.dueDate, amount: num(x.total), paid: num(x.paid), balance: num(x.balance), overdueDays, dueStatus, bucket: bucket(overdueDays, cuts) };
    });
    const ledger = [
      ...invoices.map((x: any) => ({ date: x.issuedAt || x.createdAt, type: "Invoice", reference: x.documentNo, debit: num(x.total), credit: 0 })),
      ...payments.map((x: any) => ({ date: x.paymentDate, type: "Payment", reference: x.receiptNo, debit: 0, credit: num(x.amount) })),
      ...returns.map((x: any) => ({ date: x.returnDate, type: "Sales Return", reference: x.returnNo, debit: 0, credit: num(x.total) })),
    ].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = num(customer.openingBalance);
    const ledgerWithBalance = ledger.map((x: any) => ({ ...x, balance: round2(running = running + x.debit - x.credit) }));
    const cleanInvoices = invoices.map((x: any) => ({ ...x, items: (x.items || []).map(({ inventoryBatch, product, ...item }: any) => item), total: num(x.total), paid: num(x.paid), balance: num(x.balance) }));

    return res.json({ ok: true, data: {
      customer: { ...customer, creditLimit, creditDays: num(customer.creditDays), openingBalance: num(customer.openingBalance), balance: num(customer.balance), ...customerProfile(customer) },
      summary: { totalPurchases, totalReturns, totalPayments, totalOutstanding: outstanding, overdueAmount, availableCredit, averageInvoiceValue: invoices.length ? round2(totalPurchases / invoices.length) : 0, grossProfitGenerated, grossProfitReturnsAdjustmentIncluded: returns.length === 0, profitCoveragePercentage, profitBasis: profitCoveragePercentage === 100 ? "sale_cost_snapshot" : "snapshot_plus_cost_fallback", lastPurchase: invoices[0]?.issuedAt || invoices[0]?.createdAt || null },
      mostPurchasedProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 20),
      paymentHistory: payments,
      invoiceHistory: cleanInvoices,
      returnHistory: returns.map((x: any) => ({ ...x, total: num(x.total) })),
      ledger: ledgerWithBalance,
      ageing,
      ageingBuckets: cuts,
    }});
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: { message: error?.message || "Failed to load customer detail" } });
  }
}
