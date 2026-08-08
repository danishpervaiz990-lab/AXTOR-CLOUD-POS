import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import { postGroceryCustomerPaymentAccounting, postGrocerySaleAccounting } from "../services/grocery-accounting.service.js";

const db: any = prisma;
function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function round2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function round3(v: number) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function json(v: unknown): Record<string, any> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}; }
function tenant(req: Request) { const businessId = req.tenant?.businessId; const userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, e: any, status = 400) { return res.status(status).json({ ok: false, error: { message: e?.message || "Request failed" } }); }

async function van(tx: any, businessId: string, id: string) {
  const row = await tx.industryRecord.findFirst({ where: { id, businessId, industryCode: "grocery", entityType: "grocery_van", archivedAt: null, status: "active" } });
  if (!row) throw new Error("Active van not found");
  return row;
}
async function vanStock(tx: any, businessId: string, vanId: string, productId: string) {
  return tx.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_van_stock", referenceNo: `${vanId}:${productId}`, archivedAt: null } });
}
async function changeVanStock(tx: any, businessId: string, userId: string, vanId: string, product: any, delta: number) {
  const row = await vanStock(tx, businessId, vanId, product.id);
  const current = num(json(row?.data).qty); const next = round3(current + delta);
  if (next < -0.0001) throw new Error(`Insufficient van stock for ${product.name}`);
  const data = { ...json(row?.data), vanId, productId: product.id, sku: product.sku, productName: product.name, qty: Math.max(0, next) };
  if (row) await tx.industryRecord.update({ where: { id: row.id }, data: { data, revision: { increment: 1 }, updatedByUserId: userId } });
  else await tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_van_stock", referenceNo: `${vanId}:${product.id}`, displayName: `${product.name} · Van`, relatedEntityId: vanId, status: "active", data, createdByUserId: userId, updatedByUserId: userId } });
  return { before: current, after: Math.max(0, next) };
}
async function nextDoc(tx: any, businessId: string, prefix: string, entityType: string) {
  const count = await tx.industryRecord.count({ where: { businessId, industryCode: "grocery", entityType } });
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}
async function nextSalesNo(tx: any, businessId: string) {
  const count = await tx.salesDocument.count({ where: { businessId, documentType: "INVOICE" } });
  for (let i = 1; i <= 100; i += 1) {
    const no = `VAN-INV-${String(count + i).padStart(6, "0")}`;
    if (!await tx.salesDocument.findFirst({ where: { businessId, documentNo: no }, select: { id: true } })) return no;
  }
  return `VAN-INV-${Date.now()}`;
}
async function nextReceipt(tx: any, businessId: string) {
  const count = await tx.customerPayment.count({ where: { businessId } });
  for (let i = 1; i <= 100; i += 1) {
    const no = `RCPT-${String(count + i).padStart(6, "0")}`;
    if (!await tx.customerPayment.findFirst({ where: { businessId, receiptNo: no }, select: { id: true } })) return no;
  }
  return `RCPT-${Date.now()}`;
}

export async function createGroceryVanSale(req: Request, res: Response) {
  try {
    const t = tenant(req); const result = await db.$transaction(async (tx: any) => {
      const v = await van(tx, t.businessId, req.params.id); const rawItems = Array.isArray(req.body?.items) ? req.body.items : []; if (!rawItems.length) throw new Error("Van sale items are required");
      const customerId = text(req.body?.customerId) || null; const customer = customerId ? await tx.customer.findFirst({ where: { id: customerId, businessId: t.businessId, active: true } }) : null; if (customerId && !customer) throw new Error("Customer not found");
      let subtotal = 0; let totalCogs = 0; const prepared: any[] = [];
      for (const raw of rawItems) {
        const product = await tx.product.findFirst({ where: { id: text(raw.productId), businessId: t.businessId, deleted: false, active: true } }); if (!product) throw new Error("Van sale product not found");
        const qty = round3(num(raw.qty ?? raw.quantity)); if (qty <= 0) throw new Error(`Quantity must be positive for ${product.name}`); const price = round2(num(raw.unitPrice ?? raw.price, num(product.price))); if (price < 0) throw new Error("Price cannot be negative");
        await changeVanStock(tx, t.businessId, t.userId, v.id, product, -qty); const lineTotal = round2(qty * price); const cogs = round2(qty * num(product.costPrice)); subtotal = round2(subtotal + lineTotal); totalCogs = round2(totalCogs + cogs); prepared.push({ product, qty, price, lineTotal, cogs });
      }
      const discount = round2(Math.max(0, num(req.body?.discount))); if (discount > subtotal) throw new Error("Discount cannot exceed subtotal"); const tax = round2(Math.max(0, num(req.body?.tax))); const total = round2(subtotal - discount + tax);
      const paid = round2(Math.min(total, Math.max(0, num(req.body?.paidAmount, String(req.body?.paymentMethod || "cash").toLowerCase() === "credit" ? 0 : total)))); const balance = round2(total - paid); if (balance > 0 && !customer) throw new Error("A customer is required for van credit sales");
      const documentNo = await nextSalesNo(tx, t.businessId); const paymentMethod = text(req.body?.paymentMethod || (balance > 0 ? "credit" : "cash")).toLowerCase(); const business = await tx.business.findUnique({ where: { id: t.businessId }, select: { currency: true } });
      const metadata = { source: "grocery_van_sale", vanId: v.id, vanCode: json(v.data).code || v.referenceNo, paymentLines: paid > 0 ? [{ method: paymentMethod === "credit" ? "cash" : paymentMethod, amount: paid, accountId: text(req.body?.accountId) || null }] : [], groceryCostSnapshot: { version: 1, capturedAt: new Date().toISOString(), totalCogs, items: prepared.map(x => ({ productId: x.product.id, qty: x.qty, baseQty: x.qty, unitCostBase: num(x.product.costPrice), cogs: x.cogs, source: "van_product_cost_at_post" })) } };
      const document = await tx.salesDocument.create({ data: { businessId: t.businessId, documentNo, documentType: "INVOICE", customerId: customer?.id || null, customerName: customer?.name || "Walk-in Customer", salesmanId: text(json(v.data).salespersonId) || null, salesmanName: text(json(v.data).driver) || null, paymentMethod, currency: business?.currency || "QAR", salesChannel: "van_sales", paymentStatus: balance <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid", stockStatus: "posted", status: balance <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "CREDIT", subtotal, discount, tax, total, paid, balance, baseSubtotal: subtotal, baseDiscount: discount, baseTax: tax, baseTotal: total, basePaid: paid, baseBalance: balance, creditAmount: balance, customerCreditApplied: balance > 0, dueDate: balance > 0 ? new Date(req.body?.dueDate || Date.now()) : null, issuedAt: new Date(), postedAt: new Date(), createdByUserId: t.userId, updatedByUserId: t.userId, metadata, items: { create: prepared.map(x => ({ businessId: t.businessId, productId: x.product.id, sku: x.product.sku, barcode: x.product.barcode, name: x.product.name, unit: x.product.unit || "PCS", qty: x.qty, rate: x.price, price: x.lineTotal, discount: 0, taxRate: 0, tax: 0, total: x.lineTotal })) } }, include: { items: true } });
      if (paid > 0) {
        const receiptNo = await nextReceipt(tx, t.businessId); const payment = await tx.customerPayment.create({ data: { businessId: t.businessId, receiptNo, customerId: customer?.id || null, customerName: customer?.name || "Walk-in Customer", amount: paid, currency: business?.currency || "QAR", exchangeRate: 1, baseAmount: paid, method: paymentMethod === "credit" ? "cash" : paymentMethod, accountId: text(req.body?.accountId) || null, paymentDate: new Date(), allocation: { salesDocumentId: document.id, salesDocumentNo: document.documentNo, vanId: v.id, source: "grocery_van_sale" } } });
        // Cash/card part of the sale is already included in the sale journal; keep payment as operational receipt only.
        await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.van.sale.receipt", entityType: "CustomerPayment", entityId: payment.id, after: { receiptNo, paid } });
      }
      if (balance > 0 && customer) await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: balance } } });
      const accounting = await postGrocerySaleAccounting(tx, { businessId: t.businessId, userId: t.userId, document, cogs: totalCogs });
      const operational = await tx.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_sale", referenceNo: documentNo, displayName: `${documentNo} · ${customer?.name || "Walk-in"}`, relatedEntityId: v.id, status: "posted", startAt: new Date(), amount: total, currency: business?.currency || "QAR", data: { vanId: v.id, salesDocumentId: document.id, customerId: customer?.id || null, total, paid, balance, paymentMethod, itemCount: prepared.length }, createdByUserId: t.userId } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.van.sale", entityType: "VanSale", entityId: operational.id, after: { documentNo, total, paid, balance, accounting } }); return { document, accounting };
    }); return ok(res, result, 201);
  } catch (e) { return fail(res, e); }
}

export async function createGroceryVanCollection(req: Request, res: Response) {
  try {
    const t = tenant(req); const result = await db.$transaction(async (tx: any) => {
      const v = await van(tx, t.businessId, req.params.id); const customerId = text(req.body?.customerId); const amount = round2(num(req.body?.amount)); if (!customerId || amount <= 0) throw new Error("Customer and positive amount are required"); const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: t.businessId, active: true } }); if (!customer) throw new Error("Customer not found"); if (num(customer.balance) > 0 && amount > num(customer.balance) + 0.001) throw new Error("Collection cannot exceed customer balance"); const receiptNo = await nextReceipt(tx, t.businessId); const business = await tx.business.findUnique({ where: { id: t.businessId }, select: { currency: true } }); const method = text(req.body?.paymentMethod || "cash"); const payment = await tx.customerPayment.create({ data: { businessId: t.businessId, receiptNo, customerId, customerName: customer.name, amount, currency: business?.currency || "QAR", exchangeRate: 1, baseAmount: amount, method, accountId: text(req.body?.accountId) || null, referenceNo: text(req.body?.referenceNo) || null, paymentDate: new Date(), allocation: { vanId: v.id, source: "grocery_van_collection", notes: text(req.body?.notes) || null } } }); await tx.customer.update({ where: { id: customer.id }, data: { balance: round2(Math.max(0, num(customer.balance) - amount)) } }); const accounting = await postGroceryCustomerPaymentAccounting(tx, { businessId: t.businessId, userId: t.userId, payment }); await tx.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_collection", referenceNo: receiptNo, displayName: `${customer.name} collection`, relatedEntityId: v.id, status: "posted", amount, currency: business?.currency || "QAR", startAt: new Date(), data: { vanId: v.id, customerId, paymentId: payment.id, method }, createdByUserId: t.userId } }); return { payment, accounting }; }); return ok(res, result, 201);
  } catch (e) { return fail(res, e); }
}

export async function createGroceryVanReturn(req: Request, res: Response) {
  try {
    const t = tenant(req); const result = await db.$transaction(async (tx: any) => { const v = await van(tx, t.businessId, req.params.id); const items = Array.isArray(req.body?.items) ? req.body.items : []; if (!items.length) throw new Error("Return items are required"); const rows = []; for (const raw of items) { const product = await tx.product.findFirst({ where: { id: text(raw.productId), businessId: t.businessId, deleted: false } }); if (!product) throw new Error("Return product not found"); const qty = round3(num(raw.qty ?? raw.quantity)); if (qty <= 0) throw new Error("Return quantity must be positive"); await changeVanStock(tx, t.businessId, t.userId, v.id, product, qty); rows.push({ productId: product.id, sku: product.sku, productName: product.name, qty }); } const referenceNo = await nextDoc(tx, t.businessId, "VRET", "grocery_van_return"); const row = await tx.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_return", referenceNo, displayName: `${v.displayName} return`, relatedEntityId: v.id, status: "posted", startAt: new Date(), data: { vanId: v.id, reason: text(req.body?.reason) || null, sourceSalesDocumentId: text(req.body?.salesDocumentId) || null, items: rows }, createdByUserId: t.userId } }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.van.return", entityType: "VanReturn", entityId: row.id, after: { referenceNo, items: rows } }); return row; }); return ok(res, result, 201);
  } catch (e) { return fail(res, e); }
}

export async function createGroceryVanDamage(req: Request, res: Response) {
  try {
    const t = tenant(req); const result = await db.$transaction(async (tx: any) => { const v = await van(tx, t.businessId, req.params.id); const product = await tx.product.findFirst({ where: { id: text(req.body?.productId), businessId: t.businessId, deleted: false } }); if (!product) throw new Error("Product not found"); const qty = round3(num(req.body?.qty)); if (qty <= 0) throw new Error("Quantity must be positive"); await changeVanStock(tx, t.businessId, t.userId, v.id, product, -qty); const referenceNo = await nextDoc(tx, t.businessId, "VDMG", "grocery_van_damage"); return tx.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_damage", referenceNo, displayName: `${product.name} damaged`, relatedEntityId: v.id, status: "posted", startAt: new Date(), data: { vanId: v.id, productId: product.id, productName: product.name, qty, reason: text(req.body?.reason) || null }, createdByUserId: t.userId } }); }); return ok(res, result, 201);
  } catch (e) { return fail(res, e); }
}

export async function groceryVanReconciliation(req: Request, res: Response) {
  try {
    const t = tenant(req); const v = await van(db, t.businessId, req.params.id); const [stock, sales, collections, returns, damages, expenses, transfers] = await Promise.all([
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_stock", relatedEntityId: v.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_sale", relatedEntityId: v.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_collection", relatedEntityId: v.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_return", relatedEntityId: v.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_damage", relatedEntityId: v.id, archivedAt: null } }),
      db.expense.findMany({ where: { businessId: t.businessId }, orderBy: { expenseDate: "desc" }, take: 5000 }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_stock_transfer", archivedAt: null } }),
    ]);
    const vanExpenses = expenses.filter((x: any) => text(json(x.metadata).vanId) === v.id); const transferRows = transfers.filter((x: any) => { const d = json(x.data); return d.sourceId === v.id || d.destinationId === v.id; });
    const loaded = transferRows.filter((x: any) => json(x.data).destinationId === v.id).reduce((sum: number, x: any) => sum + (json(x.data).lines || []).reduce((s: number, l: any) => s + num(l.receivedQty), 0), 0);
    const unloaded = transferRows.filter((x: any) => json(x.data).sourceId === v.id).reduce((sum: number, x: any) => sum + (json(x.data).lines || []).reduce((s: number, l: any) => s + num(l.qty), 0), 0);
    const salesValue = round2(sales.reduce((s: number, x: any) => s + num(x.amount), 0)); const collected = round2(collections.reduce((s: number, x: any) => s + num(x.amount), 0)); const cashSales = round2(sales.filter((x: any) => text(json(x.data).paymentMethod) === "cash").reduce((s: number, x: any) => s + num(json(x.data).paid), 0)); const expensesValue = round2(vanExpenses.reduce((s: number, x: any) => s + num(x.baseAmount || x.amount), 0));
    return ok(res, { van: v, openingLoadQuantity: round3(loaded), salesValue, salesCount: sales.length, returnsCount: returns.length, damagedQuantity: round3(damages.reduce((s: number, x: any) => s + num(json(x.data).qty), 0)), remainingStock: stock.map((x: any) => json(x.data)), collections: collected, cash: round2(cashSales + collections.filter ? collected : collected), expenses: expensesValue, unloadedQuantity: round3(unloaded), cashAfterExpenses: round2(cashSales + collected - expensesValue), transfers: transferRows, variance: null, varianceNote: "Physical van closing variance requires an entered physical closing count." });
  } catch (e) { return fail(res, e); }
}
