import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { transitionGroceryTransfer } from "./grocery-operations.controller.js";

const db: any = prisma;
function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function round2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function round3(v: number) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function json(v: unknown): Record<string, any> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}; }

export async function guardedGroceryTransferTransition(req: Request, res: Response) {
  const businessId = req.tenant?.businessId;
  if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  const target = text(req.body?.status).toUpperCase();
  if (target === "CANCELLED") {
    const row = await db.industryRecord.findFirst({ where: { id: req.params.id, businessId, industryCode: "grocery", entityType: "grocery_stock_transfer", archivedAt: null } });
    if (!row) return res.status(404).json({ ok: false, error: { message: "Transfer not found" } });
    const data = json(row.data);
    if (data.dispatched || ["IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED"].includes(String(row.status).toUpperCase())) {
      return res.status(409).json({ ok: false, error: { message: "A dispatched transfer cannot be cancelled. Receive or reverse it through a controlled stock movement." } });
    }
  }
  return transitionGroceryTransfer(req, res);
}

export async function groceryVanReconciliationV2(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const van = await db.industryRecord.findFirst({ where: { id: req.params.id, businessId, industryCode: "grocery", entityType: "grocery_van", archivedAt: null } });
    if (!van) return res.status(404).json({ ok: false, error: { message: "Van not found" } });
    const [stock, sales, collections, returns, damages, expenses, transfers] = await Promise.all([
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_van_stock", relatedEntityId: van.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_van_sale", relatedEntityId: van.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_van_collection", relatedEntityId: van.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_van_return", relatedEntityId: van.id, archivedAt: null } }),
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_van_damage", relatedEntityId: van.id, archivedAt: null } }),
      db.expense.findMany({ where: { businessId }, orderBy: { expenseDate: "desc" }, take: 10000 }),
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_stock_transfer", archivedAt: null } }),
    ]);
    const vanExpenses = expenses.filter((x: any) => text(json(x.metadata).vanId) === van.id);
    const transferRows = transfers.filter((x: any) => { const d = json(x.data); return d.sourceId === van.id || d.destinationId === van.id; });
    const loadedQty = round3(transferRows.filter((x: any) => json(x.data).destinationId === van.id).reduce((sum: number, x: any) => sum + (json(x.data).lines || []).reduce((s: number, l: any) => s + num(l.receivedQty), 0), 0));
    const unloadedQty = round3(transferRows.filter((x: any) => json(x.data).sourceId === van.id).reduce((sum: number, x: any) => sum + (json(x.data).lines || []).reduce((s: number, l: any) => s + num(l.receivedQty), 0), 0));
    const salesValue = round2(sales.reduce((s: number, x: any) => s + num(x.amount), 0));
    const cashSales = round2(sales.filter((x: any) => text(json(x.data).paymentMethod).toLowerCase() === "cash").reduce((s: number, x: any) => s + num(json(x.data).paid), 0));
    const collectionsValue = round2(collections.reduce((s: number, x: any) => s + num(x.amount), 0));
    const cashCollections = round2(collections.filter((x: any) => text(json(x.data).method).toLowerCase() === "cash").reduce((s: number, x: any) => s + num(x.amount), 0));
    const expenseValue = round2(vanExpenses.reduce((s: number, x: any) => s + num(x.baseAmount || x.amount), 0));
    const remainingStock = stock.map((x: any) => ({ id: x.id, ...json(x.data) }));
    const remainingQty = round3(remainingStock.reduce((s: number, x: any) => s + num(x.qty), 0));
    return res.json({ ok: true, data: {
      van,
      openingLoadQuantity: loadedQty,
      sales: { count: sales.length, value: salesValue, cash: cashSales },
      returns: { count: returns.length, quantity: round3(returns.reduce((s: number, x: any) => s + (json(x.data).items || []).reduce((q: number, i: any) => q + num(i.qty), 0), 0)) },
      damaged: { count: damages.length, quantity: round3(damages.reduce((s: number, x: any) => s + num(json(x.data).qty), 0)) },
      remainingStock,
      remainingQuantity: remainingQty,
      collections: { total: collectionsValue, cash: cashCollections },
      cash: round2(cashSales + cashCollections),
      expenses: expenseValue,
      cashAfterExpenses: round2(cashSales + cashCollections - expenseValue),
      unloadedQuantity: unloadedQty,
      transferCount: transferRows.length,
      variance: null,
      varianceNote: "Enter a physical van closing count before a stock variance can be certified.",
    }});
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: { message: error?.message || "Failed to reconcile van" } });
  }
}
